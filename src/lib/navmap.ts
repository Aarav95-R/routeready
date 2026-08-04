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

export type NavFixInput = {
  raw: LatLng;
  mph: number;
  gpsCourse: number | null;
  coords: LatLng[];
  trailIdx: number;
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

// The per-fix decision for the nav map: where to draw the driver, which way to
// rotate the map and the icon, how far along the route they are, and what
// zoom to sit at. A pure function of the last GPS fix and the state carried
// between fixes, so none of it needs a live map to test.
export function navFix(input: NavFixInput): NavFixResult {
  const { raw, mph, gpsCourse, coords, trailIdx, mapBearing, compass, bearingSeeded, zoom, distanceToManeuverM } = input;

  // Snap onto the active polyline. Raw GPS wanders 5-15 m, which drifts the
  // puck through gardens; the route is already in memory, so no API call.
  const snap = snapToPath(coords, raw, trailIdx, SNAP_WINDOW);
  const onRoute = !!snap && snap.distM <= SNAP_MAX_M;
  const pos = onRoute ? snap!.point : raw;

  // The map turns only when the vehicle does. travelBearing returns null
  // when we are not really moving, and null means "hold" — that is what
  // stops the map swinging round when the phone is turned at a standstill.
  // The snap gives us the road bearing for free, which is steadier than a
  // GPS course and far steadier than a hand-held compass.
  const target = travelBearing(mph, onRoute ? snap!.bearing : null, gpsCourse);
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

  const newTrailIdx = onRoute ? Math.max(trailIdx, snap!.idx) : trailIndex(coords, pos, trailIdx);

  const newZoom = distanceToManeuverM != null ? navZoom(distanceToManeuverM, zoom) : zoom;

  return { pos, onRoute, trailIdx: newTrailIdx, mapBearing: newMapBearing, iconRotation, zoom: newZoom };
}
