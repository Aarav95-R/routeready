import { ANCHOR_PHASES, ANCHORS, inferPhases, MAX_TRIES, nextScale, PACE, PHASES, planTestRoute, IMPLAUSIBLE_S, TARGET_MAX_M, TARGET_MAX_S, TARGET_MIN_M, TARGET_MIN_S } from "../testPhases";
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

/**
 * A drive, and the features it passes, for testing inference.
 *
 * inferPhases reads a finished polyline, so these tests need a line with
 * things sitting on it - which is a different fixture from RICH, whose job is
 * to be a field of candidates for the planner to choose between.
 *
 * Features are placed *on* vertices, spread along the line in the order a
 * driver would meet them, so the canonical phase order and the order along
 * the road agree. Where they disagree the road wins, which is its own test.
 */
const DRIVE = Array.from({ length: 121 }, (_, i) => ({
  lat: CENTRE.lat + (4 * (i / 120)) / 111,
  lng: CENTRE.lng,
}));

const onDrive = (kind: Feature['kind'], i: number): Feature => ({ kind, ...DRIVE[i] });

/** One of everything, in the order the canonical phases want them. */
const ALL_ON_DRIVE: Feature[] = [
  onDrive('estate', 8),        // settle-in
  onDrive('roundabout', 28),   // junction-work
  onDrive('dual', 48),         // faster-road
  onDrive('fast', 68),         // independent
  onDrive('parking', 88),      // manoeuvre
  onDrive('crossing', 108),    // return
];

const inferred = (fs2: Feature[]) => inferPhases(DRIVE, fs2).map((x) => x.name);


test("a plan starts and ends at the centre", () => {
  const p = planTestRoute(CENTRE, RICH, 0, 1);
  expect(p.waypoints[0]).toEqual(CENTRE);
  expect(p.waypoints[p.waypoints.length - 1]).toEqual(CENTRE);
});

// Moved from planTestRoute to inferPhases with the anchors change. The
// planner no longer claims six phases - it routes through three and the
// phases are read off what came back - but the requirement is unchanged:
// a drive that passes all six things reports all six, in test order.
test("a drive that passes all six reports all six, in test order", () => {
  expect(inferred(ALL_ON_DRIVE)).toEqual(PHASES.map((p) => p.name));
});

test("phases never come out of order, even when some are missing", () => {
  const canonical = PHASES.map((p) => p.name);
  for (let drop = 0; drop < ALL_ON_DRIVE.length; drop++) {
    const some = ALL_ON_DRIVE.filter((_, i) => i !== drop);
    const positions = inferred(some).map((x) => canonical.indexOf(x));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  }
});

test("a drive that meets no fast road does not claim one", () => {
  const noFast = ALL_ON_DRIVE.filter((f) => f.kind !== "fast" && f.kind !== "dual");
  expect(inferred(noFast)).not.toContain("faster-road");
});

// Kerbside-parking tagging is patchy enough in the UK that requiring it
// dropped the phase everywhere, so a residential street is the fallback -
// which is a property of the `wants` list and survives the move intact.
test("a drive with no tagged parking still finds a manoeuvre on a quiet street", () => {
  const noParking = ALL_ON_DRIVE.filter((f) => f.kind !== "parking")
    .concat(onDrive("estate", 88));
  expect(inferred(noParking)).toContain("manoeuvre");
});

test("a drive with nowhere to pull in drops the manoeuvre phase", () => {
  const noStreets = ALL_ON_DRIVE.filter((f) => f.kind !== "parking" && f.kind !== "estate");
  expect(inferred(noStreets)).not.toContain("manoeuvre");
});

// The rule that stops a route inventing a dual carriageway it never drove.
// A required phase may fall back to a proportional slice; an optional one
// that was not there is simply absent.
test("an optional phase is dropped, never filled with a synthetic span", () => {
  const bare = ALL_ON_DRIVE.filter((f) => f.kind === "estate");
  const phases = inferPhases(DRIVE, bare);
  const optional = PHASES.filter((p) => p.optional).map((p) => p.name);

  for (const ph of phases) {
    if (optional.includes(ph.name)) expect(ph.kind).not.toBe("ring");
  }
});

