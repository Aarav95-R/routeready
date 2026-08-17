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
