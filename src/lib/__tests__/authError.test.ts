import { AUTH_FALLBACK, authError } from "../authError";

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
