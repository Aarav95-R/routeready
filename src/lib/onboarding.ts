import type { Hazard } from "@/types/db";

/**
 * The sign-up interview, as data rather than as five screens.
 *
 * Keeping the questions here is what makes the copy, the order and the gating
 * testable without rendering anything, and it is why a fifth question later
 * costs one array entry instead of one screen.
 *
 * The questions come before the account exists, which is not a style choice.
 * Supabase email confirmation is on, so `signUp()` returns no session: there
 * is nobody to write a profile to until the learner opens the link and comes
 * back in a later session. Anything asked "after the account" would have to
 * survive that round trip on disk and be replayed on first sign-in. Asking
 * first removes the problem rather than solving it — one call carries the lot.
 */

/**
 * Exactly the values `hazards.type` holds. The type is borrowed from `Hazard`
 * rather than restated, so a new hazard in the schema surfaces here as a type
 * error rather than as a question nobody can answer.
 */
export type Focus = Hazard["type"];
export type Experience = "starting" | "progressing" | "ready";

/**
 * A window rather than a date.
 *
 * The first build of this card drew a calendar, which meant
 * `@react-native-community/datetimepicker` — a dependency that may not run
 * under Expo Go, and whose install re-resolved about 6,000 lines of the
 * lockfile as a side effect. Home only ever needed to know how close the test
 * is, and four windows answer that with nothing to install and nothing that
 * can fail on a device. A precise date can come back from Settings later.
 */
export type TestWindow = "two_weeks" | "this_month" | "later" | "not_booked";

export type Answers = {
  centreId: string | null;
  testWindow: TestWindow | null;
  experience: Experience | null;
  focus: Focus[];
};

export const EMPTY_ANSWERS: Answers = {
  centreId: null, testWindow: null, experience: null, focus: [],
};

export const TOTAL_STEPS = 5;
export const MAX_FOCUS = 2;

type Option<Id> = { id: Id; label: string; sub?: string };

// Annotated rather than `as const satisfies`, because only two of the four
// carry a sub-label: inferring the literals would give the union members
// different shapes and make `o.sub` unreadable at the call site.
export const WINDOW_OPTIONS: readonly Option<TestWindow>[] = [
  { id: "two_weeks", label: "In the next two weeks", sub: "Time to sharpen, not to start" },
  { id: "this_month", label: "This month" },
  { id: "later", label: "Next month or later" },
  { id: "not_booked", label: "Not booked yet", sub: "No countdown, no nagging" },
];

export const EXPERIENCE_OPTIONS = [
  { id: "starting", label: "Just starting", sub: "A handful of lessons so far" },
  { id: "progressing", label: "Getting there", sub: "Confident on roads I know" },
  { id: "ready", label: "Nearly ready", sub: "Doing mock tests already" },
] as const satisfies readonly Option<Experience>[];

export const FOCUS_OPTIONS = [
  { id: "roundabout", label: "Roundabouts", sub: "Mini, multi-lane and spiral" },
  { id: "junction", label: "Junctions and priority", sub: "Emerging, and who goes first" },
  { id: "narrow", label: "Narrow roads", sub: "Meeting traffic, parked cars" },
  { id: "zebra", label: "Pedestrian crossings", sub: "Zebras and school gates" },
] as const satisfies readonly Option<Focus>[];

/** Whether card `step` has been answered well enough to leave. */
export function canAdvance(step: number, a: Answers): boolean {
  switch (step) {
    case 0: return a.centreId !== null;
    case 1: return a.testWindow !== null;
    case 2: return a.experience !== null;
    case 3: return a.focus.length > 0;
    // The account card is gated by the credentials on it, not by an answer.
    default: return false;
  }
}

/**
 * A third choice pushes the oldest off rather than being refused. Refusing is
 * a dead tap with no explanation attached to it; swapping is what the person
 * meant by tapping a third thing.
 */
export function toggleFocus(focus: readonly Focus[], id: Focus): Focus[] {
  if (focus.includes(id)) return focus.filter((f) => f !== id);
  const next = [...focus, id];
  return next.slice(Math.max(0, next.length - MAX_FOCUS));
}

/**
 * What rides along on `signUp()`.
 *
 * A blank name is omitted rather than written as "": an empty string is a name
 * that happens to be empty, and every consumer checking for presence would
 * read it as one. `selectFullName` already narrows for the accounts that
 * predate this.
 */
export function toMetadata(a: Answers, name: string): Record<string, unknown> {
  const trimmed = name.trim();
  return {
    ...(trimmed ? { full_name: trimmed } : {}),
    home_centre_id: a.centreId,
    test_window: a.testWindow,
    experience: a.experience,
    focus: a.focus,
  };
}
