import { MAX_TRIES, nextScale, PACE, phaseBounds, PHASES, planTestRoute, TARGET_MAX_M, TARGET_MAX_S, TARGET_MIN_M, TARGET_MIN_S } from "../testPhases";
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
// Each kind sits on its own radius, so no two features share a position — the
// reuse check below compares coordinates, and identical ones would read as a
// phase taking a feature another phase already had.
const RICH: Feature[] = (
  ["estate", "roundabout", "signals", "dual", "fast", "parking", "crossing"] as const
).flatMap((kind, k) => Array.from({ length: 6 }, (_, i) => at(kind, (i * 360) / 6, 1.0 + k * 0.11 + (i % 3) * 0.6)));

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

test("a centre with no tagged parking still gets a manoeuvre, on a quiet street", () => {
  // Kerbside-parking tagging is patchy enough in the UK that requiring it
  // dropped the phase everywhere, so a residential street is the fallback.
  const noParking = RICH.filter((f) => f.kind !== "parking");
  expect(names(noParking)).toContain("manoeuvre");
});

test("a centre with nowhere at all to pull in drops the manoeuvre phase", () => {
  const noStreets = RICH.filter((f) => f.kind !== "parking" && f.kind !== "estate");
  expect(names(noStreets)).not.toContain("manoeuvre");
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
    const r = nextScale(mid, 16000, 1.3, 0.4, 2.5);
    expect(r.done).toBe(true);
    expect(r.scale).toBe(1.3);
  });

  test("both ends of the band count as inside it", () => {
    expect(nextScale(TARGET_MIN_S, 16000, 1, 0.4, 2.5).done).toBe(true);
    expect(nextScale(TARGET_MAX_S, 16000, 1, 0.4, 2.5).done).toBe(true);
  });

  test("a drive that is too short grows the loop and raises the floor", () => {
    const r = nextScale(TARGET_MIN_S / 2, 8000, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeGreaterThan(1);
    expect(r.lo).toBe(1);
    expect(r.hi).toBe(2.5);
  });

  test("a drive that is too long shrinks the loop and lowers the ceiling", () => {
    const r = nextScale(TARGET_MAX_S * 2, 40000, 1, 0.4, 2.5);
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
      s = nextScale(s.scale * 1500, s.scale * 12000, s.scale, s.lo, s.hi);
      expect(s.hi - s.lo).toBeLessThanOrEqual(width);
      width = s.hi - s.lo;
    }
  });

  test("a loop whose length rises with scale converges inside the fetch budget", () => {
    // distance = scale * 12 km reaches the 13-19 km band at scale ~1.08-1.58.
    let s = { scale: 1, lo: 0.4, hi: 2.5, done: false };
    let tries = 0;
    while (!s.done && tries < MAX_TRIES) {
      s = nextScale(s.scale * 1200, s.scale * 12000, s.scale, s.lo, s.hi);
      tries++;
    }
    expect(s.done).toBe(true);
    expect(s.scale * 12000).toBeGreaterThanOrEqual(TARGET_MIN_M);
    expect(s.scale * 12000).toBeLessThanOrEqual(TARGET_MAX_M);
  });

  test("the time band is the real test's length once the pace multiplier is applied", () => {
    expect(Math.round((TARGET_MIN_S * PACE) / 60)).toBe(36);
    expect(Math.round((TARGET_MAX_S * PACE) / 60)).toBe(42);
  });
});

describe("phaseBounds", () => {
  const phase = (name: string) => ({ name, kind: "estate", at: { lat: 0, lng: 0 } }) as never;
  const three = [phase("settle-in"), phase("junction-work"), phase("return")];

  test("phases tile the polyline end to end, without gaps", () => {
    const b = phaseBounds([10, 20, 30], three, 61);
    expect(b[0].startIdx).toBe(0);
    expect(b[0].endIdx).toBe(b[1].startIdx);
    expect(b[1].endIdx).toBe(b[2].startIdx);
    expect(b[2].endIdx).toBe(60);
  });

  test("the last phase always reaches the end of the route", () => {
    // Leg counts that undershoot the geometry must not leave the loop short.
    const b = phaseBounds([5, 5, 5], three, 61);
    expect(b[b.length - 1].endIdx).toBe(60);
  });

  test("no index ever runs past the end of the polyline", () => {
    const b = phaseBounds([500, 500, 500], three, 61);
    for (const p of b) {
      expect(p.startIdx).toBeLessThanOrEqual(60);
      expect(p.endIdx).toBeLessThanOrEqual(60);
    }
  });

  test("a missing leg count does not shift every later phase", () => {
    const b = phaseBounds([10], three, 61);
    expect(b[0].endIdx).toBe(10);
    expect(b[1].startIdx).toBe(10);
  });

  test("the phase names and kinds are carried through untouched", () => {
    const b = phaseBounds([10, 20, 30], three, 61);
    expect(b.map((p) => p.name)).toEqual(["settle-in", "junction-work", "return"]);
    expect(b.every((p) => p.kind === "estate")).toBe(true);
  });
});

describe("the distance band", () => {
  const good = (TARGET_MIN_S + TARGET_MAX_S) / 2;

  test("a loop over the band is shrunk even when the clock is happy", () => {
    const r = nextScale(good, TARGET_MAX_M + 5000, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeLessThan(1);
    expect(r.hi).toBe(1);
  });

  test("a short-but-enormous loop is shrunk, not grown", () => {
    // Free-flow duration says "too short", distance says "far too long".
    // Growing it here is how a 29 km route gets called a 37 minute drive.
    const r = nextScale(TARGET_MIN_S / 2, TARGET_MAX_M * 2, 1, 0.4, 2.5);
    expect(r.scale).toBeLessThan(1);
  });

  test("both ends of the distance band are acceptable", () => {
    expect(nextScale(good, TARGET_MAX_M, 1, 0.4, 2.5).done).toBe(true);
    expect(nextScale(good, TARGET_MIN_M, 1, 0.4, 2.5).done).toBe(true);
  });

  test("the band is the eight to twelve miles a real test covers", () => {
    expect(TARGET_MIN_M / 1609).toBeCloseTo(8.1, 1);
    expect(TARGET_MAX_M / 1609).toBeCloseTo(11.8, 1);
  });

  test("a loop that is the right length but absurdly slow is still rejected", () => {
    // Sixteen kilometres is a test-length drive; two hours of it is not.
    const r = nextScale(TARGET_MAX_S * 3, 16000, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeLessThan(1);
  });

  test("distance leads: a short loop grows even when the clock already likes it", () => {
    const r = nextScale((TARGET_MIN_S + TARGET_MAX_S) / 2, TARGET_MIN_M - 3000, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeGreaterThan(1);
  });
});
