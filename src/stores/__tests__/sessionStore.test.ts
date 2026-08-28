jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      setSession: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      verifyOtp: jest.fn(),
      resend: jest.fn(),
    },
    functions: { invoke: jest.fn() },
  },
}));
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { authError, AUTH_TIMEOUT } from "@/lib/authError";
import { SESSION_RESTORE_DEADLINE_MS, SIGN_IN_DEADLINE_MS, selectUserId, useSession } from "../sessionStore";

const signedIn = { user: { id: "u1", email: "a@b.com" } } as never;

test("init loads session and marks initialized", async () => {
  await useSession.getState().init();
  expect(useSession.getState().initialized).toBe(true);
  expect(useSession.getState().session).toBeNull();
});

/**
 * ── The launch path ───────────────────────────────────────────────────────
 *
 * `initialized` gates the entire app: app/_layout.tsx renders a bare coloured
 * View until it flips true. So `init` is not a screen that can afford to be
 * slow — it is the difference between an app that opens and an app that does
 * not, and both of the ways it could fail ended there.
 *
 * `getSession()` reaches the network whenever the stored access token has
 * expired, which is every launch more than an hour after the last one. It had
 * no deadline, so a quiet Auth service meant a blank screen for as long as it
 * stayed quiet; and it had no catch, so a *rejected* refresh skipped the
 * `set` entirely and left that screen blank for good — force-quitting only
 * ran the same path again.
 *
 * Nothing in `init` may leave `initialized` false.
 */
test("a session restore that never answers still opens the app", async () => {
  jest.useFakeTimers();
  try {
    (supabase.auth.getSession as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    useSession.setState({ initialized: false, session: null });

    const done = useSession.getState().init();
    await jest.advanceTimersByTimeAsync(SESSION_RESTORE_DEADLINE_MS);
    await done;

    expect(useSession.getState().initialized).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

// The worse of the two, because it never recovered on its own: a throw skipped
// the `set` and the app stayed on a blank screen permanently.
test("a session restore that rejects still opens the app", async () => {
  (supabase.auth.getSession as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
  useSession.setState({ initialized: false, session: null });

  await useSession.getState().init();

  expect(useSession.getState().initialized).toBe(true);
  expect(useSession.getState().session).toBeNull();
});

/**
 * What makes the deadline affordable.
 *
 * Giving up on the restore sends a signed-in person to sign-in, which would
 * be its own bug if it were the end of it. It is not: the listener is
 * registered ahead of the restore rather than behind it, so a refresh that
 * lands late is still announced, and whoever was bounced to sign-in is picked
 * up and carried into the app without touching anything.
 */
test("a session that arrives after the deadline still signs the person in", async () => {
  jest.useFakeTimers();
  try {
    (supabase.auth.getSession as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    let announce: ((event: string, session: unknown) => void) | undefined;
    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementationOnce((cb) => {
      announce = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    useSession.setState({ initialized: false, session: null });

    const done = useSession.getState().init();
    await jest.advanceTimersByTimeAsync(SESSION_RESTORE_DEADLINE_MS);
    await done;
    expect(useSession.getState().session).toBeNull();

    announce!("TOKEN_REFRESHED", signedIn);

    expect(useSession.getState().session).toBe(signedIn);
  } finally {
    jest.useRealTimers();
  }
});

/**
 * The store is the choke point, not the screens.
 *
 * Every auth action used to return `error.message` verbatim and every screen
 * rendered it, so a mistyped password produced "Invalid login credentials" in
 * front of a learner. Mapping here rather than at each call site means no
 * screen can leak a raw one by forgetting to ask.
 */
test("signIn returns null on success, and a written sentence on failure", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: { user: {} } }, error: null })
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
  expect(await useSession.getState().signIn("a@b.com", "pw")).toBeNull();

  const failure = await useSession.getState().signIn("a@b.com", "bad");
  expect(failure).toBe(authError("Invalid login credentials"));
  expect(failure).not.toBe("Invalid login credentials");
});

/**
 * The sign-out bug below, at the other door.
 *
 * `signInWithPassword` carried no deadline of its own, so an Auth service
 * that accepts the connection and then goes quiet left the button spinning on
 * "Signing in…" until React Native's fetch gave up — about a minute — with
 * nothing said and nothing to retry. That is not hypothetical: this project's
 * own Auth service was measured answering `/auth/v1/health` in 52–86 seconds
 * while the database beside it stayed under 300ms.
 *
 * A deadline turns that minute into a sentence.
 */
test("a server that never answers hands sign-in back with something to read", async () => {
  jest.useFakeTimers();
  try {
    (supabase.auth.signInWithPassword as jest.Mock).mockReturnValueOnce(new Promise(() => {}));

    const pending = useSession.getState().signIn("a@b.com", "pw");
    await jest.advanceTimersByTimeAsync(SIGN_IN_DEADLINE_MS);

    expect(await pending).toBe(AUTH_TIMEOUT);
  } finally {
    jest.useRealTimers();
  }
});

// The other half of the same guarantee. A deadline is no use if the throw it
// was added around escapes instead: the screen awaits `signIn` to clear its
// own `busy`, so a rejection thrown past it leaves the spinner running for
// good — a worse outcome than the hang this replaces. Airplane mode is the
// everyday way to get one.
test("a sign-in that rejects is a sentence, not a throw", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockRejectedValueOnce(new Error("Network request failed"));
  expect(await useSession.getState().signIn("a@b.com", "pw")).toBe(authError("Network request failed"));
});

// The contract the whole interview exists to satisfy, and the one thing a
// mock cannot fake on a device: four answers and a name reaching Supabase in
// the one call that creates the account.
test("signUp carries the interview's answers into user_metadata", async () => {
  (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: {}, error: null });
  const metadata = {
    full_name: "Sam",
    home_centre_id: "c-1",
    test_window: "two_weeks",
    experience: "progressing",
    focus: ["roundabout", "junction"],
  };

  expect(await useSession.getState().signUp("a@b.com", "hunter2hunter2", metadata)).toBeNull();
  expect(supabase.auth.signUp).toHaveBeenCalledWith({
    email: "a@b.com",
    password: "hunter2hunter2",
    options: { data: metadata },
  });
});

test("a rejected sign-up is a sentence too", async () => {
  (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: {}, error: { message: "User already registered" } });
  expect(await useSession.getState().signUp("a@b.com", "pw", {})).toBe(authError("User already registered"));
});

test("a rejected reset says why in a sentence", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock)
    .mockResolvedValue({ error: { message: "Email rate limit exceeded" } });
  expect(await useSession.getState().sendPasswordReset("a@b.com")).toBe(authError("Email rate limit exceeded"));
});

