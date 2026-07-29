import { LatLng, mpsToMph, nearestVertex } from "../geo";
import type { ObservationZone, SpeedProfileSegment } from "@/types/db";

export type GpsSample = { lat: number; lng: number; speedMps: number; t: number };
export type Fault = { kind: "speeding" | "observation"; severity: "minor" | "serious"; detail: string; tag: string };
export type MockResult = {
  passed: boolean; score: number; minors: number; serious: number;
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
    const severity = endT - runStart >= SUSTAINED_MS ? "serious" : "minor";
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

export function aggregate(faults: Fault[], durationSeconds: number): MockResult {
  const minors = faults.filter((f) => f.severity === "minor").length;
  const serious = faults.filter((f) => f.severity === "serious").length;
  return {
    passed: serious === 0 && minors <= 15,
    score: Math.max(0, 100 - 5 * minors - 40 * serious),
    minors, serious, faults,
    tags: [...new Set(faults.map((f) => f.tag))],
    durationSeconds,
  };
}