// A centre OSM knows nothing about still gets a loop - the anchors fall back
// to compass rings. faster-road is now among the anchors, so it is routed
// through rather than dropped here; whether the drive *contains* one is a
// question for inferPhases, which answers no when nothing is near the line.
test("a centre OpenStreetMap knows nothing about still yields a drivable loop", () => {
  const plan = planTestRoute(CENTRE, [], 0, 1);

  expect(plan.waypoints).toHaveLength(5);
  expect(plan.waypoints[0]).toEqual(CENTRE);
  expect(plan.waypoints[4]).toEqual(CENTRE);
  expect(plan.phases.every((p) => p.kind === "ring")).toBe(true);
  expect(inferPhases(DRIVE, [])).not.toContainEqual(
    expect.objectContaining({ name: "faster-road" }),
  );
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

  // Tottenham, measured: ten routes, none in band, every one of them short
  // and every one of them shrinking. Dense north London runs at about 21 km/h
  // free-flow, so a 10.6 km loop there reports 46 minutes - under the 13 km
  // floor and over the 42-minute ceiling at the same time.
  //
  // The old rule ORed the two, so both flags set meant shrink, and shrinking
  // is the one move that can never fix a route for being too short. Seven
  // fetches spent walking downhill away from the band.
  //
  // Distance leads, which is what the comment above nextScale always said:
  // the length of a drive is a property of the route, and its duration is a
  // guess about the traffic on a day that has not happened.
  test("a slow area grows its loop rather than shrinking away from the band", () => {
    // 10.6 km at Tottenham's pace: too short, and over the clock.
    const slowAndShort = nextScale(TARGET_MAX_S * 1.1, 10_600, 0.55, 0.4, 2.5);

    expect(slowAndShort.scale).toBeGreaterThan(0.55);
    expect(slowAndShort.done).toBe(false);
  });

  // The sanity floor that survives. A drive can be slow; it cannot be broken.
  test("the implausible ceiling is far above a slow drive, and far below a broken one", () => {
    const realMinutes = (s2: number) => (s2 * PACE) / 60;

    expect(realMinutes(IMPLAUSIBLE_S)).toBeGreaterThan(46);   // Tottenham is fine
    expect(realMinutes(IMPLAUSIBLE_S)).toBeLessThan(120);     // two hours is not
  });

  // A route already the right length is not resized for being merely slow.
  test("a test-length loop is accepted even where the roads are slow", () => {
    expect(nextScale(TARGET_MAX_S * 1.2, 16_000, 1, 0.4, 2.5).done).toBe(true);
  });
  test("distance leads: a short loop grows even when the clock already likes it", () => {
    const r = nextScale((TARGET_MIN_S + TARGET_MAX_S) / 2, TARGET_MIN_M - 3000, 1, 0.4, 2.5);
    expect(r.done).toBe(false);
    expect(r.scale).toBeGreaterThan(1);
  });
});

// ── Anchors ───────────────────────────────────────────────────────────────
//
// The Hendon finding, as arithmetic. The old planner made every one of the
// six phases a waypoint, so a route was centre + 6 + centre = up to eight
// waypoints and seven legs. Where the network is severed - a centre between
// a motorway and an A road - each hop between two waypoints a few hundred
// metres apart costs kilometres of detour to the next legal crossing, and
// seven of those is a 22 km drive however small the radius gets. Hendon sat
// pinned at the bottom of the bracket for all ten routes and never converged.
//
// Three anchors is four legs. The severance cost is per hop, so this is the
// only lever that actually moves it.

test("a route is planned through three anchors, not through every phase", () => {
  const plan = planTestRoute(CENTRE, RICH, 0, 1);

  // centre + 3 + centre
  expect(plan.waypoints).toHaveLength(5);
});

test("the anchors are the phases a loop would otherwise miss by chance", () => {
  expect(ANCHOR_PHASES).toEqual(["junction-work", "faster-road", "independent"]);
});

// settle-in and return sit at reach 0.5-0.55, which is on the way out of the
// centre and on the way back into it. Anchoring them would spend two of the
// four legs going nowhere.
test("a centre with nothing at all still plans a drivable loop", () => {
  const plan = planTestRoute(CENTRE, [], 0, 1);

  expect(plan.waypoints).toHaveLength(5);
  expect(plan.waypoints[0]).toEqual(CENTRE);
  expect(plan.waypoints[4]).toEqual(CENTRE);
});

// ── Inference ─────────────────────────────────────────────────────────────
//
// phaseBounds used to cut the line up by leg length, which reports where the
// route was *asked* to go. With three anchors there is no leg per phase to
// cut by, and the honest question is what the road actually passed - so the
// phases are read off the finished polyline instead.

/** A straight line of `n` vertices running north from the centre. */
const lineNorth = (n: number, km: number) =>
  Array.from({ length: n }, (_, i) => ({
    lat: CENTRE.lat + ((km * (i / (n - 1))) / 111),
    lng: CENTRE.lng,
  }));

