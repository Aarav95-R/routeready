jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    functions: { invoke: jest.fn() },
  },
}));
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { authError } from "@/lib/authError";
import { selectUserId, useSession } from "../sessionStore";

const signedIn = { user: { id: "u1", email: "a@b.com" } } as never;

test("init loads session and marks initialized", async () => {
  await useSession.getState().init();
  expect(useSession.getState().initialized).toBe(true);
  expect(useSession.getState().session).toBeNull();
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

/**
 * The most serious gap on the old sign-in screen: `resetPasswordForEmail` was
 * wired nowhere — no link, no screen, no action — so an account whose password
 * was mistyped at sign-up could not be recovered inside the app at all.
 */
test("sendPasswordReset asks Supabase for a link back into the app", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });
  expect(await useSession.getState().sendPasswordReset("a@b.com")).toBeNull();
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
    redirectTo: "routeready://auth-callback",
  });
});

test("a rejected reset says why in a sentence", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock)
    .mockResolvedValue({ error: { message: "Email rate limit exceeded" } });
  expect(await useSession.getState().sendPasswordReset("a@b.com")).toBe(authError("Email rate limit exceeded"));
});

// The root layout redirects to sign-in off `session` alone. If signOut leaves
// it set, the button does nothing visible and the user is stuck inside an
// account they have asked to leave.
test("signing out clears the session", async () => {
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

test("sendMagicLink passes redirect", async () => {
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  await useSession.getState().sendMagicLink("a@b.com");
  expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "a@b.com",
    options: { emailRedirectTo: "routeready://auth-callback" },
  });
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
