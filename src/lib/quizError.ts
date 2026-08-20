/**
 * Why the questions would not load, in words that point at the right thing.
 *
 * Written after the tab shipped showing one identical line for every possible
 * failure. The line said "Couldn't load the questions", the actual cause was a
 * Supabase project that had never had the Phase 2 columns added, and pressing
 * Try again re-ran the same doomed query and redrew the same sentence — which
 * from the outside is indistinguishable from a button that does nothing.
 *
 * Two failures, two different things to do about them, so two messages.
 */

export type LoadFailure = { headline: string; detail: string };

const MIGRATION = "supabase/migrations/2026-08-18-quiz.sql";

/**
 * PostgREST surfaces a query against an unmigrated table as Postgres error
 * 42703, whose message names the column. Matched on the message rather than
 * the code because `cachedFetch` throws `new Error(error.message)` and the
 * code does not survive the trip.
 */
const MISSING_COLUMN = /column .* does not exist/i;

export function loadFailure(e: unknown): LoadFailure {
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";

  if (MISSING_COLUMN.test(message)) {
    return {
      headline: "This build needs a database update.",
      detail: `The questions table is missing its newer columns. Run ${MIGRATION} against the Supabase project, then try again.`,
    };
  }

  return {
    headline: "Couldn't load the questions.",
    // Carried through rather than swallowed: a second identical failure should
    // read as a second failure, not as a button that was never pressed.
    detail: message,
  };
}
