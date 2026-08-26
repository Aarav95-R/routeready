import { advance, ADVANCE_RADIUS_M, destinationPoint, formatDistance, navZoom, NAV_ZOOM_NEAR, NAV_ZOOM_MID, NAV_ZOOM_FAR, rebaseRouteCursor, remainingM, ROAD_BEARING_MIN_MPH, routeComplete, ROUTE_PROGRESS_MIN, trailIndex, travelBearing } from "../navigation";
import { cumulativeM, haversineM } from "../geo";
import type { NavStep } from "@/types/db";

const mk = (lat: number, lng: number, instruction: string, distanceM = 100): NavStep =>
  ({ lat, lng, instruction, road: "", type: "turn", modifier: "", distanceM });

// three maneuvers spaced ~1.1km apart heading north
const steps: NavStep[] = [
  mk(51.50, -0.1, "Head off", 1112),
  mk(51.51, -0.1, "Turn right", 1112),
  mk(51.52, -0.1, "You have reached the end of the route", 0),
];

test("formatDistance rounds sensibly", () => {
  expect(formatDistance(12)).toBe("now");
  expect(formatDistance(184)).toBe("180 m");
  expect(formatDistance(950)).toBe("950 m");
  expect(formatDistance(1500)).toBe("1.5 km");
  expect(formatDistance(2340)).toBe("2.3 km");
});

test("advance keeps the current maneuver until you reach it", () => {
  // near start, heading toward step 1 (the turn)
  const s = advance(steps, { lat: 51.505, lng: -0.1 }, 1);
  expect(s.index).toBe(1);
  expect(s.distanceToManeuverM).toBeGreaterThan(400);
  expect(s.arrived).toBe(false);
});

test("advance moves to the next maneuver once within the radius", () => {
  // essentially on top of step 1's maneuver
  const s = advance(steps, { lat: 51.51, lng: -0.1 }, 1);
  expect(s.index).toBe(2);
});

test("advance never goes backwards", () => {
  const s = advance(steps, { lat: 51.50, lng: -0.1 }, 2);
  expect(s.index).toBe(2);
});

test("arrived is true at the final step within radius", () => {
  const s = advance(steps, { lat: 51.52, lng: -0.1 }, 2);
  expect(s.arrived).toBe(true);
});

test("ADVANCE_RADIUS_M is a small on-street threshold", () => {
  expect(ADVANCE_RADIUS_M).toBeGreaterThan(10);
  expect(ADVANCE_RADIUS_M).toBeLessThan(60);
});

test("remainingM sums the current leg plus the rest", () => {
  // ~550 m short of step 1, plus step 1's 1112 m leg to the end
  const r = remainingM(steps, { lat: 51.505, lng: -0.1 }, 1);
  expect(r).toBeGreaterThan(1500);
  expect(r).toBeLessThan(1800);
});

// a north-bound line of 11 vertices ~111 m apart
const line = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));

test("navZoom tightens near turns, widens on straights", () => {
  expect(navZoom(80)).toBeGreaterThan(navZoom(300));
  expect(navZoom(300)).toBeGreaterThan(navZoom(900));
  expect(navZoom(80)).toBe(NAV_ZOOM_NEAR);
  expect(navZoom(300)).toBe(NAV_ZOOM_MID);
  expect(navZoom(900)).toBe(NAV_ZOOM_FAR);
});

test("navZoom steps are small enough to be barely visible", () => {
  expect(NAV_ZOOM_NEAR - NAV_ZOOM_MID).toBeLessThanOrEqual(0.75);
  expect(NAV_ZOOM_MID - NAV_ZOOM_FAR).toBeLessThanOrEqual(0.75);
});

test("navZoom does not oscillate while hovering at 150 m", () => {
  // 150 m sits inside the near band's hysteresis gap (130 enter / 180 leave),
  // so the answer depends on where we already are — and never flip-flops.
  let z = NAV_ZOOM_MID;
  z = navZoom(120, z);
  expect(z).toBe(NAV_ZOOM_NEAR);
  z = navZoom(150, z);
  expect(z).toBe(NAV_ZOOM_NEAR);
  z = navZoom(175, z);
  expect(z).toBe(NAV_ZOOM_NEAR);
  z = navZoom(200, z);
  expect(z).toBe(NAV_ZOOM_MID);
  z = navZoom(150, z);
  expect(z).toBe(NAV_ZOOM_MID);
});

test("navZoom holds the wide level until you are clearly approaching", () => {
  let z = navZoom(700, NAV_ZOOM_MID);
  expect(z).toBe(NAV_ZOOM_FAR);
  z = navZoom(600, z);
  expect(z).toBe(NAV_ZOOM_FAR);
  z = navZoom(500, z);
  expect(z).toBe(NAV_ZOOM_MID);
});

test("navZoom can jump straight from wide to tight on a big distance drop", () => {
  expect(navZoom(90, NAV_ZOOM_FAR)).toBe(NAV_ZOOM_NEAR);
  expect(navZoom(900, NAV_ZOOM_NEAR)).toBe(NAV_ZOOM_FAR);
});

test("trailIndex tracks the nearest vertex and never rewinds", () => {
  expect(trailIndex(line, { lat: 51.5, lng: -0.1 }, 0)).toBe(0);
  expect(trailIndex(line, { lat: 51.5052, lng: -0.1 }, 0)).toBe(5);
  // even if we drift back, progress index does not go below minIdx
  expect(trailIndex(line, { lat: 51.5, lng: -0.1 }, 5)).toBe(5);
});

