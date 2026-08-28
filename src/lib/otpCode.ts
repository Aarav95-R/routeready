/**
 * The shape of what the six boxes hold.
 *
 * Normalisation lives here rather than in `CodeField` because the field is not
 * the only thing that can put a value in it: iOS autofill, a paste from Mail,
 * and a hardware keyboard all arrive by different routes, and only one of them
 * is a keystroke. One function means the field cannot hold a value the verify
 * call would reject.
 */
export const CODE_LENGTH = 6;

/** Which flow a code belongs to, in Supabase's own vocabulary for `verifyOtp`. */
export type CodeType = "signup" | "recovery" | "email";

/**
 * Digits only, capped at the code length.
 *
 * Non-digits are dropped rather than refused: the emails group the code for
 * legibility, so a space or a hyphen is what a careful person pastes, and
 * rejecting it would punish reading the email properly.
 */
export function normaliseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isComplete(code: string): boolean {
  return code.length === CODE_LENGTH;
}
