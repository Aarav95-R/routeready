import { authErrorMessage, GENERIC_AUTH_ERROR } from "../authError";

// These four are the exact strings Supabase returns. They are asserted
// verbatim because the mapping is keyed off them, and a silent upstream
// rewording is precisely the failure this test exists to catch early.
test("the messages users actually hit are rewritten", () => {
  expect(authErrorMessage("Invalid login credentials"))
    .toBe("That email and password don't match. Check the password, or reset it below.");
  expect(authErrorMessage("User already registered"))
    .toBe("There's already an account with that email. Sign in instead, or reset the password.");
  expect(authErrorMessage("Email not confirmed"))
    .toBe("Confirm your email first — check your inbox for the link we sent.");
  expect(authErrorMessage("Email rate limit exceeded"))
    .toBe("Too many emails just now. Wait a minute, then try again.");
});

test("matching ignores case and surrounding words", () => {
  expect(authErrorMessage("AuthApiError: invalid login credentials"))
    .toBe(authErrorMessage("Invalid login credentials"));
});

// A dropped connection is the most common failure of all and is not the
// user's mistake. It must not be reported in the same words as a wrong
// password.
test("a dropped connection says so", () => {
  expect(authErrorMessage("Network request failed"))
    .toBe("No connection. Check your signal, then try again.");
  expect(authErrorMessage("TypeError: Failed to fetch"))
    .toBe("No connection. Check your signal, then try again.");
});

// The whole point of the module: an unrecognised message must not reach a
// user. Asserting the fallback is not enough — the raw text must be gone.
test("an unknown message is replaced, not passed through", () => {
  const raw = "PGRST301: JWSError JWSInvalidSignature";
  const out = authErrorMessage(raw);
  expect(out).toBe(GENERIC_AUTH_ERROR);
  expect(out).not.toContain("JWS");
  expect(out).not.toContain("PGRST");
});

test("no error at all is still a sentence", () => {
  expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
  expect(authErrorMessage("")).toBe(GENERIC_AUTH_ERROR);
});
