import { bearingDeg, bandSpeedMph, LatLng } from "../../src/lib/geo";
import type { ObservationZone, SpeedProfileSegment } from "../../src/types/db";

export function detectTurnPoints(coords: LatLng[], minAngle = 45): { idx: number; angle: number }[] {
  const out: { idx: number; angle: number }[] = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const b1 = bearingDeg(coords[i - 1], coords[i]);
    const b2 = bearingDeg(coords[i], coords[i + 1]);
    let d = b2 - b1;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) >= minAngle) out.push({ idx: i, angle: d });
  }
  return out;
}

export function deriveDifficulty(distanceKm: number, turnCount: number): 1 | 2 | 3 | 4 | 5 {
  const score = distanceKm * 0.3 + turnCount * 0.35;
  if (score < 2) return 1;
  if (score < 4) return 2;
  if (score < 6) return 3;
  if (score < 8.5) return 4;
  return 5;
}

export function deriveSpeedProfile(speedsMps: (number | null)[]): SpeedProfileSegment[] {
  const out: SpeedProfileSegment[] = [];
  let start = 0;
  let band = bandSpeedMph(speedsMps[0] ?? 12);
  for (let i = 1; i <= speedsMps.length; i++) {
    const b = i < speedsMps.length ? bandSpeedMph(speedsMps[i] ?? 12) : null;
    if (b !== band) {
      out.push({ startIdx: start, endIdx: i - 1, limitMph: band });
      if (b !== null) { start = i; band = b; }
    }
  }
  return out;
}

const HAZARD_TYPES = ["junction", "roundabout", "zebra", "narrow"] as const;
const DESCRIPTIONS: Record<(typeof HAZARD_TYPES)[number], string> = {
  junction: "Tight junction — position early and check both mirrors before turning.",
  roundabout: "Busy roundabout — mirror-signal-position on approach, watch lane discipline on exit.",
  zebra: "Pedestrian crossing — scan pavements early and be ready to stop smoothly.",
  narrow: "Narrow section with parked cars — hold back and give way where the obstruction is on your side.",
};

export function deriveHazards(coords: LatLng[]) {
  return detectTurnPoints(coords, 60)
    .slice(0, 4)
    .map((t, i) => {
      const type = HAZARD_TYPES[i % HAZARD_TYPES.length];
      return {
        lat: coords[t.idx].lat, lng: coords[t.idx].lng, type,
        description: DESCRIPTIONS[type],
        severity: Math.abs(t.angle) > 100 ? "high" : i % 2 === 0 ? "medium" : "low",
      };
    });
}

export function deriveObservationZones(coords: LatLng[]): ObservationZone[] {
  return detectTurnPoints(coords, 60)
    .slice(0, 4)
    .map((t, i) => ({
      lat: coords[t.idx].lat, lng: coords[t.idx].lng, radiusM: 60,
      kind: i % 2 === 0 ? "roundabout" : "junction",
    }));
}
