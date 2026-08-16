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
/* eslint-disable import/first -- the mock above must be hoisted before these */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { GENERIC_AUTH_ERROR } from "@/lib/authError";
import {
  selectExperience, selectFocus, selectHomeCentreId, selectTestDate, useSession,
} from "../sessionStore";
/* eslint-enable import/first */

const signedIn = { user: { id: "u1", email: "a@b.com" } } as never;

test("init loads session and marks initialized", async () => {
  await useSession.getState().init();
  expect(useSession.getState().initialized).toBe(true);
  expect(useSession.getState().session).toBeNull();
});

test("signIn returns null on success, message on failure", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: { user: {} } }, error: null })
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
  expect(await useSession.getState().signIn("a@b.com", "pw")).toBeNull();
  expect(await useSession.getState().signIn("a@b.com", "bad"))
    .toBe("That email and password don't match. Check the password, or reset it below.");
});

// The store is the boundary. A raw Supabase message reaching a caller means
// some screen, some day, renders it.
test("a failed sign-in reports a sentence, not Supabase's message", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
  const err = await useSession.getState().signIn("a@b.com", "bad");
  expect(err).toBe("That email and password don't match. Check the password, or reset it below.");
});

test("an unrecognised failure is still a sentence", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "PGRST301 JWSInvalidSignature" } });
  expect(await useSession.getState().signIn("a@b.com", "x")).toBe(GENERIC_AUTH_ERROR);
});

// Without this, an account with a mistyped password has no way back in.
test("sendPasswordReset asks Supabase for a link back into the app", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValueOnce({ error: null });
  expect(await useSession.getState().sendPasswordReset("  A@B.com ")).toBeNull();
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    "a@b.com",
    { redirectTo: "routeready://auth-callback" }
  );
});

test("sendPasswordReset reports a failure as a sentence", async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock)
    .mockResolvedValueOnce({ error: { message: "Email rate limit exceeded" } });
  expect(await useSession.getState().sendPasswordReset("a@b.com"))
    .toBe("Too many emails just now. Wait a minute, then try again.");
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

test("signUp carries the interview's answers with it", async () => {
  (supabase.auth.signUp as jest.Mock).mockResolvedValueOnce({ data: {}, error: null });
  const metadata = {
    full_name: "Sumeet", home_centre_id: "c-1",
    test_date: "2026-09-24", experience: "ready", focus: ["zebra"],
  };
  expect(await useSession.getState().signUp(" A@B.com ", "hunter2hunter2", metadata)).toBeNull();
  expect(supabase.auth.signUp).toHaveBeenCalledWith({
    email: "a@b.com",
    password: "hunter2hunter2",
    options: { data: metadata },
  });
});

test("a failed signUp reports a sentence", async () => {
  (supabase.auth.signUp as jest.Mock)
    .mockResolvedValueOnce({ data: {}, error: { message: "User already registered" } });
  expect(await useSession.getState().signUp("a@b.com", "pw", {}))
    .toBe("There's already an account with that email. Sign in instead, or reset the password.");
});

// user_metadata is free-form and every account created before this shipped has
// none of these keys. Every reader narrows, exactly as selectFullName does.
test("the selectors narrow whatever user_metadata actually holds", () => {
  useSession.setState({
    session: { user: { user_metadata: { home_centre_id: "c-1", test_date: "2026-09-24", experience: "ready", focus: ["zebra", "narrow"] } } },
  } as never);
  const s = useSession.getState();
  expect(selectHomeCentreId(s)).toBe("c-1");
  expect(selectTestDate(s)).toBe("2026-09-24");
  expect(selectExperience(s)).toBe("ready");
  expect(selectFocus(s)).toEqual(["zebra", "narrow"]);
});

test("an account that predates the interview reads as empty, not as broken", () => {
  useSession.setState({ session: { user: { user_metadata: {} } } } as never);
  const s = useSession.getState();
  expect(selectHomeCentreId(s)).toBeNull();
  expect(selectTestDate(s)).toBeNull();
  expect(selectExperience(s)).toBeNull();
  expect(selectFocus(s)).toEqual([]);
});

// Metadata is a free-form bag; a wrong type in it must not reach a screen.
test("a value of the wrong shape is discarded rather than passed on", () => {
  useSession.setState({
    session: { user: { user_metadata: { home_centre_id: 42, experience: "astronaut", focus: "zebra" } } },
  } as never);
  const s = useSession.getState();
  expect(selectHomeCentreId(s)).toBeNull();
  expect(selectExperience(s)).toBeNull();
  expect(selectFocus(s)).toEqual([]);
});
