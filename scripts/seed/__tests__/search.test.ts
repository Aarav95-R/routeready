import { RETRY_STRIDE, searchRoute } from "../search";
import { SCALE_LO, TARGET_MAX_M, TARGET_MIN_M } from "../testPhases";
import type { Feature } from "../routePlan";
import type { LatLng } from "../../../src/lib/geo";

const CENTRE = { lat: 51.6087, lng: -0.2412 };
const NO_FEATURES: Feature[] = [];

const inBand = (m: number) => m >= TARGET_MIN_M && m <= TARGET_MAX_M;

/**
 * A router that answers from the waypoints alone.
 *
 * The real one answers from the road network, which is the whole difficulty —
 * but everything worth testing here is how the search *reacts* to an answer,
 * not what the answer is. So the fake is a function of the geometry, and each
 * test writes the function it needs.
 */
function router(distanceFor: (waypoints: LatLng[]) => number) {
  const seen: LatLng[][] = [];
  const fetch = async (waypoints: LatLng[]) => {
    seen.push(waypoints);
    const distanceM = distanceFor(waypoints);
    return {
      distanceM,
      durationS: distanceM / 8,
      coords: waypoints,
      legEdgeCounts: [],
      speedsMps: [],
      steps: [],
    } as never;
  };
  return { seen, fetch };
}

/** How far the anchors were thrown from the centre, in km. */
const spreadKm = (waypoints: LatLng[]) =>
  Math.max(...waypoints.slice(1, -1).map((w) =>
    Math.hypot((w.lat - CENTRE.lat) * 111, (w.lng - CENTRE.lng) * 69)));

/** The compass bearing of the first anchor, which is what a retry changes. */
const firstBearing = (waypoints: LatLng[]) => {
  const w = waypoints[1];
  const deg = (Math.atan2(w.lng - CENTRE.lng, w.lat - CENTRE.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
};

// The ladder climbs from its smallest rung, so where several sizes would do
// the shortest wins - a learner asked for a practice loop, not the longest one
// that fits.
test("the smallest rung that works is the one taken", async () => {
  const r = router(() => 16_000);

  const found = await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  expect(found.converged).toBe(true);
  expect(found.retried).toBe(false);
  expect(found.fetches).toBe(1);
});

test("a loop whose length follows its radius is found on the ladder", async () => {
  const r = router((w) => spreadKm(w) * 6_000);

  const found = await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  expect(found.converged).toBe(true);
  expect(inBand(found.route.distanceM)).toBe(true);
});

// Mill Hill route 9 and Hendon route 3, both measured: 30 km at scale 0.30
// after every fetch in the budget. Shrinking threefold moved the length
// fifteen per cent, because a severed network makes some bearings structurally
// long - the drive is dominated by the detour to the next legal crossing, not
// by the radius. No amount of bisection fixes that, and the old generator
// wrote the 30 km loop out as a practice route anyway.
test("a bearing that stays long however small the radius gets is retried elsewhere", async () => {
  // Everything in the northern half of the compass is severed.
  const r = router((w) => (firstBearing(w) < 180 ? 30_000 : spreadKm(w) * 6_000));

  const found = await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  expect(found.retried).toBe(true);
  expect(found.converged).toBe(true);
  expect(inBand(found.route.distanceM)).toBe(true);
});

test("the retry is a different bearing, not the same one again", async () => {
  const r = router((w) => (firstBearing(w) < 180 ? 30_000 : spreadKm(w) * 6_000));

  await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  const bearings = new Set(r.seen.map((w) => Math.round(firstBearing(w))));
  expect(bearings.size).toBeGreaterThan(1);
});

// The one thing that must never happen quietly. A 30 km loop written out as a
// forty-minute practice route is the exact lie this whole module exists to
// stop telling.
test("a centre where nothing converges says so rather than passing one off", async () => {
  const r = router(() => 30_000);

  const found = await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  expect(found.converged).toBe(false);
  expect(found.retried).toBe(true);
});

test("the search never leaves the scale bracket", async () => {
  const r = router(() => 30_000);

  const found = await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  expect(found.scale).toBeGreaterThanOrEqual(SCALE_LO);
});

// A full run is forty centres of ten routes against a public server, so the
// budget is the difference between ten minutes and an afternoon.
test("the fetch budget is bounded even when nothing works", async () => {
  const r = router(() => 30_000);

  const found = await searchRoute(CENTRE, NO_FEATURES, 0, r.fetch);

  expect(found.fetches).toBeLessThanOrEqual(16);
});

test("the retry stride does not land back on another route's bearing", async () => {
  // Ten routes per centre, so a stride inside 1..9 would collide with one of
  // them and produce two identical loops at the same centre.
  expect(RETRY_STRIDE).toBeGreaterThanOrEqual(10);
});