test("updatePassword clears the recovery flag on success", async () => {
  (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
  useSession.setState({ recovering: true });
  expect(await useSession.getState().updatePassword("new-password-1")).toBeNull();
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
  expect(useSession.getState().recovering).toBe(false);
});

test("a rejected password update leaves recovery in place, with a sentence to show", async () => {
  (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: { message: "Password should be at least 8 characters" } });
  useSession.setState({ recovering: true });
  const failure = await useSession.getState().updatePassword("short");
  expect(failure).toBe(authError("Password should be at least 8 characters"));
  expect(useSession.getState().recovering).toBe(true);
});

// The root layout redirects to sign-in off `session` alone. If signOut leaves
// it set, the button does nothing visible and the user is stuck inside an
// account they have asked to leave.
test("signing out clears the session", async () => {
  useSession.setState({ session: signedIn });
  await useSession.getState().signOut();
  expect(useSession.getState().session).toBeNull();
});

// A recovery link opened on the wrong device, or by mistake, has to be
// escapable. Signing out from the update-password screen is that escape
// hatch, and it only works if it also drops the flag forcing that screen.
test("signing out during recovery drops the flag along with the session", async () => {
  useSession.setState({ session: signedIn, recovering: true });
  await useSession.getState().signOut();
  expect(useSession.getState().recovering).toBe(false);
});

/**
 * The failure that made "Sign out" look like a dead button.
 *
 * A hung Auth service does not reject and does not resolve — the POST to
 * `/auth/v1/logout` simply never answers, and React Native waits about a
 * minute before giving up. The store awaited that call before clearing
 * anything, so for that whole minute the button did nothing observable.
 *
 * That was first answered with a four-second grace, which turned a minute of
 * nothing into four seconds of nothing. The grace is gone now, because the
 * wait was never necessary: signing out is a local act, and the revoke is a
 * courtesy told in the background. No timers are advanced below — the
 * teardown no longer sits behind the round trip at all.
 */