test("a phase is reported where its feature actually sits on the line", () => {
  const coords = lineNorth(101, 4);
  // A roundabout beside the line a quarter of the way along.
  const near = { kind: "roundabout" as const, ...coords[25] };

  const phases = inferPhases(coords, [near]);
  const junction = phases.find((p) => p.name === "junction-work")!;

  expect(junction).toBeDefined();
  expect(junction.endIdx).toBeGreaterThanOrEqual(20);
  expect(junction.endIdx).toBeLessThanOrEqual(30);
});

test("a feature nowhere near the line is not claimed as a phase", () => {
  const coords = lineNorth(101, 4);
  // Two kilometres east of a line that only runs north.
  const far = {
    kind: "dual" as const,
    lat: CENTRE.lat,
    lng: CENTRE.lng + 2 / (111 * Math.cos((CENTRE.lat * Math.PI) / 180)),
  };

  const phases = inferPhases(coords, [far]);

  expect(phases.find((p) => p.name === "faster-road")).toBeUndefined();
});

test("inferred phases stay in test order and never overlap", () => {
  const coords = lineNorth(101, 4);
  const features = [
    { kind: "estate" as const, ...coords[5] },
    { kind: "roundabout" as const, ...coords[30] },
    { kind: "dual" as const, ...coords[55] },
    { kind: "parking" as const, ...coords[80] },
  ];

  const phases = inferPhases(coords, features);

  const canonical = PHASES.map((x) => x.name);
  const order = phases.map((x) => canonical.indexOf(x.name));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  for (let i = 1; i < phases.length; i++) {
    expect(phases[i].startIdx).toBeGreaterThanOrEqual(phases[i - 1].endIdx);
  }
});

// A route that reports fewer required phases than a test has is describing
// something that is not a driving test.
test("every required phase is reported even where OSM knows nothing", () => {
  const coords = lineNorth(101, 4);

  const phases = inferPhases(coords, []);

  const required = PHASES.filter((x) => !x.optional).map((x) => x.name);
  expect(phases.map((x) => x.name)).toEqual(required);
});

test("the last phase always runs to the end of the line", () => {
  const coords = lineNorth(101, 4);

  const phases = inferPhases(coords, []);

  expect(phases[phases.length - 1].endIdx).toBe(100);
});

test("a line too short to divide does not produce a negative span", () => {
  for (const n of [0, 1, 2]) {
    const phases = inferPhases(lineNorth(Math.max(n, 2), 1).slice(0, n), []);
    for (const ph of phases) {
      expect(ph.endIdx).toBeGreaterThanOrEqual(ph.startIdx);
      expect(ph.startIdx).toBeGreaterThanOrEqual(0);
    }
  }
});

// Found at Tottenham, not in a unit test: 2/10 in band, and short rather
// than long - median 10.6 km against a 13-19 km target, with the bisection
// burning every one of its tries trying to grow the loop.
//
// The anchors had inherited the phase offsets, and junction-work,
// faster-road and independent sit at 55, 118 and 191 degrees. Three points
// inside a 136-degree arc is a wedge, not a circuit: the drive goes out,
// crosses a short arc, and comes back. Around Hendon the severance detours
// inflated that back into the band by luck, which is exactly why two centres
// were not enough to check against.
test("the anchors go round the centre rather than fanning across one side", () => {
  const offsets = ANCHORS.map((a) => a.offset);

  expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(180);
});

// The same resonance the phase offsets carry a comment about. Successive
// routes are pushed round by the golden angle, 137.5 degrees; three evenly
// spaced anchors fan at 120, and 137.5 is 17.5 past one whole step - so an
// even split lands the anchors back on the same ring of features in a
// different order and a centre's ten routes collapse into a handful.
test("the anchors are not evenly spaced, so rotating a route changes it", () => {
  const offsets = [...ANCHORS.map((a) => a.offset)].sort((a, b) => a - b);
  const gaps = [
    offsets[1] - offsets[0],
    offsets[2] - offsets[1],
    360 - offsets[2] + offsets[0],
  ];

  expect(new Set(gaps).size).toBe(3);
});

// Monotonic round the circle, so the loop is a circuit rather than a zigzag
// back and forth across the centre.
test("the anchors run one way round the circle", () => {
  const offsets = ANCHORS.map((a) => a.offset);

  expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
});

test("the anchors are still the three phases a drive would otherwise miss", () => {
  expect(ANCHORS.map((a) => a.phase)).toEqual(ANCHOR_PHASES);
});
