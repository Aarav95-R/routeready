import type { Manoeuvre } from "@/types/db";
import { SEEDED_NAMES } from "./manoeuvreScenes";

/**
 * How the four manoeuvres are introduced: what they are called in one line,
 * what order they are read in, and which of them belong together.
 *
 * None of this is in the database. The `manoeuvres` table holds a name, six
 * steps and three tips — everything a learner reads *inside* a manoeuvre, and
 * nothing about how the four sit next to each other. That is presentation: it
 * changes when the screen changes, not when the DVSA changes, so it lives
 * here next to the geometry rather than behind a migration.
 */

export type ManoeuvreSlug = "parallel" | "bay-reverse" | "bay-forward" | "pull-up-right";

export type ViewManoeuvre = {
  manoeuvre: Manoeuvre;
  /** Null for a name this build does not recognise. The row still draws. */
  slug: ManoeuvreSlug | null;
  /** "" for the same reason: the row falls back to its name alone. */
  blurb: string;
};

export type ManoeuvreSection = { title: string; data: ViewManoeuvre[] };

/**
 * Three of these are reversing manoeuvres performed off the flow of traffic.
 * The fourth puts a learner on the wrong side of a live road, which is a
 * different kind of thing to be practising, and the grouping says so before
 * any copy has to.
 */
const GROUPS = ["Reversing", "On the road"] as const;
/** Anything this build does not recognise, so nothing is silently dropped. */
const UNKNOWN_GROUP = "More";

type Entry = { slug: ManoeuvreSlug; group: (typeof GROUPS)[number]; blurb: string };

/**
 * Keyed by the name as `seed.sql` spells it. Declaration order is the order
 * rows are read in, which is why this is not sorted: the query returns them
 * alphabetically, and alphabetically puts Parallel park third — behind two
 * car-park manoeuvres — when it is the one most people open this tab for.
 */
const ENTRIES: Record<string, Entry> = {
  "Parallel park": {
    slug: "parallel", group: "Reversing",
    blurb: "Reverse into a gap between two parked cars.",
  },
  "Bay park (reverse)": {
    slug: "bay-reverse", group: "Reversing",
    blurb: "Reverse into a marked bay, finishing nose-out.",
  },
  "Forward bay park": {
    slug: "bay-forward", group: "Reversing",
    blurb: "Drive into a marked bay, finishing nose-in.",
  },
  "Pull up on the right": {
    slug: "pull-up-right", group: "On the road",
    blurb: "Cross to the offside kerb, stop, then rejoin.",
  },
};

// The two modules are joined by name and have to stay joined. Reading the
// names from one and the entries from the other would let a rename land in
// half the app; this makes the geometry module the single source and leaves
// the suite to prove an entry exists for each.
const ORDER = new Map(SEEDED_NAMES.map((name, i) => [name as string, i]));

export function slugFor(name: string): ManoeuvreSlug | null {
  return ENTRIES[name]?.slug ?? null;
}

export function blurbFor(name: string): string {
  return ENTRIES[name]?.blurb ?? "";
}

export function buildSections(manoeuvres: Manoeuvre[]): ManoeuvreSection[] {
  const bins = new Map<string, ViewManoeuvre[]>();

  for (const manoeuvre of manoeuvres) {
    const entry = ENTRIES[manoeuvre.name];
    const title = entry ? entry.group : UNKNOWN_GROUP;
    const view: ViewManoeuvre = {
      manoeuvre,
      slug: entry?.slug ?? null,
      blurb: entry?.blurb ?? "",
    };
    const bin = bins.get(title);
    if (bin) bin.push(view);
    else bins.set(title, [view]);
  }

  // Unknown names keep the order they arrived in — there is nothing better to
  // sort them by, and the query already sorted them.
  for (const [title, bin] of bins) {
    if (title !== UNKNOWN_GROUP) {
      bin.sort((a, b) =>
        (ORDER.get(a.manoeuvre.name) ?? 0) - (ORDER.get(b.manoeuvre.name) ?? 0));
    }
  }

  return [...GROUPS, UNKNOWN_GROUP]
    .filter((title) => bins.has(title))
    .map((title) => ({ title, data: bins.get(title)! }));
}

/**
 * Which step the diagram should be drawing, given how far the list has been
 * scrolled and where each step row measured out to.
 *
 * The rows are not a fixed height — the details wrap to two lines or three —
 * so this reads a table filled in by each row's own onLayout rather than
 * dividing by a constant the way the centres sheet can.
 *
 * Before the first row has reached the top there is no step at the top, and
 * the answer is step one: it is what the reader is looking at, and step zero
 * has no pose to draw.
 */
export function activeStepAt(offsetY: number, tops: number[]): number {
  let i = 0;
  for (let n = 0; n < tops.length; n++) if (tops[n] <= offsetY) i = n;
  return i;
}
