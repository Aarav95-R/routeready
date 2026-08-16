import type { Hazard } from "@/types/db";

/**
 * The sign-up interview, as data rather than as five screens.
 *
 * Keeping the questions here is what makes the copy, the order and the gating
 * testable without rendering anything, and it is why a fifth question later
 * costs one array entry instead of one screen.
 *
 * The questions come before the account exists, which is not a style choice:
 * Supabase email confirmation is on, so `signUp()` returns no session. There
 * is nobody to write a profile to until the learner confirms and comes back in
 * a later session, so anything asked "after the account" would have to survive
 * that round trip on disk. Asking first removes the problem instead.
 */

/**
 * Exactly the values `hazards.type` holds — the type is borrowed from `Hazard`
 * rather than restated, so a new hazard in the schema surfaces here as a type
 * error rather than as a question nobody can answer.
 *
 * The first draft of this card also offered parallel parking, bay parking,
 * dual carriageways and reversing. `manoeuvres` has no route relation and
 * there is no dual-carriageway marker anywhere, so four of the six were
 * questions the app could not act on.
 */
export type Focus = Hazard["type"];
export type Experience = "starting" | "progressing" | "ready";

export type Answers = {
  centreId: string | null;
  booked: boolean | null;
  testDate: string | null;
  experience: Experience | null;
  focus: Focus[];
};

export const EMPTY_ANSWERS: Answers = {
  centreId: null, booked: null, testDate: null, experience: null, focus: [],
};

export const TOTAL_STEPS = 5;
export const MAX_FOCUS = 2;

export const EXPERIENCE_OPTIONS = [
  { id: "starting", label: "Just starting out", sub: "A handful of lessons so far" },
  { id: "progressing", label: "Getting there", sub: "I can drive most roads on my own" },
  { id: "ready", label: "Nearly test-ready", sub: "Polishing the details" },
] as const satisfies readonly { id: Experience; label: string; sub: string }[];

export const FOCUS_OPTIONS = [
  { id: "roundabout", label: "Roundabouts", sub: "Mini, multi-lane and spiral" },
  { id: "junction", label: "Junctions and priority", sub: "Emerging, and who goes first" },
  { id: "narrow", label: "Narrow roads", sub: "Meeting traffic, parked cars" },
  { id: "zebra", label: "Pedestrian crossings", sub: "Zebras and schools" },
] as const satisfies readonly { id: Focus; label: string; sub: string }[];

/** Whether card `step` has been answered well enough to leave. */
export function canAdvance(step: number, a: Answers): boolean {
  switch (step) {
    case 0: return a.centreId !== null;
    // "Booked" with no date cannot feed the countdown the question exists for.
    case 1: return a.booked === false || (a.booked === true && a.testDate !== null);
    case 2: return a.experience !== null;
    case 3: return a.focus.length > 0;
    default: return false; // Card 5 is gated by the credentials, not by this.
  }
}

/**
 * A third choice pushes the oldest off rather than being refused. Refusing is
 * a dead tap with no explanation attached to it; swapping is what the user
 * meant.
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
    test_date: a.testDate,
    experience: a.experience,
    focus: a.focus,
  };
}
