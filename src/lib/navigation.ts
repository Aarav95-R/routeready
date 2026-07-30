import { haversineM, LatLng } from "./geo";
import type { NavStep } from "@/types/db";

// Within this distance of a maneuver we treat it as "reached" and advance.
export const ADVANCE_RADIUS_M = 25;
// Distance at which we first announce the upcoming maneuver ("In 250 m, …").
export const ANNOUNCE_M = 250;

export type NavState = {
  index: number;               // step currently being navigated toward
  distanceToManeuverM: number; // live distance to that maneuver
  arrived: boolean;            // reached the final step
};

export function formatDistance(m: number): string {
  if (m < 30) return "now";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Decide the live nav state from the current position and the last known index.
// Advances (never rewinds) past any maneuver already reached.
export function advance(steps: NavStep[], pos: LatLng, index: number): NavState {
  if (!steps.length) return { index: 0, distanceToManeuverM: 0, arrived: true };
  let i = Math.min(Math.max(index, 0), steps.length - 1);
  while (i < steps.length - 1 && haversineM(pos, steps[i]) <= ADVANCE_RADIUS_M) i++;
  const d = haversineM(pos, steps[i]);
  const arrived = i >= steps.length - 1 && d <= ADVANCE_RADIUS_M;
  return { index: i, distanceToManeuverM: Math.round(d), arrived };
}

// Distance still to drive: reach the current maneuver, then the remaining legs.
export function remainingM(steps: NavStep[], pos: LatLng, index: number): number {
  if (!steps.length) return 0;
  const i = Math.min(Math.max(index, 0), steps.length - 1);
  let sum = haversineM(pos, steps[i]);
  for (let k = i; k < steps.length; k++) sum += steps[k].distanceM;
  return Math.round(sum);
}
