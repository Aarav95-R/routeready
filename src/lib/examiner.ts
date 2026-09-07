import type { LatLng } from "./geo";
import type { Fault } from "./scoring/engine";

export type ExaminerGroup = "driving" | "manoeuvres" | "beforeDriving";
export type MarkLevel = "minor" | "major" | "credit";

export type ExaminerCategory = {
  id: string;
  label: string;
  group: ExaminerGroup;
  minorExample: string;
  majorExample: string;
};

// DVSA's own category names, off the DL25 test report. A learner is emailed
// these exact words after a real test, so a mock using anything else cannot be
// compared with it.
//
// No category is inherently a minor or a major: the same row can be marked as a
// driving fault, serious, or dangerous depending on the incident. That is why
// every category carries both examples, and why the panel shows MIN and MAJ on
// every row.
export const EXAMINER_CATEGORIES: readonly ExaminerCategory[] = [
  { id: "control", label: "Control", group: "driving", minorExample: "Stalling, jerky gear change, coasting", majorExample: "Stall that blocks a junction; losing control" },
  { id: "moveOff", label: "Move off", group: "driving", minorExample: "Slightly late blind spot check", majorExample: "Pulling out into traffic; no observation at all" },
  { id: "mirrors", label: "Use of mirrors", group: "driving", minorExample: "Missed check where nothing was coming", majorExample: "Changing direction or braking hard into someone unseen" },
  { id: "signals", label: "Signals", group: "driving", minorExample: "Late, or left flashing after the turn", majorExample: "A signal that misleads someone into moving" },
  { id: "junctions", label: "Junctions", group: "driving", minorExample: "Approaching a touch fast; slightly wide", majorExample: "Emerging into a gap that forces someone to brake" },
  { id: "judgement", label: "Judgement", group: "driving", minorExample: "Hesitant on an overtake", majorExample: "Overtaking into oncoming traffic; cutting in" },
  { id: "positioning", label: "Positioning", group: "driving", minorExample: "Drifting within the lane", majorExample: "Wrong side of the road; wrong roundabout lane into conflict" },
  { id: "clearance", label: "Clearance to obstructions", group: "driving", minorExample: "Passing a parked car a bit close", majorExample: "Close enough that a door or pedestrian would be hit" },
  { id: "followingDistance", label: "Following distance", group: "driving", minorExample: "Briefly closer than two seconds", majorExample: "Tailgating; no room to stop" },
  { id: "speed", label: "Use of speed", group: "driving", minorExample: "A few mph over, briefly", majorExample: "Well over the limit — a breach of the law is serious by definition" },
  { id: "progress", label: "Progress", group: "driving", minorExample: "Over-cautious; a bit slow for the road", majorExample: "Stopping dead where it endangers others; refusing every gap" },
  { id: "signsAndSignals", label: "Response to signs and signals", group: "driving", minorExample: "Late reaction to a sign", majorExample: "Through a red light; ignoring a give way" },
  { id: "pedestrianCrossings", label: "Pedestrian crossings", group: "driving", minorExample: "Approaching too fast at a clear crossing", majorExample: "Failing to give way to someone on the crossing" },
  { id: "normalStops", label: "Position and normal stops", group: "driving", minorExample: "Stopping slightly awkwardly", majorExample: "Stopping somewhere that blocks or endangers" },
  { id: "awarenessPlanning", label: "Awareness and planning", group: "driving", minorExample: "Late to spot a developing hazard", majorExample: "Missing a cyclist or pedestrian entirely" },
  { id: "ancillaryControls", label: "Ancillary controls", group: "driving", minorExample: "Fumbling for the wipers", majorExample: "Losing control while reaching for something" },

  { id: "reversePark", label: "Reverse park", group: "manoeuvres", minorExample: "Ending up a little out of position", majorExample: "Reversing into the road without looking" },
  { id: "forwardPark", label: "Forward park", group: "manoeuvres", minorExample: "Poor accuracy in the bay", majorExample: "Leaving the bay without all-round observation" },
  { id: "pullUpOnRight", label: "Pull up on the right", group: "manoeuvres", minorExample: "Untidy positioning at the kerb", majorExample: "Crossing into traffic without checking" },
  { id: "controlledStop", label: "Controlled stop", group: "manoeuvres", minorExample: "Slow to react to the signal", majorExample: "Locking the wheels; losing control under braking" },

  { id: "eyesight", label: "Eyesight check", group: "beforeDriving", minorExample: "Needed a second attempt", majorExample: "Could not read the plate — a real test ends here" },
  { id: "precautions", label: "Precautions", group: "beforeDriving", minorExample: "Mirror or seat not quite set", majorExample: "Starting in gear; door not secure" },
  { id: "vehicleChecks", label: "Vehicle checks", group: "beforeDriving", minorExample: "One show-me tell-me answer wrong", majorExample: "Losing control while demonstrating one on the move" },
];

export type Mark = {
  category: string;
  level: MarkLevel;
  t: number;
  at: LatLng | null;
};

const byId = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c]));

export function categoryById(id: string): ExaminerCategory | undefined {
  return byId.get(id);
}

export type MarkCounts = { minor: number; major: number; credit: number };

const NO_MARKS: MarkCounts = { minor: 0, major: 0, credit: 0 };

/**
 * Every level, per category, for the mark sheet's rows.
 *
 * `minorCountsByCategory` below answers a narrower question — which categories
 * are being marked habitually — and is kept because that is a different rule
 * with its own threshold. This one is what a row draws itself from: the count
 * between the minus and the plus, the tint on a row that has been marked, and
 * the tick beside a category that was done well.
 */
export function markCountsByCategory(marks: Mark[]): Record<string, MarkCounts> {
  const counts: Record<string, MarkCounts> = {};
  for (const m of marks) {
    const current = counts[m.category] ?? NO_MARKS;
    counts[m.category] = { ...current, [m.level]: current[m.level] + 1 };
  }
  return counts;
}

export const NO_MARK_COUNTS = NO_MARKS;

// A mark from an unknown category is dropped rather than thrown: a stale mark
// should never be able to take down the result screen at the end of a drive.
export function marksToFaults(marks: Mark[]): Fault[] {
  return marks.flatMap((m) => {
    if (m.level === "credit") return [];
    const category = byId.get(m.category);
    if (!category) return [];
    return [{
      kind: "examiner" as const,
      severity: m.level,
      tag: category.label,
      detail: m.level === "major" ? category.majorExample : category.minorExample,
    }];
  });
}

export function creditCount(marks: Mark[]): number {
  return marks.filter((m) => m.level === "credit").length;
}

export function minorCountsByCategory(marks: Mark[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of marks) {
    if (m.level !== "minor") continue;
    counts[m.category] = (counts[m.category] ?? 0) + 1;
  }
  return counts;
}

// DVSA: a candidate "who habitually commits a driving fault in one aspect of
// driving throughout the test cannot be regarded as competent to pass. The
// repeated fault can then be assessed as potentially dangerous."
//
// No number is given, because "habitually" is the examiner's judgement. So this
// warns and never escalates on its own — silently failing someone against an
// invented threshold would be worse than saying nothing.
export const HABITUAL_MINOR_THRESHOLD = 3;

export function habitualWarnings(marks: Mark[]): { category: string; label: string; count: number }[] {
  return Object.entries(minorCountsByCategory(marks))
    .filter(([, count]) => count >= HABITUAL_MINOR_THRESHOLD)
    .map(([category, count]) => ({ category, label: byId.get(category)?.label ?? category, count }));
}