test("a large forward rejoin rebases the trail floor and manoeuvre cursor", () => {
  const coords = Array.from({ length: 201 }, (_, i) => ({ lat: 51.5 + i * 0.0001, lng: -0.1 }));
  const routeSteps = [0, 50, 100, 150, 200].map((idx, i) =>
    mk(coords[idx].lat, coords[idx].lng, `Step ${i}`));

  expect(rebaseRouteCursor(
    { trailIdx: 20, progressFloorIdx: 20, stepIdx: 1 },
    160,
    routeSteps,
    coords,
  )).toEqual({ trailIdx: 160, progressFloorIdx: 160, stepIdx: 4 });
});

test("rebasing behind current progress never rewinds any cursor", () => {
  expect(rebaseRouteCursor(
    { trailIdx: 20, progressFloorIdx: 20, stepIdx: 1 },
    10,
    steps,
    line,
  )).toEqual({ trailIdx: 20, progressFloorIdx: 20, stepIdx: 1 });
});

test("destinationPoint lands the right distance ahead on the given bearing", () => {
  const from = { lat: 51.5, lng: -0.1 };
  const north = destinationPoint(from, 0, 1000);
  expect(north.lat).toBeGreaterThan(from.lat);
  expect(haversineM(from, north)).toBeCloseTo(1000, -1);
  const east = destinationPoint(from, 90, 500);
  expect(east.lng).toBeGreaterThan(from.lng);
  expect(haversineM(from, east)).toBeCloseTo(500, -1);
});

test("travelBearing is null when stopped, so the map holds its bearing", () => {
  // The whole point: twisting the phone at a red light must not turn the map.
  expect(travelBearing(0, 90, 90)).toBeNull();
  expect(travelBearing(ROAD_BEARING_MIN_MPH - 0.1, 90, 90)).toBeNull();
});

test("travelBearing prefers the snapped road bearing once moving", () => {
  expect(travelBearing(20, 137, 142)).toBe(137);
});

test("travelBearing falls back to GPS course when off the route", () => {
  expect(travelBearing(20, null, 142)).toBe(142);
});

test("travelBearing rejects the invalid GPS course iOS reports", () => {
  // CLLocationManager uses a negative course to mean "unknown".
  expect(travelBearing(20, null, -1)).toBeNull();
  expect(travelBearing(20, null, null)).toBeNull();
});

test("ROAD_BEARING_MIN_MPH is a walking-pace threshold", () => {
  expect(ROAD_BEARING_MIN_MPH).toBeGreaterThan(0);
  expect(ROAD_BEARING_MIN_MPH).toBeLessThan(10);
});

// ── Completing a route ────────────────────────────────────────────────────
//
// A seeded route is a loop: its last coordinate IS its first, so "near the
// finish" is true while parked on the start line. These cover the two
// conditions that have to hold together for the drive to be over.

// A closed loop: 100 vertices out and back, ending exactly where it started.
const loop = (() => {
  const out = Array.from({ length: 51 }, (_, i) => ({ lat: 51.5 + i * 0.0002, lng: -0.1 }));
  const back = Array.from({ length: 50 }, (_, i) => ({ lat: 51.51 - (i + 1) * 0.0002, lng: -0.1001 }));
  return [...out, ...back, { lat: 51.5, lng: -0.1 }];
})();
const loopCum = cumulativeM(loop);

test("routeComplete is false on the start line of a loop, before driving it", () => {
  // The case the whole check exists for: standing on coords[0], which is also
  // coords[n]. A radius alone would call this finished.
  expect(routeComplete(loop, loopCum, { lat: 51.5, lng: -0.1 }, 0)).toBe(false);
});

test("routeComplete is false when back at the start but short of the distance", () => {
  const idx = Math.round((loop.length - 1) * 0.7);
  expect(routeComplete(loop, loopCum, loop[loop.length - 1], idx)).toBe(false);
});

test("routeComplete is true once the loop is driven and the driver is back", () => {
  expect(routeComplete(loop, loopCum, loop[loop.length - 1], loop.length - 1)).toBe(true);
});

test("routeComplete is false at the far end of the loop, however much is driven", () => {
  // 95% of the way round but still ~1 km from home: not finished.
  const idx = Math.round((loop.length - 1) * 0.95);
  expect(routeComplete(loop, loopCum, { lat: 51.505, lng: -0.1001 }, idx)).toBe(false);
});

test("routeComplete ends a straight there-and-stop leg, like the drive to the start", () => {
  const line = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));
  const cum = cumulativeM(line);
  expect(routeComplete(line, cum, line[10], 10)).toBe(true);
  expect(routeComplete(line, cum, line[0], 0)).toBe(false);
});

test("routeComplete tolerates GPS noise at the kerb", () => {
  // ~20 m east of the finish, loop driven: still finished.
  const near = destinationPoint(loop[loop.length - 1], 90, 20);
  expect(routeComplete(loop, loopCum, near, loop.length - 1)).toBe(true);
});

test("routeComplete says no when there is no route", () => {
  expect(routeComplete([], [], { lat: 51.5, lng: -0.1 }, 0)).toBe(false);
});

test("ROUTE_PROGRESS_MIN leaves room for a shortcut home but not for half a loop", () => {
  expect(ROUTE_PROGRESS_MIN).toBeGreaterThan(0.75);
  expect(ROUTE_PROGRESS_MIN).toBeLessThan(1);
});
