import { navFix, type NavFixInput } from "../navmap";
import { NAV_ZOOM_MID } from "../navigation";

// A north-bound line, 11 vertices about 111 m apart.
const line = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));

const base: NavFixInput = {
  raw: { lat: 51.5055, lng: -0.10005 },
  mph: 20,
  gpsCourse: null,
  coords: line,
  trailIdx: 5,
  mapBearing: 0,
  compass: 0,
  bearingSeeded: true,
  zoom: NAV_ZOOM_MID,
  distanceToManeuverM: 300,
};

test("an on-route fix is snapped onto the line", () => {
  const r = navFix(base);
  expect(r.onRoute).toBe(true);
  expect(r.pos.lng).toBeCloseTo(-0.1, 5);
});

test("a fix well off the route is left where it is", () => {
  const r = navFix({ ...base, raw: { lat: 51.5055, lng: -0.102 } });
  expect(r.onRoute).toBe(false);
  expect(r.pos.lng).toBeCloseTo(-0.102, 5);
});

test("the trail index never rewinds", () => {
  const r = navFix({ ...base, raw: { lat: 51.5005, lng: -0.1 }, trailIdx: 7 });
  expect(r.trailIdx).toBeGreaterThanOrEqual(7);
});

test("standing still holds the map bearing", () => {
  // The rule the whole rotation model rests on: no travel, no map rotation.
  const r = navFix({ ...base, mph: 0, mapBearing: 137 });
  expect(r.mapBearing).toBe(137);
});

test("moving eases the map bearing towards the road", () => {
  const r = navFix({ ...base, mapBearing: 90 });
  // The line runs due north, so the bearing should move down from 90 towards 0.
  expect(r.mapBearing).toBeLessThan(90);
  expect(r.mapBearing).toBeGreaterThan(0);
});

test("the first fix of a leg snaps the bearing rather than easing", () => {
  const r = navFix({ ...base, bearingSeeded: false, mapBearing: 90 });
  expect(r.mapBearing).toBeCloseTo(0, 0);
});

test("icon rotation is the compass measured against the map", () => {
  const r = navFix({ ...base, mapBearing: 100, compass: 190, mph: 0 });
  expect(r.iconRotation).toBe(90);
});

test("zoom passes through navZoom, and holds when there is no manoeuvre", () => {
  expect(navFix({ ...base, distanceToManeuverM: 80 }).zoom).toBeGreaterThan(NAV_ZOOM_MID);
  expect(navFix({ ...base, distanceToManeuverM: null, zoom: NAV_ZOOM_MID }).zoom).toBe(NAV_ZOOM_MID);
});
