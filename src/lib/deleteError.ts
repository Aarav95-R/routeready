/**
 * What went wrong deleting an account, written for the person deleting it.
 *
 * Same contract as `authError`, and here for the same reason: the strings on
 * the other side are `FunctionsHttpError: non-2xx status code` and friends,
 * written for whoever is reading the function logs.
 *
 * **Total.** An unrecognised message falls back to a written sentence rather
 * than passing the original through, so no rewording upstream can leak one.
 *
 * **Substring, lowercased.** supabase-js prefixes and rewords these, and an
 * exact match that quietly stops matching would degrade to the fallback with
 * nothing to say so.
 *
 * Every sentence here has one more job than `authError`'s do: it has to leave
 * the person certain the account is *still there*. A failed deletion that
 * reads as ambiguous is worse than one that reads as a plain no — somebody who
 * thinks it half-worked has no idea whether to try again.
 */

export const DELETE_FALLBACK =
  "Your account could not be deleted, and nothing has been removed. Try again in a moment.";

const SENTENCES: readonly (readonly [needle: string, sentence: string])[] = [
  // supabase-js raises this for any transport failure, which on a phone almost
  // always means no signal. Deliberately above every other entry: it is the
  // one case where "try again" on its own would be useless advice.
  [
    "failed to send a request",
    "Deleting your account needs a connection. Nothing has been removed — try again when you're back online.",
  ],
  [
    "network request failed",
    "Deleting your account needs a connection. Nothing has been removed — try again when you're back online.",
  ],
  [
    "rate limit",
    "Too many tries just now. Your account is still here — give it a minute and go again.",
  ],
];

export function deleteAccountError(message: string | null | undefined): string {
  if (!message) return DELETE_FALLBACK;
  const haystack = message.toLowerCase();
  return SENTENCES.find(([needle]) => haystack.includes(needle))?.[1] ?? DELETE_FALLBACK;
}
