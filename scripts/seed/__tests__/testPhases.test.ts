import { MAX_TRIES, nextScale, PACE, PHASES, planTestRoute, TARGET_MAX_S, TARGET_MIN_S } from "../testPhases";
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

// ── tuning a loop to test length ────────────────────────────────────────────

describe("nextScale", () => {
  const mid = (TARGET_MIN_S + TARGET_MAX_S) / 2;

  test("a drive already the right length is done, and the scale is left alone", () => {
    const r = nextScale(mid, 1.3, 0.4, 2.5);
    expect(r.done).toBe(true);
    expect(r.scale).toBe(1.3);
  });

  test("both ends of the band count as inside it", () => {
    expect(nextScale(TARGET_MIN_S, 1, 0.4, 2.5).done).toBe(true);
    expect(nextScale(TARGET_MAX_S, 1, 0.4, 2.5).done).toBe(true);
  });

  test("a drive that is too short grows the loop and raises the floor", () => {
    const r = nextScale(TARGET_MIN_S / 2, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeGreaterThan(1);
    expect(r.lo).toBe(1);
    expect(r.hi).toBe(2.5);
  });

  test("a drive that is too long shrinks the loop and lowers the ceiling", () => {
    const r = nextScale(TARGET_MAX_S * 2, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeLessThan(1);
    expect(r.hi).toBe(1);
    expect(r.lo).toBe(0.4);
  });

  test("the bracket only ever narrows", () => {
    let s = { scale: 1, lo: 0.4, hi: 2.5, done: false };
    let width = s.hi - s.lo;
    for (let i = 0; i < 6 && !s.done; i++) {
      // Pretend drive time rises with scale, hitting the band around 1.6.
      s = nextScale(s.scale * 1500, s.scale, s.lo, s.hi);
      expect(s.hi - s.lo).toBeLessThanOrEqual(width);
      width = s.hi - s.lo;
    }
  });

  test("a proportional drive time converges into the band within the fetch budget", () => {
    // duration = scale * 1500 s reaches the band (1880-2192 s) at scale ~1.25-1.46.
    let s = { scale: 1, lo: 0.4, hi: 2.5, done: false };
    let tries = 0;
    while (!s.done && tries < MAX_TRIES) {
      s = nextScale(s.scale * 1500, s.scale, s.lo, s.hi);
      tries++;
    }
    expect(s.done).toBe(true);
    expect(s.scale * 1500).toBeGreaterThanOrEqual(TARGET_MIN_S);
    expect(s.scale * 1500).toBeLessThanOrEqual(TARGET_MAX_S);
  });

  test("the band is the real test's length once the learner-pace multiplier is applied", () => {
    expect(Math.round((TARGET_MIN_S * PACE) / 60)).toBe(36);
    expect(Math.round((TARGET_MAX_S * PACE) / 60)).toBe(42);
  });
});