test("signing out does not wait for the server at all", async () => {
  (supabase.auth.signOut as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
  useSession.setState({ session: signedIn });

  await useSession.getState().signOut();

  expect(useSession.getState().session).toBeNull();
});

// The revoke is still sent. Dropping it would leave the refresh token live
// until it expired, which on a shared phone is the difference between signing
// out and appearing to.
test("signing out still tells the server, in the background", async () => {
  (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({ error: null });
  useSession.setState({ session: signedIn });

  await useSession.getState().signOut();

  expect(supabase.auth.signOut).toHaveBeenCalled();
});

// The local sweep is not allowed to strand anyone either: a failed disk write
// is not a reason to stay signed in to an account somebody asked to leave.
test("a teardown that throws still signs the person out", async () => {
  // The module mock's own queue, not a spy over it: `jest.spyOn` on a function
  // that is already a mock leaves it returning undefined once restored, which
  // silently breaks every later test that reads a key back.
  (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error("disk full"));
  useSession.setState({ session: signedIn });

  await useSession.getState().signOut();

  expect(useSession.getState().session).toBeNull();
});

// The third way the call can misbehave, and the one a bare `.catch()` misses:
// throwing before it ever returns a promise. `jest.setup.js` stubs the whole
// client as `{}` for screen suites, so `supabase.auth.signOut` is not a
// function there — and a sign-out that throws on the way out would strand the
// person exactly as surely as one that hangs.
test("a client that throws on the way out still signs the person out", async () => {
  (supabase.auth.signOut as jest.Mock).mockImplementationOnce(() => { throw new TypeError("no auth"); });
  useSession.setState({ session: signedIn });
  await useSession.getState().signOut();
  expect(useSession.getState().session).toBeNull();
});

// Supabase reports a failed round-trip two ways — a rejected promise and an
// `{ error }` result — and neither is a reason to keep someone signed in on
// this device.
test("signing out with no network still clears the session", async () => {
  (supabase.auth.signOut as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
  useSession.setState({ session: signedIn });
  await useSession.getState().signOut();
  expect(useSession.getState().session).toBeNull();

  (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({ error: { message: "Network request failed" } });
  useSession.setState({ session: signedIn });
  await useSession.getState().signOut();
  expect(useSession.getState().session).toBeNull();
});

test("signing out takes this user's cached scores off the device", async () => {
  await AsyncStorage.setItem("cache:progress:c1", JSON.stringify({ r1: [] }));
  useSession.setState({ session: signedIn });
  await useSession.getState().signOut();
  expect(await AsyncStorage.getItem("cache:progress:c1")).toBeNull();
});

// "" rather than null: `services/welcome` keys a per-account flag on this, and
// a null that reached a template string would file everybody signed out under
// one shared key.
test("selectUserId is the account id, and an empty string when there is nobody", () => {
  useSession.setState({ session: null });
  expect(selectUserId(useSession.getState())).toBe("");
  useSession.setState({ session: signedIn });
  expect(selectUserId(useSession.getState())).toBe("u1");
});

// ── Account deletion ───────────────────────────────────────────────────────
//
// Every test here drives real AsyncStorage rather than spying on the teardown
// functions, because the claim being made is about what is left on the phone,
// not about which functions were called.

const signedInUser = { user: { id: "u1", email: "a@b.com" } } as never;

async function seedALifeOnThisPhone() {
  await AsyncStorage.setItem("cache:progress:c1", JSON.stringify({ r1: [{ score: 82 }] }));
  await AsyncStorage.setItem("cache:progress:quiz", JSON.stringify({ answers: {} }));
  await AsyncStorage.setItem("queue:progress_outbox", JSON.stringify([{ route_id: "r1" }]));
  await AsyncStorage.setItem("welcome:u1", "1");
  await AsyncStorage.setItem("cache:centres", JSON.stringify([{ id: "c1" }]));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  (supabase.functions.invoke as jest.Mock).mockReset();
  useSession.setState({ session: signedInUser, initialized: true });
});

test("deleting the account signs the person out and reports no error", async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });

  expect(await useSession.getState().deleteAccount()).toBeNull();

  expect(supabase.functions.invoke).toHaveBeenCalledWith("delete-account", expect.anything());
  expect(useSession.getState().session).toBeNull();
});

