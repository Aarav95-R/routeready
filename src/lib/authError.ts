/**
 * What a person is told when authentication fails.
 *
 * Supabase's messages are accurate and written for whoever is reading the
 * logs: `Invalid login credentials`, `User already registered`, `PGRST301`.
 * They were reaching the screen verbatim.
 *
 * The mapping is a substring match on a lowercased message rather than an
 * equality check on a code, because supabase-js reports the same condition
 * with different wrappers depending on where it was raised — a bare message
 * from one call, an `AuthApiError: ` prefix from another.
 *
 * It is total on purpose. Every branch returns a written sentence, so an
 * unrecognised message cannot fall through to the raw text.
 */

export const GENERIC_AUTH_ERROR = "Something went wrong. Try again in a moment.";

const OFFLINE = "No connection. Check your signal, then try again.";

// Order matters: the first needle found wins, so put anything that could be a
// substring of another below the longer one.
const RULES: readonly [string, string][] = [
  ["invalid login credentials", "That email and password don't match. Check the password, or reset it below."],
  ["user already registered", "There's already an account with that email. Sign in instead, or reset the password."],
  ["already been registered", "There's already an account with that email. Sign in instead, or reset the password."],
  ["email not confirmed", "Confirm your email first — check your inbox for the link we sent."],
  ["email rate limit exceeded", "Too many emails just now. Wait a minute, then try again."],
  ["over_email_send_rate_limit", "Too many emails just now. Wait a minute, then try again."],
  ["for security purposes", "Too many attempts just now. Wait a minute, then try again."],
  ["password should be at least", "Your password needs at least 8 characters."],
  ["unable to validate email address", "That doesn't look like an email address."],
  ["invalid format", "That doesn't look like an email address."],
  ["network request failed", OFFLINE],
  ["failed to fetch", OFFLINE],
  ["network error", OFFLINE],
];

export function authErrorMessage(raw: string | null | undefined): string {
  if (!raw) return GENERIC_AUTH_ERROR;
  const needle = raw.toLowerCase();
  for (const [match, sentence] of RULES) {
    if (needle.includes(match)) return sentence;
  }
  return GENERIC_AUTH_ERROR;
}
