jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { configure: jest.fn(), signIn: jest.fn() },
}));

import * as Apple from "expo-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import {
  appleAvailable, appleCredential, CANCELLED, googleConfigured, googleCredential,
  MISCONFIGURED, NO_TOKEN,
} from "../socialAuth";

const signIn = Apple.signInAsync as jest.Mock;
const available = Apple.isAvailableAsync as jest.Mock;
const google = GoogleSignin.signIn as jest.Mock;

/** What the native sheet throws when somebody swipes it away. */
const cancelled = (code: string) => Object.assign(new Error("The user canceled"), { code });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "ios.apps.googleusercontent.com";
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web.apps.googleusercontent.com";
});

/**
 * ── Cancelling is not failing ─────────────────────────────────────────────
 *
 * The single most important thing in this file. Backing out of a provider
 * sheet is the most ordinary thing a person can do there — they tapped the
 * wrong button, or thought better of it — and it must leave the screen exactly
 * as it was. If a cancel arrived at the store as an error, the sign-in screen
 * would paint a red sentence accusing somebody of a failure they did not have,
 * every time they changed their mind.
 *
 * So a cancel is a resolved `CANCELLED`, not a rejection, for the same reason
 * `withTimeout` resolves `TIMED_OUT`: a caller cannot get at the credential
 * without having handled the case first.
 */
test("a cancelled Apple sheet reports cancelled, not an error", async () => {
  signIn.mockRejectedValueOnce(cancelled("ERR_REQUEST_CANCELED"));
  await expect(appleCredential()).resolves.toBe(CANCELLED);
});

// Older Expo runtimes spell it with two Ls. Both are the same act, and the one
// we do not recognise is the one that reads as a failure to the person.
test("a cancelled Apple sheet reports cancelled under either spelling", async () => {
  signIn.mockRejectedValueOnce(cancelled("ERR_REQUEST_CANCELLED"));
  await expect(appleCredential()).resolves.toBe(CANCELLED);
});

test("a cancelled Google sheet reports cancelled, not an error", async () => {
  google.mockResolvedValueOnce({ type: "cancelled" });
  await expect(googleCredential()).resolves.toBe(CANCELLED);
});

/**
 * ── The name Apple hands over exactly once ────────────────────────────────
 *
 * Apple returns `fullName` on the first consent for an app and never again —
 * every later sign-in carries `null` there, even for the same person. So the
 * one moment it arrives is the only moment it can be saved, and a caller
 * cannot tell "no name" from "not this time" by looking at the account later.
 */
test("Apple's name is assembled on first consent", async () => {
  signIn.mockResolvedValueOnce({
    identityToken: "apple-token",
    authorizationCode: "code-1",
    fullName: { givenName: "Aarav", familyName: "Raheja" },
  });
  await expect(appleCredential()).resolves.toEqual({
    idToken: "apple-token", fullName: "Aarav Raheja", authorizationCode: "code-1",
  });
});

/**
 * ── The code that only exists for deletion day ────────────────────────────
 *
 * Apple's `authorizationCode` is the only thing that can ever be traded for a
 * refresh token, and a refresh token is the only thing App Store guideline
 * 5.1.1(v) can be satisfied with. The native sign-in flow has no other use for
 * it — Supabase signs the person in from the `identityToken` alone — so it is
 * carried purely so the server can exchange it before it expires, which it
 * does about five minutes from now.
 */
test("Apple's authorization code is carried, for the revoke path", async () => {
  signIn.mockResolvedValueOnce({ identityToken: "t", authorizationCode: "code-1", fullName: null });
  await expect(appleCredential()).resolves.toMatchObject({ authorizationCode: "code-1" });
});

// Absent rather than "" — the caller's question is whether there is a code
// worth sending, and a missing one must not become an empty round trip.
test("a missing authorization code is absent, not empty", async () => {
  signIn.mockResolvedValueOnce({ identityToken: "t", authorizationCode: null, fullName: null });
  await expect(appleCredential()).resolves.toEqual({ idToken: "t", fullName: "" });
});

// Google has no equivalent and needs none: guideline 5.1.1(v) is Apple's, and
// Google is not revoked on deletion.
test("Google carries no authorization code", async () => {
  google.mockResolvedValueOnce({ type: "success", data: { idToken: "t", user: { name: "Aarav" } } });
  await expect(googleCredential()).resolves.toEqual({ idToken: "t", fullName: "Aarav" });
});

