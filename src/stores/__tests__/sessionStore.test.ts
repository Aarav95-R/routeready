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
