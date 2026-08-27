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

export function detectSpeedingFaults(samples: GpsSample[], coords: LatLng[], profile: SpeedProfileSegment[]): Fault[] {
  const faults: Fault[] = [];
  let runStart: number | null = null;
  let runLimit = 30;
  const close = (endT: number) => {
    if (runStart === null) return;
    const severity = endT - runStart >= SUSTAINED_MS ? "major" : "minor";
    faults.push({
      kind: "speeding", severity, tag: "Speeding",
      detail: `Over the ${runLimit} mph limit for ${Math.round((endT - runStart) / 1000)} s`,
    });
    runStart = null;
  };
  for (const s of samples) {
    const limit = limitAt(coords, profile, s);
    const over = mpsToMph(s.speedMps) > limit * 1.1 + 2;
    if (over && runStart === null) { runStart = s.t; runLimit = limit; }
    if (!over) close(s.t);
  }
  if (runStart !== null) close(samples[samples.length - 1].t);
  return faults;
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

export function aggregate(faults: Fault[], durationSeconds: number, credits = 0): MockResult {
  const minors = faults.filter((f) => f.severity === "minor").length;
  const majors = faults.filter((f) => f.severity === "major").length;
  const passed = majors === 0 && minors <= 15;

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
