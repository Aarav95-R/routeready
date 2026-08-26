import { haversineM, LatLng } from "./geo";
import type { NavStep } from "@/types/db";

// Within this distance of a maneuver we treat it as "reached" and advance.
export const ADVANCE_RADIUS_M = 25;
// Distance at which we first announce the upcoming maneuver ("In 250 m, …").
export const ANNOUNCE_M = 250;

// Close enough to the start line that offering to drive there would be silly,
// so the preview shows a single Start button instead.
export const AT_START_M = 60;
// Close enough to the start line to hand over from the approach leg to the
// drive itself. Tighter than AT_START_M: that one answers "is it worth
// navigating there", this one answers "are you on the start line".
export const ARRIVE_M = 30;

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

export type RouteCursor = {
  trailIdx: number;
  progressFloorIdx: number;
  stepIdx: number;
};

/** Move every route cursor to a forward rejoin point without ever rewinding. */
export function rebaseRouteCursor(
  cursor: RouteCursor,
  rejoinIdx: number,
  steps: NavStep[],
  coords: LatLng[],
): RouteCursor {
  const floor = Math.max(cursor.progressFloorIdx, cursor.trailIdx);
  const bounded = coords.length
    ? Math.min(Math.max(rejoinIdx, 0), coords.length - 1)
    : floor;
  if (bounded <= floor) return cursor;

  const progressFloorIdx = bounded;
  let stepIdx = cursor.stepIdx;
  if (steps.length && coords.length) {
    const next = steps.findIndex((step, index) =>
      index >= cursor.stepIdx
      && trailIndex(coords, { lat: step.lat, lng: step.lng }) >= progressFloorIdx);
    stepIdx = next === -1 ? steps.length - 1 : next;
  }

  return {
    trailIdx: progressFloorIdx,
    progressFloorIdx,
    stepIdx: Math.max(cursor.stepIdx, stepIdx),
  };
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

// How much of a route's length has to be behind the driver before arriving at
// its final coordinate can mean the drive is over. Not 1.0: the trail index
// stops at the last vertex the driver actually snapped to, and a car that
// pulls in a few metres short of the polyline's end would otherwise never
// finish.
export const ROUTE_PROGRESS_MIN = 0.9;

// The fraction of the route already driven, measured in metres rather than in
// vertices. `cum` is cumulativeM(coords), which the screens memoise per route.
//
// Vertices would be the obvious thing to count and would quietly lie: OSRM
// puts them densely round bends and sparsely along a straight, so a loop that
// is half bends reads as far more driven than it is.
export function routeProgress(cum: number[], trailIdx: number): number {
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 0) return 0;
  const i = Math.min(Math.max(trailIdx, 0), cum.length - 1);
  return cum[i] / total;
}

/**
 * Whether the drive is over.
 *
 * Two conditions, and they have to hold at the same moment, because every
 * seeded route is a loop whose finish is its start — measured across the 400
 * of them, the first and last coordinate are the same point to within 0.8 m.
 * A radius on its own is therefore true while the car is still parked at the
 * kerb, and progress on its own is true on the far side of the loop.
 *
 * Driven by the trail index rather than by advance()'s step index on purpose.
 * The step index only moves when the driver passes within ADVANCE_RADIUS_M of
 * each manoeuvre in turn; miss one — a wide roundabout, a dropped fix, a snap
 * onto the return leg — and it sticks there for the rest of the drive, which
 * makes arrival unreachable by construction. The trail index only needs the
 * driver to be near the *line*.
 */
export function routeComplete(coords: LatLng[], cum: number[], pos: LatLng, trailIdx: number): boolean {
  if (coords.length < 2) return false;
  if (routeProgress(cum, trailIdx) < ROUTE_PROGRESS_MIN) return false;
  return haversineM(pos, coords[coords.length - 1]) <= ARRIVE_M;
}
