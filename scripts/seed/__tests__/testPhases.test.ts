import { PHASES, planTestRoute } from "../testPhases";
import type { Feature } from "../routePlan";

const CENTRE = { lat: 51.748, lng: -0.336 };

function at(kind: Feature["kind"], bearing: number, km: number): Feature {
  const rad = (bearing * Math.PI) / 180;
  return {
    kind,
    lat: CENTRE.lat + (km / 111) * Math.cos(rad),
    lng: CENTRE.lng + (km / (111 * Math.cos((CENTRE.lat * Math.PI) / 180))) * Math.sin(rad),
  };
}

/** Several of every kind, spread all round the centre, so nothing is missing. */
const RICH: Feature[] = (
  ["estate", "roundabout", "signals", "dual", "fast", "parking", "crossing"] as const
).flatMap((kind) => Array.from({ length: 6 }, (_, i) => at(kind, (i * 360) / 6, 1.2 + (i % 3) * 0.6)));

const names = (fs: Feature[], i = 0, scale = 1) => planTestRoute(CENTRE, fs, i, scale).phases.map((p) => p.name);

test("a plan starts and ends at the centre", () => {
  const p = planTestRoute(CENTRE, RICH, 0, 1);
  expect(p.waypoints[0]).toEqual(CENTRE);
  expect(p.waypoints[p.waypoints.length - 1]).toEqual(CENTRE);
});

test("a centre with everything nearby gets all six phases, in test order", () => {
  expect(names(RICH)).toEqual(PHASES.map((p) => p.name));
});

test("phases never come out of order, even when some are missing", () => {
  const canonical = PHASES.map((p) => p.name);
  for (let i = 0; i < 10; i++) {
    const got = names(RICH, i);
    const positions = got.map((n) => canonical.indexOf(n));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  }
});

test("a centre with no fast road drops that phase rather than reaching for one", () => {
  const noFast = RICH.filter((f) => f.kind !== "fast" && f.kind !== "dual");
  expect(names(noFast)).not.toContain("faster-road");
});

test("a centre with nowhere to pull in drops the manoeuvre phase", () => {
  const noParking = RICH.filter((f) => f.kind !== "parking");
  expect(names(noParking)).not.toContain("manoeuvre");
});

test("an optional phase is dropped, never filled with a synthetic point", () => {
  const bare = RICH.filter((f) => f.kind === "estate");
  const plan = planTestRoute(CENTRE, bare, 0, 1);
  const optional = PHASES.filter((p) => p.optional).map((p) => p.name);
  for (const ph of plan.phases) {
    if (optional.includes(ph.name)) expect(ph.kind).not.toBe("ring");
  }
});

test("a centre OpenStreetMap knows nothing about still yields a drivable loop", () => {
  const plan = planTestRoute(CENTRE, [], 0, 1);
  expect(plan.waypoints.length).toBeGreaterThanOrEqual(3);
  expect(plan.waypoints[0]).toEqual(CENTRE);
  expect(plan.waypoints[plan.waypoints.length - 1]).toEqual(CENTRE);
  // The required phases fall back to compass rings; the optional ones vanish.
  expect(plan.phases.every((p) => p.kind === "ring")).toBe(true);
  expect(plan.phases.map((p) => p.name)).not.toContain("faster-road");
  expect(plan.phases.map((p) => p.name)).not.toContain("manoeuvre");
});

test("successive routes out of one centre do not repeat a direction", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    seen.add(JSON.stringify(planTestRoute(CENTRE, RICH, i, 1).waypoints));
  }
  expect(seen.size).toBe(10);
});

test("no phase reuses a feature another phase already took", () => {
  const plan = planTestRoute(CENTRE, RICH, 0, 1);
  const spots = plan.phases.filter((p) => p.kind !== "ring").map((p) => `${p.at.lat},${p.at.lng}`);
  expect(new Set(spots).size).toBe(spots.length);
});

test("the scale factor pushes the loop further out", () => {
  const spread = (scale: number) => {
    const p = planTestRoute(CENTRE, [], 0, scale);
    return Math.max(...p.waypoints.map((w) => Math.hypot(w.lat - CENTRE.lat, w.lng - CENTRE.lng)));
  };
  expect(spread(2)).toBeGreaterThan(spread(1));
  expect(spread(1)).toBeGreaterThan(spread(0.5));
});

test("the same inputs always give the same plan", () => {
  expect(planTestRoute(CENTRE, RICH, 3, 1.2)).toEqual(planTestRoute(CENTRE, RICH, 3, 1.2));
});
