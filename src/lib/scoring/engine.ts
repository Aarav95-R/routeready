import { LatLng, mpsToMph, nearestVertex } from "../geo";
import type { ObservationZone, SpeedProfileSegment } from "@/types/db";

export type GpsSample = { lat: number; lng: number; speedMps: number; t: number };
export type Fault = { kind: "speeding" | "observation" | "examiner"; severity: "minor" | "major"; detail: string; tag: string };
export type MockResult = {
  assessable: boolean; passed: boolean; score: number; minors: number; majors: number; credits: number;
  faults: Fault[]; tags: string[]; durationSeconds: number;
};
export const SUSTAINED_MS = 5000;

export function limitAt(coords: LatLng[], profile: SpeedProfileSegment[], p: LatLng): number {
  if (!coords.length || !profile.length) return 30;
  const { idx } = nearestVertex(coords, p);
  return profile.find((s) => idx >= s.startIdx && idx <= s.endIdx)?.limitMph ?? 30;
}

/**
 * A speeding run in progress, and the faults closed out so far.
 *
 * Speeding used to be detected in one pass at the end of the drive, which is
 * all the result screen needs. The mock test's live fault meter needs the same
 * number *during* the drive, and re-running the whole detector on every fix is
 * O(n²) with an `limitAt` scan of the route inside it — several thousand
 * samples over a forty-minute drive.
 *
 * So the detector is a fold instead, and the two callers differ only in when
 * they seal it: the store steps this per sample and seals at `finish()`, while
 * `detectSpeedingFaults` folds a whole array and seals immediately. One
 * implementation, so the live meter and the verdict can never disagree.
 */
export type SpeedingState = { runStart: number | null; runLimit: number; faults: Fault[] };

export const initialSpeeding: SpeedingState = { runStart: null, runLimit: 30, faults: [] };

function closeRun(state: SpeedingState, endT: number): SpeedingState {
  if (state.runStart === null) return state;
  const severity = endT - state.runStart >= SUSTAINED_MS ? "major" : "minor";
  return {
    runStart: null,
    runLimit: state.runLimit,
    faults: [...state.faults, {
      kind: "speeding", severity, tag: "Speeding",
      detail: `Over the ${state.runLimit} mph limit for ${Math.round((endT - state.runStart) / 1000)} s`,
    }],
  };
}

/** One sample. `limit` is the mph limit where that sample was taken. */
export function stepSpeeding(state: SpeedingState, sample: GpsSample, limit: number): SpeedingState {
  const over = mpsToMph(sample.speedMps) > limit * 1.1 + 2;
  if (over) {
    return state.runStart === null ? { ...state, runStart: sample.t, runLimit: limit } : state;
  }
  return closeRun(state, sample.t);
}

/**
 * Close an open run at the end of the drive. A driver still over the limit as
 * the test ends has still been speeding, and without this that run is dropped.
 */
export function sealSpeeding(state: SpeedingState, lastT: number): SpeedingState {
  return closeRun(state, lastT);
}

export function detectSpeedingFaults(samples: GpsSample[], coords: LatLng[], profile: SpeedProfileSegment[]): Fault[] {
  let state = initialSpeeding;
  for (const s of samples) state = stepSpeeding(state, s, limitAt(coords, profile, s));
  if (samples.length) state = sealSpeeding(state, samples[samples.length - 1].t);
  return state.faults;
}

const ZONE_TAGS: Record<ObservationZone["kind"], string> = {
  roundabout: "Roundabout observations",
  junction: "Junction observations",
  pedestrian: "Pedestrian awareness",
};

export function detectObservationFaults(zoneEvents: { zone: ObservationZone; tapped: boolean }[]): Fault[] {
  return zoneEvents
    .filter((e) => !e.tapped)
    .map((e) => ({
      kind: "observation" as const, severity: "minor" as const,
      detail: `Missed mirror check at ${e.zone.kind}`, tag: ZONE_TAGS[e.zone.kind],
    }));
}

// Credits are this app's own idea — DVSA records faults only. They are worth a
// few points of encouragement on the practice score and nothing at all on the
// verdict, because telling someone they passed when they would not have is the
// one failure this app cannot afford.
export const MAX_CREDIT_POINTS = 10;
const FAILED_SCORE_CEILING = 55;

/**
 * DVSA's own thresholds: the sixteenth driving fault fails the test, and so
 * does a single serious or dangerous one.
 *
 * Named because the mock test's live meter draws exactly this many ticks. A
 * second literal on the screen is how the meter and the verdict end up
 * disagreeing about what a pass is.
 */
export const MAX_MINORS = 15;

/**
 * Below this, a mock test is not given a verdict.
 *
 * The score comes from the examiner's mark sheet and nothing else, so an empty
 * sheet is a clean drive — which means opening a test and finishing it a moment
 * later would otherwise read as a pass at 100. The guard that used to prevent
 * that asked whether any GPS samples had arrived, which stopped meaning
 * anything once the phone stopped being evidence.
 *
 * Duration is the honest replacement: it needs no GPS, and nobody assesses a
 * drive that lasted four minutes. It is deliberately well short of a real
 * test's forty so that a genuinely short practice run still gets its verdict.
 */
export const MIN_ASSESSABLE_SECONDS = 300;

export function aggregate(faults: Fault[], durationSeconds: number, credits = 0): MockResult {
  const minors = faults.filter((f) => f.severity === "minor").length;
  const majors = faults.filter((f) => f.severity === "major").length;
  const passed = majors === 0 && minors <= MAX_MINORS;

  const raw = 100 - 5 * minors - 40 * majors + Math.min(credits, MAX_CREDIT_POINTS);
  const bounded = Math.max(0, Math.min(100, raw));

  return {
    assessable: true,
    passed,
    // A failed test must not read like a comfortable pass, however many
    // credits were banked.
    score: passed ? bounded : Math.min(bounded, FAILED_SCORE_CEILING),
    minors, majors, credits, faults,
    tags: [...new Set(faults.map((f) => f.tag))],
    durationSeconds,
  };
}
