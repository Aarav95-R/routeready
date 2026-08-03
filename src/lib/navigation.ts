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

// Camera zoom by distance to the next maneuver: tight near turns, wide on
// straights. Each band has a hysteresis gap — you enter the tight band at
// 130 m but do not leave it until 180 m — so a driver hovering near a
// boundary does not get the camera zooming in and out repeatedly.
export const NAV_ZOOM_NEAR = 18.6;
export const NAV_ZOOM_MID = 18.0;
export const NAV_ZOOM_FAR = 17.5;

const NEAR_ENTER_M = 130;
const NEAR_LEAVE_M = 180;
const FAR_ENTER_M = 650;
const FAR_LEAVE_M = 550;

export function navZoom(distanceToManeuverM: number, currentZoom: number = NAV_ZOOM_MID): number {
  const d = distanceToManeuverM;
  if (currentZoom === NAV_ZOOM_NEAR) {
    if (d <= NEAR_LEAVE_M) return NAV_ZOOM_NEAR;
    return d > FAR_ENTER_M ? NAV_ZOOM_FAR : NAV_ZOOM_MID;
  }
  if (currentZoom === NAV_ZOOM_FAR) {
    if (d >= FAR_LEAVE_M) return NAV_ZOOM_FAR;
    return d < NEAR_ENTER_M ? NAV_ZOOM_NEAR : NAV_ZOOM_MID;
  }
  if (d < NEAR_ENTER_M) return NAV_ZOOM_NEAR;
  if (d > FAR_ENTER_M) return NAV_ZOOM_FAR;
  return NAV_ZOOM_MID;
}

// Nearest vertex of the route to the position, never rewinding below minIdx.
// The traveled portion is coords[0..idx]; the remaining is coords[idx..].
export function trailIndex(coords: LatLng[], pos: LatLng, minIdx = 0): number {
  if (!coords.length) return 0;
  const start = Math.min(Math.max(minIdx, 0), coords.length - 1);
  let idx = start;
  let best = Infinity;
  for (let i = start; i < coords.length; i++) {
    const d = haversineM(coords[i], pos);
    if (d < best) { best = d; idx = i; }
  }
  return idx;
}

// A point `distanceM` metres from `from` along `bearing` (deg). Used to place
// the camera ahead of the driver so they sit low with the road ahead in view.
export function destinationPoint(from: LatLng, bearing: number, distanceM: number): LatLng {
  const R = 6371000;
  const br = (bearing * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lng1 = (from.lng * Math.PI) / 180;
  const dr = distanceM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

// Below this the vehicle has no meaningful course: GPS noise alone can invent
// a bearing, and a compass reading belongs to the phone rather than the car.
export const ROAD_BEARING_MIN_MPH = 3;

// The direction the *vehicle* is travelling, or null if there isn't one.
//
// Null is the interesting answer: it means the map keeps whatever bearing it
// already had. Standing still must not turn the map, however much the phone is
// turned — that rotation belongs to the icon.
export function travelBearing(
  mph: number,
  snapBearing: number | null,
  gpsCourse: number | null
): number | null {
  if (mph < ROAD_BEARING_MIN_MPH) return null;
  if (snapBearing != null) return snapBearing;
  // CLLocationManager reports a negative course to mean "unknown".
  if (gpsCourse != null && gpsCourse >= 0) return gpsCourse;
  return null;
}
