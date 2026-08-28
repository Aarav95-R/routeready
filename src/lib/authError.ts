/**
 * Supabase's message, rewritten as something worth reading.
 *
 * `signIn` and `signUp` return `error.message` verbatim and both screens
 * render it, so today a mistyped password produces "Invalid login
 * credentials" — accurate, and written for whoever is reading the logs.
 *
 * Two rules make this safe to put in front of a user:
 *
 * It is **total**. Supabase adds and rewords messages without announcement,
 * and an unrecognised one falls back to a written sentence rather than
 * passing the original through. Leaking it would put us back where we
 * started, only less predictably.
 *
 * It matches on a **substring of the lowercased message**, not on equality.
 * Supabase prefixes these (`AuthApiError: …`) and rewords them, and an exact
 * match that quietly stops matching degrades to the fallback with nothing to
 * say so.
 */

export const AUTH_FALLBACK = "Something went wrong. Try again in a moment.";

/**
 * What a call that outlived its deadline says.
 *
 * Not a Supabase message — there is no message, which is the whole problem —
 * so it is spelled out here rather than mapped. It is deliberately not the
 * "No connection" sentence: the phone's connection is usually fine and the
 * service is the thing that went quiet, so telling somebody to check their
 * wifi sends them off to fix something that is not broken.
 */
export const AUTH_TIMEOUT = "That's taking longer than it should. Try again in a moment.";

/**
 * What an unconfirmed sign-up hears on the sign-in screen.
 *
 * Exported rather than left inline in the table so `app/(auth)/sign-in.tsx`
 * can compare against it by identity to decide whether to route to the verify
 * screen — matching this by re-typing the sentence in the screen would let
 * the two drift apart silently, exactly the failure `AUTH_FALLBACK` and
 * `AUTH_TIMEOUT` are already exported to avoid.
 *
 * Says nothing about signing in afterwards: the sign-in screen now pushes
 * straight to the verify screen on this sentence, and a correct code there
 * opens a session directly, so there is no second "sign in" step left to
 * describe.
 */
export const EMAIL_NOT_CONFIRMED = "Confirm your email first — enter the code we sent you.";

/**
 * First match wins, so the order is the specificity order. `email not
 * confirmed` has to sit above the generic email entries, and the rate-limit
 * pair has to sit above anything matching on `email`.
 */
const SENTENCES: readonly (readonly [needle: string, sentence: string])[] = [
  ["invalid login credentials", "That email and password don't match. Try again, or reset your password."],
  // ── Codes. Above the generic entries because two of these contain the word
  // "invalid", and below `invalid login credentials` because that one is more
  // specific still. Supabase folds both causes into one message for verifyOtp,
  // so that combined case gets a sentence naming both.
  ["token has expired or is invalid", "That code has expired or isn't right. Check the email, or send a new code."],
  ["otp_expired", "That code has expired. Send a new code and try again."],
  ["invalid otp", "That code isn't right. Check the email and try again."],
  // Confirmation is on, so this is the state every new account is in until the
  // code is entered. Saying "wrong password" here would be a lie that sends
  // people to the reset screen for a password that is fine.
  ["email not confirmed", EMAIL_NOT_CONFIRMED],
  ["user already registered", "There's already an account on that email. Sign in instead?"],
  ["already been registered", "There's already an account on that email. Sign in instead?"],
  ["rate limit", "Too many tries just now. Give it a minute and go again."],
  ["for security purposes", "Too many tries just now. Give it a minute and go again."],
  ["network request failed", "No connection. We'll be here when you're back."],
  ["invalid format", "That doesn't look like an email address."],
  ["unable to validate email", "That doesn't look like an email address."],
  ["password should be", "That password is too short. Use at least eight characters."],
];

export function authError(message: string | null | undefined): string {
  if (!message) return AUTH_FALLBACK;
  const haystack = message.toLowerCase();
  return SENTENCES.find(([needle]) => haystack.includes(needle))?.[1] ?? AUTH_FALLBACK;
}