// The whole authorisation model. The Edge Function reads the account to delete
// from the caller's token; sending an id would invite a server that trusted it.
test("the request carries no account id — the token is the only thing that decides", async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });

  await useSession.getState().deleteAccount();

  const [, options] = (supabase.functions.invoke as jest.Mock).mock.calls[0];
  expect(JSON.stringify(options ?? {})).not.toContain("u1");
});

// Sign-out spares the outbox and the welcome flag on purpose. Deletion is the
// case where sparing them means leaving a deleted person's data on the phone.
test("deletion takes everything of theirs off the phone, including what sign-out spares", async () => {
  await seedALifeOnThisPhone();
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });

  await useSession.getState().deleteAccount();

  const keys = await AsyncStorage.getAllKeys();
  expect(keys).not.toContain("cache:progress:c1");
  expect(keys).not.toContain("cache:progress:quiz");
  expect(keys).not.toContain("queue:progress_outbox");
  expect(keys).not.toContain("welcome:u1");
});

test("the country's data is not personal, and stays put", async () => {
  await seedALifeOnThisPhone();
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });

  await useSession.getState().deleteAccount();

  expect(await AsyncStorage.getAllKeys()).toContain("cache:centres");
});

// The asymmetry the whole ordering is built on. Nothing has been destroyed
// yet, so a failed call must leave the account exactly as it was.
test("a server failure destroys nothing and leaves the person signed in", async () => {
  await seedALifeOnThisPhone();
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: null, error: { message: "The account could not be deleted." },
  });

  const message = await useSession.getState().deleteAccount();

  expect(message).not.toBeNull();
  expect(useSession.getState().session).not.toBeNull();
  const keys = await AsyncStorage.getAllKeys();
  expect(keys).toContain("cache:progress:c1");
  expect(keys).toContain("queue:progress_outbox");
  expect(keys).toContain("welcome:u1");
});

test("being offline is reported as a connection problem, not a failure to delete", async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: null, error: { message: "Failed to send a request to the Edge Function" },
  });

  expect(await useSession.getState().deleteAccount()).toMatch(/connection/i);
  expect(useSession.getState().session).not.toBeNull();
});

test("a raw server string never reaches the person", async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: null, error: { message: "FunctionsHttpError: non-2xx status code" },
  });

  const message = await useSession.getState().deleteAccount();

  expect(message).not.toContain("FunctionsHttpError");
});

// Past the server call the account is gone. A disk that will not clear is not
// a reason to strand somebody inside an account that no longer exists.
test("a failed local teardown still signs the person out", async () => {
  await seedALifeOnThisPhone();
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { deleted: true }, error: null });
  const spy = jest.spyOn(AsyncStorage, "multiRemove").mockRejectedValue(new Error("disk"));

  expect(await useSession.getState().deleteAccount()).toBeNull();
  expect(useSession.getState().session).toBeNull();

  spy.mockRestore();
});

/**
 * ── Codes ─────────────────────────────────────────────────────────────────
 *
 * The session is set from the verify result rather than left to the auth
 * listener. Both do fire in the real client, but the listener is the slower
 * of the two and the screen navigates on the store, so trusting only the
 * listener puts a frame of "signed in but still on the code screen" in front
 * of every person who gets their code right.
 */
test("a good signup code opens a session", async () => {
  const session = { user: { id: "u1" } };
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session }, error: null });

  expect(await useSession.getState().verifyCode("a@b.com", "418302", "signup")).toBeNull();

  expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "418302", type: "signup" });
  expect(useSession.getState().session).toBe(session);
  expect(useSession.getState().recovering).toBe(false);
});

// Same call, one different consequence — exactly as the old deep-link path
// treated `type === "recovery"`. Without this the person lands in the app on
// the password they could not remember.
test("a good recovery code routes to setting a new password", async () => {
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });

  await useSession.getState().verifyCode("a@b.com", "418302", "recovery");

  expect(useSession.getState().recovering).toBe(true);
});

test("a refused code is a sentence and changes nothing", async () => {
  useSession.setState({ session: null, recovering: false });
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
    data: { session: null }, error: { message: "Token has expired or is invalid" },
  });

  expect(await useSession.getState().verifyCode("a@b.com", "000000", "recovery"))
    .toBe(authError("Token has expired or is invalid"));
  expect(useSession.getState().session).toBeNull();
  expect(useSession.getState().recovering).toBe(false);
});

