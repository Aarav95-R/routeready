import { iconRotationDeg, LatLng, smoothHeading, snapToPath, turnAngleDeg } from "./geo";
import { navZoom, trailIndex, travelBearing } from "./navigation";

export const SNAP_MAX_M = 40;          // beyond this we assume you've left the route
export const SNAP_WINDOW = 30;         // vertices searched either side of the current index
// Two rotations, two sources. The MAP turns only when the vehicle travels in a
// new direction, so it holds still at a red light however the phone is waved
// about. The ICON turns with the compass, drawn at its angle relative to the
// map — mounted facing forward the two agree and it sits upright by itself.
export const HEADING_ALPHA = 0.15;     // map bearing: heavy filter, it should feel settled
export const HEADING_DEADBAND_DEG = 3;

export type NavSnapResult = {
  pos: LatLng;
  onRoute: boolean;
  trailIdx: number;
  snapBearing: number | null;
};

// Snap the raw GPS fix onto the active polyline. This is the one place the
// snapped position is computed — navFix takes the result rather than the raw
// fix, so nothing downstream can end up with a position that disagrees with
// the trail index or the road bearing it was derived from.
//
// Raw GPS wanders 5-15 m, which drifts the puck through gardens; the route is
// already in memory, so no API call.
export function navSnap(coords: LatLng[], raw: LatLng, trailIdx: number): NavSnapResult {
  const snap = snapToPath(coords, raw, trailIdx, SNAP_WINDOW);
  const onRoute = !!snap && snap.distM <= SNAP_MAX_M;
  const pos = onRoute ? snap!.point : raw;
  const newTrailIdx = onRoute ? Math.max(trailIdx, snap!.idx) : trailIndex(coords, pos, trailIdx);
  // The road bearing is only meaningful while actually on the road; off-route
  // it would just be whichever segment happened to be nearest.
  const snapBearing = onRoute ? snap!.bearing : null;
  return { pos, onRoute, trailIdx: newTrailIdx, snapBearing };
}

export type NavFixInput = {
  mph: number;
  gpsCourse: number | null;
  mapBearing: number;
  compass: number;
  bearingSeeded: boolean;
  zoom: number;
  distanceToManeuverM: number | null;  // null when the screen has no steps
};

export type NavFixResult = {
  pos: LatLng;
  onRoute: boolean;
  trailIdx: number;
  mapBearing: number;
  iconRotation: number;
  zoom: number;
};

// The per-fix decision for the nav map: which way to rotate the map and the
// icon, and what zoom to sit at, given an already-snapped position. Takes the
// snap as an input rather than computing it, so distanceToManeuverM (which
// itself depends on the snapped position, via advance()) can be threaded in
// without a second, throwaway snap. A pure function, so none of it needs a
// live map to test.
export function navFix(input: NavFixInput & { snap: NavSnapResult }): NavFixResult {
  const { mph, gpsCourse, mapBearing, compass, bearingSeeded, zoom, distanceToManeuverM, snap } = input;

  // The map turns only when the vehicle does. travelBearing returns null
  // when we are not really moving, and null means "hold" — that is what
  // stops the map swinging round when the phone is turned at a standstill.
  // The snap gives us the road bearing for free, which is steadier than a
  // GPS course and far steadier than a hand-held compass.
  const target = travelBearing(mph, snap.snapBearing, gpsCourse);
  let newMapBearing: number;
  if (!bearingSeeded) {
    // First fix of a leg. There may be no travel direction yet (still
    // stationary at the kerb), so fall back to the compass just this once,
    // to start facing the way the car faces rather than north.
    newMapBearing = target ?? compass;
  } else if (target != null && Math.abs(turnAngleDeg(mapBearing, target)) >= HEADING_DEADBAND_DEG) {
    // Deadband: sub-3-degree wiggle never reaches the camera at all.
    newMapBearing = smoothHeading(mapBearing, target, HEADING_ALPHA);
  } else {
    newMapBearing = mapBearing;
  }

  // The icon's angle is relative to the map, so a map that turned changes it
  // even when the phone did not move.
  const iconRotation = iconRotationDeg(newMapBearing, compass);

  const newZoom = distanceToManeuverM != null ? navZoom(distanceToManeuverM, zoom) : zoom;

  return { pos: snap.pos, onRoute: snap.onRoute, trailIdx: snap.trailIdx, mapBearing: newMapBearing, iconRotation, zoom: newZoom };
}
