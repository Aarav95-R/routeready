import { create } from "zustand";
import type { LatLng } from "@/lib/geo";
import { aggregate, MIN_ASSESSABLE_SECONDS, MockResult } from "@/lib/scoring/engine";
import { creditCount, habitualWarnings, marksToFaults, type Mark, type MarkLevel } from "@/lib/examiner";
import type { Deviation, Route } from "@/types/db";

type MockPhase = "idle" | "running" | "finished";

/**
 * A mock test is one examiner's judgement, and nothing else.
 *
 * This store used to hold a second opinion alongside the marks: every GPS
 * sample of the drive, a running speeding detector, and a record of which
 * observation zones the car had passed through with or without Mirrors being
 * tapped. Both fed the result.
 *
 * They were removed because they could overrule the person doing the assessing.
 * Phone GPS speed is noisy and was compared against whatever limit had been
 * seeded for the nearest point on the route; five seconds over it scored a
 * *serious* fault, which fails a test outright — one the examiner never saw and
 * had no way to undo, because auto-detected faults never appeared on the sheet.
 * The observation check failed the same way in reverse: a driver who checked
 * their mirrors properly was marked down whenever nobody happened to press a
 * button.
 *
 * So the drive is still navigated by GPS and still drawn from it. It is no
 * longer scored by it.
 */
type MockState = {
  phase: MockPhase;
  route: Route | null;
  startedAt: number;
  result: MockResult | null;
  marks: Mark[];
  /**
   * Off-route departures during this run. Lives in the store rather than in
   * mock.tsx because the screen navigates away to the result before anything
   * is saved, and a ref goes with it. Never a fault: leaving the route is not
   * something the DL25 has a box for.
   */
  deviations: Deviation[];
  start: (route: Route, now?: number) => void;
  addMark: (category: string, level: MarkLevel, at?: LatLng | null, now?: number) => void;
  undoMark: () => void;
  addDeviation: (d: Deviation) => void;
  warnings: () => { category: string; label: string; count: number }[];
  finish: (now?: number) => MockResult;
  reset: () => void;
};

const initial = {
  phase: "idle" as MockPhase, route: null, startedAt: 0, result: null,
  marks: [] as Mark[], deviations: [] as Deviation[],
};

export const useMockTest = create<MockState>((set, get) => ({
  ...initial,
  start: (route, now = Date.now()) => set({ ...initial, phase: "running", route, startedAt: now }),

  addMark: (category, level, at = null, now = Date.now()) =>
    set({ marks: [...get().marks, { category, level, t: now, at }] }),

  // Mis-taps are certain, and a stray serious fault would otherwise fail the
  // test silently.
  undoMark: () => set({ marks: get().marks.slice(0, -1) }),
  addDeviation: (d) => set({ deviations: [...get().deviations, d] }),

  warnings: () => habitualWarnings(get().marks),

  finish: (now = Date.now()) => {
    const { startedAt, marks } = get();
    const durationSeconds = Math.round((now - startedAt) / 1000);
    const aggregateResult = aggregate(marksToFaults(marks), durationSeconds, creditCount(marks));
    // An empty sheet is a clean drive, so nothing else stops a test opened and
    // finished a moment later reading as a pass at 100. See
    // MIN_ASSESSABLE_SECONDS for why this is measured in time rather than fixes.
    const result: MockResult = durationSeconds >= MIN_ASSESSABLE_SECONDS
      ? aggregateResult
      : { ...aggregateResult, assessable: false, passed: false, score: 0 };
    set({ phase: "finished", result });
    return result;
  },

  reset: () => set({ ...initial }),
}));
