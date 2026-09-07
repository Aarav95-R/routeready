// The real `socialAuth` is imported below, for its two thrown messages — the
// needles in the table are matched against them, and importing the constants
// is what makes that coupling fail here rather than on a phone. Its two native
// SDKs are stubbed because nothing in this file calls them, and
// google-signin reads native constants at import.
jest.mock("expo-apple-authentication", () => ({}));
jest.mock("@react-native-google-signin/google-signin", () => ({ GoogleSignin: {} }));

import { AUTH_FALLBACK, authError, SOCIAL_UNAVAILABLE } from "../authError";
import { MISCONFIGURED, NO_TOKEN } from "../socialAuth";

/**
 * The strings on the left are Supabase's own, copied from what it actually
 * returns. They are accurate and they are written for whoever is reading the
 * logs; today `signIn` hands `error.message` straight to the screen, so the
 * friendliest screen in the app tells people "Invalid login credentials".
 */
test.each([
  ["Invalid login credentials", /don't match/],
  ["Email not confirmed", /confirm/i],
  ["User already registered", /already an account/],
  ["Email rate limit exceeded", /minute/],
  ["For security purposes, you can only request this after 51 seconds", /minute/],
  ["Network request failed", /connection/i],
  ["Unable to validate email address: invalid format", /email address/i],
])("%s is rewritten as a sentence", (raw, expected) => {
  expect(authError(raw)).toMatch(expected);
});

test("every sentence is written for the person reading it, not for a log", () => {
  const raws = [
    "Invalid login credentials", "Email not confirmed", "User already registered",
    "Email rate limit exceeded", "Network request failed",
  ];
  for (const raw of raws) {
    const sentence = authError(raw);
    expect(sentence).not.toBe(raw);
    expect(sentence).toMatch(/[.?]$/);
    expect(sentence[0]).toBe(sentence[0].toUpperCase());
  }
});

// Supabase adds and rewords messages without telling anyone, so the mapping
// has to be total. Passing an unknown one through would put us back where we
// started, only less predictably.
test("an unrecognised message falls back without leaking the original", () => {
  const raw = "AuthApiError: pkce_grant_flow_state_not_found";
  expect(authError(raw)).toBe(AUTH_FALLBACK);
  expect(authError(raw)).not.toContain("pkce");
});

test("nothing at all still produces a sentence", () => {
  expect(authError(undefined)).toBe(AUTH_FALLBACK);
  expect(authError("")).toBe(AUTH_FALLBACK);
});

// Matching is on a substring of the lowercased message rather than on
// equality: Supabase prefixes and reworders these routinely, and an exact
// match that silently stops matching degrades to the fallback with no test
// failing to say so.
test("matching survives Supabase decorating its own message", () => {
  expect(authError("AuthApiError: Invalid login credentials")).toBe(authError("Invalid login credentials"));
  expect(authError("invalid login credentials")).toBe(authError("Invalid login credentials"));
});

/**
 * ── Codes ─────────────────────────────────────────────────────────────────
 *
 * These three have to stay distinguishable. "Wrong" means try again with the
 * same email open; "expired" means that email is now useless and a new one is
 * needed. Collapsing them into one sentence is how somebody retypes a code
 * that will never work, six digits at a time, until they give up.
 */
test("a wrong code says to check it, not to start again", () => {
  const sentence = authError("Invalid OTP");
  expect(sentence).toMatch(/isn't right/i);
  expect(sentence).not.toMatch(/expired/i);
});

test("an expired code says to send a new one", () => {
  const sentence = authError("AuthApiError: otp_expired");
  expect(sentence).toMatch(/expired/i);
  expect(sentence).toMatch(/new code/i);
});

// Supabase's own wording for verifyOtp folds both causes into one message, so
// this one sentence has to name both without implying either.
test("Supabase's combined message names both causes", () => {
  const sentence = authError("Token has expired or is invalid");
  expect(sentence).toMatch(/expired/i);
  expect(sentence).toMatch(/isn't right/i);
});

// The OTP entries sit above the generic ones and must not shadow the sign-in
// message, which also contains the word "invalid".
test("adding the code sentences did not capture a bad password", () => {
  expect(authError("Invalid login credentials")).toMatch(/don't match/i);
});

/**
 * ── The provider sheets ───────────────────────────────────────────────────
 *
 * Two of these needles match words this project throws rather than words
 * Supabase does — `socialAuth.ts` owns `NO_TOKEN` and `MISCONFIGURED`, and
 * the rule that keeps them in step is that the message is a *sentence
 * fragment* matched as a substring, not a code. These tests are the coupling
 * made visible: change the thrown wording without changing the needle and one
 * of them fails here rather than degrading to the fallback on a phone.
 */
describe("Apple and Google", () => {
  test("a sheet that finished with no token names the door that is open", () => {
    expect(authError("The provider returned no token")).toBe(SOCIAL_UNAVAILABLE);
    expect(authError(NO_TOKEN)).toBe(SOCIAL_UNAVAILABLE);
  });

  /**
   * Supabase's Google path answers every id_token failure with this one
   * string. Left unmapped it produced "Something went wrong", which is the
   * least useful sentence in the file and the one a real misconfiguration
   * actually produced in the field.
   */
  test("Google's catch-all rejection is recognised, not left to the fallback", () => {
    expect(authError("Bad ID token")).toBe(SOCIAL_UNAVAILABLE);
    expect(authError("Bad ID token")).not.toBe(AUTH_FALLBACK);
  });

  test("a build shipped without its client IDs says the same thing", () => {
    expect(authError(MISCONFIGURED)).toBe(SOCIAL_UNAVAILABLE);
  });

  /**
   * The provider is switched off in the Supabase project, or the token's
   * audience is not one the project allows. Both are console settings, and
   * neither is anything the person tapping the button can act on — so the
   * sentence sends them to email rather than explaining an audience to them.
   */
  test("a provider Supabase will not accept sends them to email instead", () => {
    expect(authError("Provider is not enabled")).toBe(SOCIAL_UNAVAILABLE);
    expect(authError("AuthApiError: Unacceptable audience in id_token")).toBe(SOCIAL_UNAVAILABLE);
  });

  // The rate-limit pair sits below these in the table, and both contain words
  // the earlier entries do not — this guards the ordering.
  test("provider entries do not swallow the rate limit", () => {
    expect(authError("Request rate limit reached")).toMatch(/minute/);
  });
});