test("a given name alone is a name", async () => {
  signIn.mockResolvedValueOnce({ identityToken: "t", fullName: { givenName: "Aarav", familyName: null } });
  await expect(appleCredential()).resolves.toEqual({ idToken: "t", fullName: "Aarav" });
});

// Every sign-in after the first. "" rather than a fabricated name, so the
// caller can tell there is nothing to write and leave the stored one alone.
test("a later Apple sign-in carries no name", async () => {
  signIn.mockResolvedValueOnce({ identityToken: "t", fullName: null });
  await expect(appleCredential()).resolves.toEqual({ idToken: "t", fullName: "" });
});

/**
 * A credential with no token is the one failure that could pass for success:
 * the sheet completed, nothing threw, and there is simply nothing to sign in
 * with. Supabase would answer this with a message written for a log, so it is
 * refused here instead, in words `authError` already knows.
 */
test("a credential with no identity token is a failure, not a session", async () => {
  signIn.mockResolvedValueOnce({ identityToken: null, fullName: null });
  await expect(appleCredential()).rejects.toThrow(NO_TOKEN);
});

test("a Google credential with no id token is a failure, not a session", async () => {
  google.mockResolvedValueOnce({ type: "success", data: { idToken: null, user: { name: "Aarav" } } });
  await expect(googleCredential()).rejects.toThrow(NO_TOKEN);
});

test("Google's name and token come back together", async () => {
  google.mockResolvedValueOnce({
    type: "success",
    data: { idToken: "google-token", user: { name: "Aarav Raheja", givenName: "Aarav", familyName: "Raheja" } },
  });
  await expect(googleCredential()).resolves.toEqual({ idToken: "google-token", fullName: "Aarav Raheja" });
});

// A genuine fault is left as a rejection so the store maps it through
// `authError` like every other auth failure, rather than being flattened into
// the same value a cancel produces.
test("a real Apple failure is thrown, not swallowed", async () => {
  signIn.mockRejectedValueOnce(new Error("Network request failed"));
  await expect(appleCredential()).rejects.toThrow("Network request failed");
});

/**
 * ── Configuration read at the call, not at import ─────────────────────────
 *
 * A missing client ID is a build that was shipped without its credentials,
 * and Google's own failure for it is an unreadable native code. Naming it
 * here gives `authError` something to match, and reading `process.env` at the
 * call rather than at module scope is what lets this be tested at all.
 */
test("a build with no Google client IDs says so", async () => {
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  await expect(googleCredential()).rejects.toThrow(MISCONFIGURED);
  expect(google).not.toHaveBeenCalled();
});

test("Google is configured with both client IDs before the sheet opens", async () => {
  google.mockResolvedValueOnce({ type: "success", data: { idToken: "t", user: { name: "" } } });
  await googleCredential();
  expect(GoogleSignin.configure).toHaveBeenCalledWith({
    iosClientId: "ios.apps.googleusercontent.com",
    webClientId: "web.apps.googleusercontent.com",
  });
});

/**
 * ── Whether to draw the button at all ─────────────────────────────────────
 *
 * `isAvailableAsync` is false on Android and on iOS below 13, which is why
 * this delegates to it rather than checking `Platform.OS` — one question,
 * asked of the thing that actually knows.
 *
 * It answers false when it cannot answer, because the cost of the two wrong
 * answers is not symmetrical: a hidden button on a device that could have
 * shown one leaves email sign-in working, and a shown button on a device that
 * cannot honour it is a dead tap.
 */
test("the Apple button is offered when the device supports it", async () => {
  available.mockResolvedValueOnce(true);
  await expect(appleAvailable()).resolves.toBe(true);
});

test("the Apple button is withheld when the check itself fails", async () => {
  available.mockRejectedValueOnce(new Error("no such module"));
  await expect(appleAvailable()).resolves.toBe(false);
});

/**
 * ── Whether the build can do Google at all ────────────────────────────────
 *
 * Both IDs or neither. The iOS one opens the sheet and the web one is the
 * audience Supabase validates, so a build holding one of the two can open a
 * sheet whose result is refused at the far end — which is a worse failure
 * than not offering the button, because it happens after the person has
 * chosen an account.
 */
describe("googleConfigured", () => {
  test("both client IDs present is configured", () => {
    expect(googleConfigured()).toBe(true);
  });

  test("one without the other is not", () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(googleConfigured()).toBe(false);
  });

  test("neither is not", () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(googleConfigured()).toBe(false);
  });
});
