import { EXAMINER_CATEGORIES, type Mark } from "@/lib/examiner";
import type { Fault } from "@/lib/scoring/engine";

const knownCategoryIds = new Set(EXAMINER_CATEGORIES.map((c) => c.id));
const labelById = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c.label]));

// marksToFaults (lib/examiner.ts) builds the "examiner" faults with a single
// flatMap over `marks`, dropping credits and unknown categories but never
// reordering. That makes the Nth examiner fault always correspond to the Nth
// mark left after the same filter — a positional pairing, not a guess, as
// long as this filter stays identical to the one in marksToFaults. The tag
// check below is a trip-wire for that assumption: if it and marksToFaults
// ever drift apart, a mismatch surfaces here as a missing time rather than a
// wrong one next to the wrong fault.
export function faultElapsedMs(faults: Fault[], marks: Mark[], startedAt: number): (number | null)[] {
  const examinerMarks = marks.filter((m) => m.level !== "credit" && knownCategoryIds.has(m.category));
  let next = 0;
  return faults.map((f) => {
    if (f.kind !== "examiner") return null;
    const mark = examinerMarks[next];
    next += 1;
    if (!mark || labelById.get(mark.category) !== f.tag) return null;
    return mark.t - startedAt;
  });
}

// m:ss from the start of the test, floored at 0 — a clock never runs
// backwards on screen even if a mark's timestamp is somehow earlier.
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type CreditSummary = { category: string; label: string; count: number };

export function creditsByCategory(marks: Mark[]): CreditSummary[] {
  const counts = new Map<string, number>();
  for (const m of marks) {
    if (m.level !== "credit") continue;
    counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({
    category, label: labelById.get(category) ?? category, count,
  }));
}
