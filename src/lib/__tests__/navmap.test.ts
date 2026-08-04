import { navFix, navSnap, type NavFixInput } from "../navmap";
import { NAV_ZOOM_MID } from "../navigation";

// A north-bound line, 11 vertices about 111 m apart.
const line = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));

const baseRaw = { lat: 51.5055, lng: -0.10005 };
const baseTrailIdx = 5;

const baseFix: NavFixInput = {
  mph: 20,
  gpsCourse: null,
  mapBearing: 0,
  compass: 0,
  bearingSeeded: true,
  zoom: NAV_ZOOM_MID,
  distanceToManeuverM: 300,
};

// Snap and fix together, the way practice.tsx calls them: one navSnap, one
// navFix, fed with an already-computed snap.
function fix(raw: typeof baseRaw = baseRaw, trailIdx = baseTrailIdx, overrides: Partial<NavFixInput> = {}) {
  const snap = navSnap(line, raw, trailIdx);
  return navFix({ ...baseFix, ...overrides, snap });
}

test("an on-route fix is snapped onto the line", () => {
  const r = fix();
  expect(r.onRoute).toBe(true);
  expect(r.pos.lng).toBeCloseTo(-0.1, 5);
});

test("a fix well off the route is left where it is", () => {
  const r = fix({ lat: 51.5055, lng: -0.102 });
  expect(r.onRoute).toBe(false);
  expect(r.pos.lng).toBeCloseTo(-0.102, 5);
});

test("the trail index never rewinds", () => {
  const r = fix({ lat: 51.5005, lng: -0.1 }, 7);
  expect(r.trailIdx).toBeGreaterThanOrEqual(7);
});

test("standing still holds the map bearing", () => {
  // The rule the whole rotation model rests on: no travel, no map rotation.
  const r = fix(baseRaw, baseTrailIdx, { mph: 0, mapBearing: 137 });
  expect(r.mapBearing).toBe(137);
});

test("moving eases the map bearing towards the road", () => {
  const r = fix(baseRaw, baseTrailIdx, { mapBearing: 90 });
  // The line runs due north, so the bearing should move down from 90 towards 0.
  expect(r.mapBearing).toBeLessThan(90);
  expect(r.mapBearing).toBeGreaterThan(0);
});

test("the first fix of a leg snaps the bearing rather than easing", () => {
  const r = fix(baseRaw, baseTrailIdx, { bearingSeeded: false, mapBearing: 90 });
  expect(r.mapBearing).toBeCloseTo(0, 0);
});

test("the seed fallback uses the compass when there is no travel direction yet", () => {
  // mph: 20 in every other test means travelBearing never returns null, so
  // the "?? compass" fallback never runs there. Pin it directly: stationary,
  // unseeded, no GPS course — the only heading available is the compass.
  const r = fix(baseRaw, baseTrailIdx, { bearingSeeded: false, mph: 0, compass: 200, mapBearing: 0 });
  expect(r.mapBearing).toBe(200);
});

test("a target within the deadband leaves the map bearing unchanged", () => {
  // The road bearing here is ~0. 2 degrees of difference is inside
  // HEADING_DEADBAND_DEG (3), so the bearing should not ease even slightly —
  // it should come back out exactly as it went in.
  const r = fix(baseRaw, baseTrailIdx, { mapBearing: 2 });
  expect(r.mapBearing).toBe(2);
});

test("icon rotation is the compass measured against the map", () => {
  const r = fix(baseRaw, baseTrailIdx, { mapBearing: 100, compass: 190, mph: 0 });
  expect(r.iconRotation).toBe(90);
});

test("zoom passes through navZoom, and holds when there is no manoeuvre", () => {
  expect(fix(baseRaw, baseTrailIdx, { distanceToManeuverM: 80 }).zoom).toBeGreaterThan(NAV_ZOOM_MID);
  expect(fix(baseRaw, baseTrailIdx, { distanceToManeuverM: null, zoom: NAV_ZOOM_MID }).zoom).toBe(NAV_ZOOM_MID);
});

test("distanceToManeuverM affects only zoom, never pos, mapBearing, iconRotation or trailIdx", () => {
  // The bug this split exists to prevent: distanceToManeuverM is derived from
  // the snapped position, so it must never be able to feed back into it.
  // Fixing everything else and varying only the distance pins that as an
  // invariant of navFix itself, not just a fact about how practice.tsx calls it.
  const snap = navSnap(line, baseRaw, baseTrailIdx);
  const a = navFix({ ...baseFix, snap, distanceToManeuverM: 80 });
  const b = navFix({ ...baseFix, snap, distanceToManeuverM: 500 });
  expect(a.pos).toEqual(b.pos);
  expect(a.mapBearing).toBe(b.mapBearing);
  expect(a.iconRotation).toBe(b.iconRotation);
  expect(a.trailIdx).toBe(b.trailIdx);
  expect(a.zoom).not.toBe(b.zoom);
});