/**
 * The deleted link-era code carried this guard explicitly: a token that
 * fails to open a session without setting `error` — Supabase does not
 * promise one is always present — must not still flag `recovering`, or the
 * person is stranded on update-password with no session under it, leavable
 * only by signing out.
 */
test("a verify response with no session does not flag recovering", async () => {
  useSession.setState({ session: null, recovering: false });
  (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });

  expect(await useSession.getState().verifyCode("a@b.com", "418302", "recovery")).toBeNull();
  expect(useSession.getState().session).toBeNull();
  expect(useSession.getState().recovering).toBe(false);
});

/**
 * `verifyCode` and `resendCode` used to await Supabase directly, with neither
 * a deadline nor a `try` — the same shape `signIn` was fixed for above, on
 * the same Auth service that measured 52-86 seconds on a plain health check.
 * Both screens clear their own busy flag on the line after the await, so a
 * hang here left the code field dimmed and inert for good, and an escaped
 * throw was worse than the hang it replaced.
 */
test("a verify that never answers hands back something to read", async () => {
  jest.useFakeTimers();
  try {
    (supabase.auth.verifyOtp as jest.Mock).mockReturnValueOnce(new Promise(() => {}));

    const pending = useSession.getState().verifyCode("a@b.com", "418302", "signup");
    await jest.advanceTimersByTimeAsync(SIGN_IN_DEADLINE_MS);

    expect(await pending).toBe(AUTH_TIMEOUT);
  } finally {
    jest.useRealTimers();
  }
});

test("a verify that rejects is a sentence, not a throw", async () => {
  (supabase.auth.verifyOtp as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
  expect(await useSession.getState().verifyCode("a@b.com", "418302", "signup"))
    .toBe(authError("Network request failed"));
});

test("a resend that never answers hands back something to read", async () => {
  jest.useFakeTimers();
  try {
    (supabase.auth.resend as jest.Mock).mockReturnValueOnce(new Promise(() => {}));

    const pending = useSession.getState().resendCode("a@b.com", "signup");
    await jest.advanceTimersByTimeAsync(SIGN_IN_DEADLINE_MS);

    expect(await pending).toBe(AUTH_TIMEOUT);
  } finally {
    jest.useRealTimers();
  }
});

test("a resend that rejects is a sentence, not a throw", async () => {
  (supabase.auth.resend as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
  expect(await useSession.getState().resendCode("a@b.com", "signup"))
    .toBe(authError("Network request failed"));
});

/**
 * Three flows, three different ways to ask again. `auth.resend` covers signup
 * only; recovery and magic link are re-sent by calling the same function that
 * sent them the first time.
 */
test("resending a signup code uses resend", async () => {
  (supabase.auth.resend as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().resendCode("a@b.com", "signup")).toBeNull();
  expect(supabase.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.com" });
});

test("resending a recovery code asks for another reset", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().resendCode("a@b.com", "recovery")).toBeNull();
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com");
});

test("resending a magic code asks for another one", async () => {
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().resendCode("a@b.com", "email")).toBeNull();
  expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.com" });
});

// max_frequency is 60s on the project, so this is the common answer to an
// impatient second tap, not an edge case.
test("resending too soon is a sentence", async () => {
  (supabase.auth.resend as jest.Mock).mockResolvedValue({
    error: { message: "For security purposes, you can only request this after 41 seconds" },
  });
  expect(await useSession.getState().resendCode("a@b.com", "signup")).toMatch(/give it a minute/i);
});

/**
 * No emailed link exists any more, so a redirect on any of these is a leftover
 * pointing at a screen that has been deleted.
 */
test("nothing asks Supabase to redirect anywhere", async () => {
  (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });

  await useSession.getState().signUp("a@b.com", "hunter2hunter2", { full_name: "Sam" });
  await useSession.getState().sendMagicLink("a@b.com");
  await useSession.getState().sendPasswordReset("a@b.com");

  expect(JSON.stringify((supabase.auth.signUp as jest.Mock).mock.calls)).not.toMatch(/redirect/i);
  expect(JSON.stringify((supabase.auth.signInWithOtp as jest.Mock).mock.calls)).not.toMatch(/redirect/i);
  expect(JSON.stringify((supabase.auth.resetPasswordForEmail as jest.Mock).mock.calls)).not.toMatch(/redirect/i);
});
