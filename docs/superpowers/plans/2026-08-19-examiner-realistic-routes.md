# Examiner-Realistic Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bearing-and-radius route planner with one that builds each loop out of the six things a driving test actually contains, and tune every loop to the 36–42 minutes a real test occupies.

**Architecture:** A new seed-time module `scripts/seed/testPhases.ts` holds the phase model and the length-tuning search; both are pure and unit-tested without a network. `overpass.ts` learns to ask for the extra OSM tags the new phases need, `routePlan.ts`'s `classify` learns to label them, and `generate.ts` swaps `planRoutes` for `planTestRoute` and gains a binary search over a radius scale factor until OSRM reports a drive in the target band. The resulting phase boundaries are written to a new `routes.phases` column so the app can name the leg being driven.

**Tech Stack:** TypeScript run under `tsx`, Overpass API, OSRM (`router.project-osrm.org`), Jest, Supabase Postgres.

**Spec:** `docs/design/2026-08-19-routes-offroute.html` (sections 02, 03, 08)

## Global Constraints

- Target drive time is **36 to 42 minutes** inclusive, measured as `durationS * 1.15` — the same learner-pace multiplier `generate.ts` already applies when writing `estimated_minutes`.
- Every centre keeps exactly **10** routes (`ROUTES_PER_CENTRE`). A centre OSM knows nothing about still gets ten, as it does today.
- Phases 3 (faster road) and 5 (manoeuvre pull-in) are **optional**: if no feature of that kind exists inside the search radius, the phase is dropped, never faked and never reached for beyond the radius.
- The seed run is truncate-and-reload. If any route fails to fetch, `generate.ts` must still exit non-zero without writing `supabase/seed.sql` — the existing behaviour, and it must survive this change.
- Overpass is rate-limited: keep the existing 3 s inter-centre sleep and 700 ms inter-route sleep, and keep every call going through `cached()`.
- No OSM data is redistributed beyond what the app already ships. ODbL attribution stays as-is.
- Run tests with `npx jest <path>`. Run the generator with `npm run seed`.

---

### Task 1: Teach Overpass and `classify` the new features

**Files:**
- Modify: `scripts/seed/overpass.ts:23-34` (the `query` function)
- Modify: `scripts/seed/routePlan.ts:26-46` (`OverpassElement`, `FeatureKind`, `classify`)
- Test: `scripts/seed/__tests__/routePlan.test.ts` (append)

**Interfaces:**
- Produces: `FeatureKind` becomes `"roundabout" | "signals" | "crossing" | "fast" | "dual" | "estate" | "parking"`. `classify` returns the new kinds. `Feature` is unchanged in shape.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/seed/__tests__/routePlan.test.ts`:

```ts
import { classify } from "../routePlan";

test("a signalled junction is its own kind, not a plain junction", () => {
  const f = classify({ lat: 51.5, lon: -0.1, tags: { highway: "traffic_signals" } });
  expect(f).toEqual({ kind: "signals", lat: 51.5, lng: -0.1 });
});

test("a dual carriageway outranks the plain fast-road label", () => {
  const f = classify({ center: { lat: 51.5, lon: -0.1 }, tags: { highway: "primary", dual_carriageway: "yes" } });
  expect(f?.kind).toBe("dual");
});

test("a trunk road with two carriageways is also dual", () => {
  const f = classify({ center: { lat: 51.5, lon: -0.1 }, tags: { highway: "trunk", lanes: "4", oneway: "yes" } });
  expect(f?.kind).toBe("dual");
});

test("a residential street with parallel parking is a manoeuvre spot", () => {
  const f = classify({ center: { lat: 51.5, lon: -0.1 }, tags: { highway: "residential", "parking:lane:both": "parallel" } });
  expect(f?.kind).toBe("parking");
});

test("a plain residential street is still an estate", () => {
  const f = classify({ center: { lat: 51.5, lon: -0.1 }, tags: { highway: "residential" } });
  expect(f?.kind).toBe("estate");
});

test("a roundabout still wins over the road class it carries", () => {
  const f = classify({ center: { lat: 51.5, lon: -0.1 }, tags: { junction: "roundabout", highway: "primary" } });
  expect(f?.kind).toBe("roundabout");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest scripts/seed/__tests__/routePlan.test.ts`
Expected: FAIL — `classify` returns `"fast"` where `"dual"` is expected, and `null` for traffic signals.

- [ ] **Step 3: Widen `classify`**

In `scripts/seed/routePlan.ts`, replace the `FeatureKind` type and the `classify` body's `kind` expression:

```ts
export type FeatureKind =
  | "roundabout"   // give way, lane discipline, exit counting
  | "signals"      // a signalled junction — the other half of junction work
  | "crossing"     // zebra and signalled pedestrian crossings
  | "fast"         // single-carriageway primary or trunk
  | "dual"         // dual carriageway: the fastest thing a test uses
  | "estate"       // residential: slow speed, parked cars, observation
  | "parking";     // residential with on-street parallel parking — a manoeuvre spot
```

and, inside `classify`, after `const t = el.tags ?? {};`:

```ts
  // A way that is two carriageways is the fastest road a test will use, and it
  // is examined differently from a single-carriageway A road — joining,
  // lane changes, and a national speed limit. Tagged explicitly in some
  // places and only implied in others, so both are accepted.
  const isDual =
    t.dual_carriageway === "yes" ||
    (t.oneway === "yes" && Number(t.lanes ?? "0") >= 2);

  const kind: FeatureKind | null =
    t.junction === "roundabout" ? "roundabout"
    : t.highway === "traffic_signals" ? "signals"
    : t.highway === "crossing" ? "crossing"
    : t.highway === "primary" || t.highway === "trunk" ? (isDual ? "dual" : "fast")
    : t.highway === "residential"
      // A manoeuvre needs somewhere legal to stop. Parked cars are the signal
      // OSM actually carries for that, under several key spellings.
      ? (Object.keys(t).some((k) => k.startsWith("parking:lane") && /parallel|diagonal|perpendicular/.test(t[k]))
          ? "parking" : "estate")
    : null;
```

- [ ] **Step 4: Widen the Overpass query**

In `scripts/seed/overpass.ts`, replace the body of `query`:

```ts
function query(lat: number, lng: number, radiusM: number): string {
  const near = `(around:${radiusM},${lat},${lng})`;
  // One `out` per category rather than a single union with one `out` at the
  // end. Residential ways outnumber roundabouts by two orders of magnitude,
  // so a shared cap would be spent entirely on side streets and every route
  // would be an estate crawl. Interleaved `out` statements cap each on its own.
  return [
    "[out:json][timeout:90];",
    `way${near}[junction=roundabout];`,
    "out center 30;",
    `node${near}[highway=traffic_signals];`,
    "out 30;",
    `node${near}[highway=crossing];`,
    "out 30;",
    `way${near}[highway~"^(primary|trunk)$"][dual_carriageway=yes];`,
    "out center 20;",
    `way${near}[highway~"^(primary|trunk)$"];`,
    "out center 30;",
    `way${near}[highway=residential]["parking:lane:both"~"parallel"];`,
    "out center 30;",
    `way${near}[highway=residential];`,
    "out center 60;",
  ].join("\n");
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest scripts/seed/__tests__/routePlan.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed/overpass.ts scripts/seed/routePlan.ts scripts/seed/__tests__/routePlan.test.ts
git commit -m "feat: ask OpenStreetMap for the features a driving test is actually made of"
```

---

### Task 2: The six-phase plan

**Files:**
- Create: `scripts/seed/testPhases.ts`
- Test: `scripts/seed/__tests__/testPhases.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `haversineM`, `bearingDeg` from `src/lib/geo.ts`; `Feature`, `FeatureKind` from `./routePlan`.
- Produces: `PHASES`, type `PhaseName`, type `PlannedPhase = { name: PhaseName; kind: FeatureKind | "ring"; at: LatLng }`, type `TestRoutePlan = { waypoints: LatLng[]; phases: PlannedPhase[] }`, `planTestRoute(centre, features, routeIndex, scale) => TestRoutePlan`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/seed/__tests__/testPhases.test.ts`:

```ts
import { planTestRoute, PHASES } from "../testPhases";
import type { Feature } from "../routePlan";

const centre = { lat: 51.748, lng: -0.336 };

/** A ring of one feature of each kind, spread round the centre. */
const rich: Feature[] = [
  { kind: "estate", lat: 51.752, lng: -0.336 },
  { kind: "roundabout", lat: 51.748, lng: -0.328 },
  { kind: "signals", lat: 51.744, lng: -0.330 },
  { kind: "dual", lat: 51.742, lng: -0.344 },
  { kind: "fast", lat: 51.750, lng: -0.348 },
  { kind: "parking", lat: 51.754, lng: -0.342 },
  { kind: "crossing", lat: 51.746, lng: -0.340 },
];

test("a plan starts and ends at the centre", () => {
  const p = planTestRoute(centre, rich, 0, 1);
  expect(p.waypoints[0]).toEqual(centre);
  expect(p.waypoints[p.waypoints.length - 1]).toEqual(centre);
});

test("the phases come out in test order", () => {
  const p = planTestRoute(centre, rich, 0, 1);
  const names = p.phases.map((x) => x.name);
  // Every phase present must appear in the canonical order.
  const canonical = PHASES.map((x) => x.name);
  const positions = names.map((n) => canonical.indexOf(n));
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("a rich centre gets every phase", () => {
  const p = planTestRoute(centre, rich, 0, 1);
  expect(p.phases.map((x) => x.name)).toEqual(PHASES.map((x) => x.name));
});

test("a centre with no fast road drops that phase rather than reaching for one", () => {
  const noFast = rich.filter((f) => f.kind !== "fast" && f.kind !== "dual");
  const p = planTestRoute(centre, noFast, 0, 1);
  expect(p.phases.map((x) => x.name)).not.toContain("faster-road");
  // and it must not have invented a synthetic ring point for it either
  expect(p.phases.every((x) => x.kind !== "ring" || x.name !== "faster-road")).toBe(true);
});

test("a centre with no parking street drops the manoeuvre phase", () => {
  const noParking = rich.filter((f) => f.kind !== "parking");
  const p = planTestRoute(centre, noParking, 0, 1);
  expect(p.phases.map((x) => x.name)).not.toContain("manoeuvre");
});

test("a centre OSM knows nothing about still yields a drivable plan", () => {
  const p = planTestRoute(centre, [], 0, 1);
  expect(p.waypoints.length).toBeGreaterThanOrEqual(3);
  expect(p.waypoints[0]).toEqual(centre);
  expect(p.waypoints[p.waypoints.length - 1]).toEqual(centre);
  // The required phases fall back to compass rings; the optional ones do not.
  expect(p.phases.some((x) => x.kind === "ring")).toBe(true);
  expect(p.phases.map((x) => x.name)).not.toContain("faster-road");
});

test("successive routes out of one centre do not repeat a direction", () => {
  const a = planTestRoute(centre, rich, 0, 1);
  const b = planTestRoute(centre, rich, 1, 1);
  expect(a.waypoints).not.toEqual(b.waypoints);
});

test("the scale factor pushes waypoints further out", () => {
  const near = planTestRoute(centre, [], 0, 1);
  const far = planTestRoute(centre, [], 0, 2);
  const spread = (p: typeof near) =>
    Math.max(...p.waypoints.map((w) => Math.hypot(w.lat - centre.lat, w.lng - centre.lng)));
  expect(spread(far)).toBeGreaterThan(spread(near));
});

test("the same inputs always give the same plan", () => {
  expect(planTestRoute(centre, rich, 3, 1.2)).toEqual(planTestRoute(centre, rich, 3, 1.2));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest scripts/seed/__tests__/testPhases.test.ts`
Expected: FAIL — `Cannot find module '../testPhases'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/seed/testPhases.ts`:

```ts
import { bearingDeg, haversineM, type LatLng } from "../../src/lib/geo";
import type { Feature, FeatureKind } from "./routePlan";

/**
 * A practice loop as the ordered sequence of things a driving test contains,
 * rather than as three waypoints picked off a compass.
 *
 * The old planner chose waypoints by bearing and radius, which controlled
 * where the route went and never how long it took: the 400 seeded routes ran
 * from 7 to 72 minutes against a real test's 40. Worse, "a roundabout, an
 * estate and a fast road in rotation" is not what an examiner assembles — a
 * test has a shape, and it is this one.
 *
 * DVSA publishes what the test contains, and has since it stopped publishing
 * routes in 2010. That is the licensable source, and this is it turned into
 * geometry.
 */

export type PhaseName =
  | "settle-in"
  | "junction-work"
  | "faster-road"
  | "independent"
  | "manoeuvre"
  | "return";

type PhaseSpec = {
  name: PhaseName;
  /** Feature kinds that can satisfy this phase, best first. */
  wants: FeatureKind[];
  /**
   * Optional phases are dropped when nothing nearby satisfies them. Required
   * ones fall back to a synthetic compass point, so a centre OSM knows
   * nothing about still gets a drivable loop.
   */
  optional: boolean;
  /** Where in the band this phase's waypoint sits, as a fraction of the radius. */
  reach: number;
};

/**
 * The canonical order. A test does not shuffle these: you are settled in
 * before you are tested, the manoeuvre comes late, and you finish at the
 * centre you started from.
 */
export const PHASES: PhaseSpec[] = [
  { name: "settle-in",     wants: ["estate", "parking"],           optional: false, reach: 0.55 },
  { name: "junction-work", wants: ["roundabout", "signals"],       optional: false, reach: 0.9 },
  { name: "faster-road",   wants: ["dual", "fast"],                optional: true,  reach: 1.0 },
  { name: "independent",   wants: ["fast", "dual", "roundabout"],  optional: false, reach: 1.0 },
  { name: "manoeuvre",     wants: ["parking"],                     optional: true,  reach: 0.7 },
  { name: "return",        wants: ["estate", "crossing"],          optional: false, reach: 0.5 },
];

export type PlannedPhase = { name: PhaseName; kind: FeatureKind | "ring"; at: LatLng };
export type TestRoutePlan = { waypoints: LatLng[]; phases: PlannedPhase[] };

/**
 * The base radius the phases are laid out on, before scaling. Chosen so that
 * an unscaled loop through five waypoints lands near the target on typical
 * suburban roads; the search in generate.ts moves it per route.
 */
export const BASE_RADIUS_KM = 2.4;

// Successive routes are pushed round by the golden angle rather than by an
// even split. An even split with ten routes puts routes 1 and 6 on the same
// line through the centre; 137.5° never repeats a direction.
const GOLDEN_ANGLE = 137.5;

const ringPoint = (c: LatLng, bearing: number, km: number): LatLng => ({
  lat: c.lat + (km / 111) * Math.cos((bearing * Math.PI) / 180),
  lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((bearing * Math.PI) / 180),
});

/** Smallest absolute difference between two bearings, in degrees. */
function bearingGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The best unused feature for a phase: right kind, near the target bearing,
 * inside the band. The kind list is ordered, and an earlier kind is preferred
 * outright — a dual carriageway is a better "faster road" than an A road, and
 * no amount of bearing advantage should change that.
 */
function pick(
  centre: LatLng, features: Feature[], spec: PhaseSpec,
  bearing: number, radiusKm: number, used: Set<Feature>,
): Feature | null {
  for (const kind of spec.wants) {
    const candidates = features.filter((f) => f.kind === kind && !used.has(f));
    if (!candidates.length) continue;
    const scored = candidates.map((f) => {
      const km = haversineM(centre, f) / 1000;
      const gap = bearingGap(bearingDeg(centre, f), bearing);
      // The overshoot penalty keeps a loop the length of a lesson. At a low
      // rate a far feature on a perfect bearing still won and loops came back
      // over 20 km; at 120 per km a kilometre of overshoot costs more than any
      // bearing error can, so the band holds.
      return { f, score: gap + Math.max(0, km - radiusKm) * 120 };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0].f;
  }
  return null;
}

/**
 * One loop out of a centre, at a given size.
 *
 * `routeIndex` spreads the ten routes of a centre round the compass.
 * `scale` multiplies the radius, and is what generate.ts searches over to hit
 * the target drive time — everything here is deterministic in those two, so
 * the search converges rather than wandering.
 */
export function planTestRoute(
  centre: LatLng, features: Feature[], routeIndex: number, scale: number,
): TestRoutePlan {
  const spine = (routeIndex * GOLDEN_ANGLE) % 360;
  const radiusKm = BASE_RADIUS_KM * scale;
  const used = new Set<Feature>();

  const phases: PlannedPhase[] = [];
  const waypoints: LatLng[] = [centre];

  PHASES.forEach((spec, i) => {
    // Fan the phases round the spine so the loop goes out and comes back
    // rather than doubling along one road.
    const bearing = (spine + (i * 360) / PHASES.length) % 360;
    const found = pick(centre, features, spec, bearing, radiusKm, used);
    if (found) {
      used.add(found);
      const at = { lat: found.lat, lng: found.lng };
      phases.push({ name: spec.name, kind: found.kind, at });
      waypoints.push(at);
      return;
    }
    // Nothing of the right kind nearby. An optional phase is simply not part
    // of this centre's test; a required one gets a compass point so the loop
    // still exists.
    if (spec.optional) return;
    const at = ringPoint(centre, bearing, radiusKm * spec.reach);
    phases.push({ name: spec.name, kind: "ring", at });
    waypoints.push(at);
  });

  waypoints.push(centre);
  return { waypoints, phases };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest scripts/seed/__tests__/testPhases.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/testPhases.ts scripts/seed/__tests__/testPhases.test.ts
git commit -m "feat: build a practice loop out of the six things a test contains"
```

---

### Task 3: Tune every loop to test length

**Files:**
- Modify: `scripts/seed/testPhases.ts` (append)
- Test: `scripts/seed/__tests__/testPhases.test.ts` (append)

**Interfaces:**
- Produces: `TARGET_MIN_S`, `TARGET_MAX_S`, `PACE`, `MAX_TRIES`, `nextScale(durationS, scale, lo, hi) => { scale: number; lo: number; hi: number; done: boolean }`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/seed/__tests__/testPhases.test.ts`:

```ts
import { nextScale, TARGET_MAX_S, TARGET_MIN_S } from "../testPhases";

test("a drive inside the band is done", () => {
  const r = nextScale((TARGET_MIN_S + TARGET_MAX_S) / 2, 1, 0.4, 2.5);
  expect(r.done).toBe(true);
});

test("a drive that is too short grows the radius", () => {
  const r = nextScale(TARGET_MIN_S / 2, 1, 0.4, 2.5);
  expect(r.done).toBe(false);
  expect(r.scale).toBeGreaterThan(1);
  expect(r.lo).toBe(1);
});

test("a drive that is too long shrinks the radius", () => {
  const r = nextScale(TARGET_MAX_S * 2, 1, 0.4, 2.5);
  expect(r.done).toBe(false);
  expect(r.scale).toBeLessThan(1);
  expect(r.hi).toBe(1);
});

test("the search converges rather than oscillating", () => {
  let s = { scale: 1, lo: 0.4, hi: 2.5, done: false };
  const widths: number[] = [];
  for (let i = 0; i < 5 && !s.done; i++) {
    // Pretend duration is proportional to scale, target reached near 1.6.
    s = nextScale(s.scale * 1500, s.scale, s.lo, s.hi);
    widths.push(s.hi - s.lo);
  }
  for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest scripts/seed/__tests__/testPhases.test.ts -t scale`
Expected: FAIL — `nextScale is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `scripts/seed/testPhases.ts`:

```ts
/**
 * The learner-pace multiplier already used when writing estimated_minutes.
 * OSRM answers for a driver who knows the road; a candidate on test does not.
 */
export const PACE = 1.15;

/** 36 and 42 minutes, in OSRM seconds — i.e. before the pace multiplier. */
export const TARGET_MIN_S = (36 * 60) / PACE;
export const TARGET_MAX_S = (42 * 60) / PACE;

/**
 * How many OSRM fetches one route may spend finding its length. Four halvings
 * take the 0.4–2.5 bracket down to about 0.13 wide, which is finer than the
 * road network's own granularity — past that the search is chasing noise.
 */
export const MAX_TRIES = 4;

/**
 * One step of a bisection on the radius scale.
 *
 * Bisection rather than a proportional guess: drive time is not linear in
 * radius. Doubling the radius can leave the duration flat if the extra reach
 * finds a bypass, or triple it if it finds a town centre. Bisection does not
 * care, and it cannot overshoot outside the bracket.
 */
export function nextScale(
  durationS: number, scale: number, lo: number, hi: number,
): { scale: number; lo: number; hi: number; done: boolean } {
  if (durationS >= TARGET_MIN_S && durationS <= TARGET_MAX_S) {
    return { scale, lo, hi, done: true };
  }
  if (durationS < TARGET_MIN_S) {
    const nlo = scale;
    return { scale: (nlo + hi) / 2, lo: nlo, hi, done: false };
  }
  const nhi = scale;
  return { scale: (lo + nhi) / 2, lo, hi: nhi, done: false };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest scripts/seed/__tests__/testPhases.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/testPhases.ts scripts/seed/__tests__/testPhases.test.ts
git commit -m "feat: search each loop's radius until it takes as long as a test"
```

---

### Task 4: Store the phases

**Files:**
- Create: `supabase/migrations/2026-08-19-route-phases.sql`
- Modify: `src/types/db.ts`

**Interfaces:**
- Produces: `type RoutePhase = { name: PhaseName; kind: string; startIdx: number; endIdx: number }` on `src/types/db.ts`; `Route` gains `phases: RoutePhase[]`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026-08-19-route-phases.sql`:

```sql
-- The phase breakdown of a practice loop.
--
-- Safe to re-run.
--
-- A route is no longer three waypoints on a compass but the six things a
-- driving test contains, in order. Storing the boundaries lets the drive
-- screens name the leg being driven ("independent driving") instead of
-- counting anonymous turns, and lets the manoeuvre phase be prompted.
--
-- Shape: [{ "name": "independent", "kind": "dual",
--           "startIdx": 210, "endIdx": 460 }]
-- Indices are into the route's own geometry.coordinates.
begin;

alter table routes add column if not exists phases jsonb default '[]';

commit;
```

- [ ] **Step 2: Add the type**

In `src/types/db.ts`, above `Route`:

```ts
export type RoutePhaseName =
  | "settle-in" | "junction-work" | "faster-road" | "independent" | "manoeuvre" | "return";

/**
 * One leg of a practice loop, as a slice of the route's own coordinates.
 *
 * `faster-road` and `manoeuvre` are absent for a centre with no such road
 * nearby — the array is the phases this route actually has, not a fixed six.
 */
export type RoutePhase = {
  name: RoutePhaseName;
  /** The OSM feature kind that anchored the phase, or "ring" for a synthetic point. */
  kind: string;
  startIdx: number;
  endIdx: number;
};
```

and add to `Route`:

```ts
  phases: RoutePhase[];
```

- [ ] **Step 3: Apply the migration**

Apply against the project via the session pooler (see `SETUP.md`).

Verify: `select column_name from information_schema.columns where table_name='routes' and column_name='phases';` returns one row.

- [ ] **Step 4: Check the repo reads it**

Run: `grep -n "select" src/services/routesRepo.ts`

If the select lists columns explicitly, add `phases`. If it is `select("*")`, no change.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: clean. Existing routes have `phases` defaulting to `[]`, which the type allows.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-08-19-route-phases.sql src/types/db.ts src/services/routesRepo.ts
git commit -m "feat: give a route somewhere to record the phases it is made of"
```

---

### Task 5: Switch the generator over

**Files:**
- Modify: `scripts/seed/generate.ts:14, 121-175`

**Interfaces:**
- Consumes: `planTestRoute`, `nextScale`, `MAX_TRIES`, `PACE`, `TARGET_MIN_S`, `TARGET_MAX_S` from `./testPhases`; `nameFromSteps` from `./routePlan` (unchanged).
- Produces: `supabase/seed.sql` rows that include the `phases` column.

- [ ] **Step 1: Replace the import**

In `scripts/seed/generate.ts`, change

```ts
import { nameFromSteps, planRoutes, type Feature } from "./routePlan";
```

to

```ts
import { nameFromSteps, type Feature } from "./routePlan";
import { MAX_TRIES, nextScale, PACE, planTestRoute } from "./testPhases";
```

- [ ] **Step 2: Add the phase-boundary helper**

Add above `main()`:

```ts
/**
 * Where each phase's waypoint landed on the finished polyline.
 *
 * OSRM returns one leg per waypoint pair, and a leg's length in coordinates is
 * what bounds the phase that waypoint anchors. Derived from the legs rather
 * than by searching the polyline for the waypoint: the router snaps a waypoint
 * to the nearest road, so the coordinate we asked for is often not in the
 * geometry at all.
 */
function phaseBounds(
  legCoordCounts: number[], phases: { name: string; kind: string }[],
): { name: string; kind: string; startIdx: number; endIdx: number }[] {
  const out: { name: string; kind: string; startIdx: number; endIdx: number }[] = [];
  let idx = 0;
  for (let i = 0; i < phases.length; i++) {
    const len = legCoordCounts[i] ?? 0;
    out.push({ ...phases[i], startIdx: idx, endIdx: idx + len });
    idx += len;
  }
  return out;
}
```

- [ ] **Step 3: Replace the per-route loop**

Replace the body of the `for (let ri = 0; ri < planned.length; ri++)` loop — and the `planRoutes` call above it — with a search. The new inner block:

```ts
    const usedNames = new Set<string>();

    for (let ri = 0; ri < ROUTES_PER_CENTRE; ri++) {
      try {
        // Bisect the radius until the drive lands in the test-length band.
        // Every fetch is cached on disk, so a re-run costs nothing.
        let scale = 1, lo = 0.4, hi = 2.5;
        let plan = planTestRoute({ lat: c.lat, lng: c.lng }, features, ri, scale);
        let r = await fetchRoute(plan.waypoints);
        for (let t = 0; t < MAX_TRIES; t++) {
          const step = nextScale(r.durationS, scale, lo, hi);
          if (step.done) break;
          scale = step.scale; lo = step.lo; hi = step.hi;
          plan = planTestRoute({ lat: c.lat, lng: c.lng }, features, ri, scale);
          r = await fetchRoute(plan.waypoints);
          await sleep(700);
        }

        const geometry = { type: "LineString", coordinates: r.coords.map((p) => [p.lng, p.lat]) };
        const hazards = deriveHazards(r.coords);
        const phases = phaseBounds(r.legCoordCounts, plan.phases.map((p) => ({ name: p.name, kind: p.kind })));
        const derived = nameFromSteps(r.steps, usedNames);
        for (const road of (derived ?? "").split(" and ")) if (road) usedNames.add(road);
        const route = { name: `Route ${ri + 1} · ${derived ?? FALLBACK_NAMES[ri % FALLBACK_NAMES.length]}` };
        const minutes = Math.round((r.durationS / 60) * PACE);
        lines.push(
          `insert into routes (id, centre_id, name, geometry, estimated_minutes, distance_km, difficulty, speed_profile, observation_zones, steps, phases) ` +
          `select gen_random_uuid(), id, '${esc(route.name)}', ${j(geometry)}, ` +
          `${minutes}, ${(r.distanceM / 1000).toFixed(2)}, ` +
          `${deriveDifficulty(r.distanceM / 1000, hazards.length * 2)}, ${j(deriveSpeedProfile(r.speedsMps))}, ` +
          `${j(deriveObservationZones(r.coords))}, ${j(buildNavSteps(r.steps))}, ${j(phases)} from test_centres where name = '${esc(c.name)}';`
        );
        for (const h of hazards) {
          lines.push(
            `insert into hazards (id, route_id, lat, lng, type, description, severity) ` +
            `select gen_random_uuid(), id, ${h.lat}, ${h.lng}, '${h.type}', '${esc(h.description)}', '${h.severity}' ` +
            `from routes where name = '${esc(route.name)}' and centre_id = (select id from test_centres where name = '${esc(c.name)}');`
          );
        }
        console.log(`  ok: ${route.name} (${minutes} min, ${(r.distanceM / 1000).toFixed(1)} km, scale ${scale.toFixed(2)}, ${plan.phases.map((p) => p.name).join("/")})`);
      } catch (e) {
        // Not a warning. This file is truncate-and-reload, so a route skipped
        // here is a route that disappears from the app on the next push.
        failures.push(`${c.name} route ${ri + 1}: ${(e as Error).message}`);
        console.error(`FAILED ${c.name} route ${ri + 1}: ${(e as Error).message}`);
      }
      await sleep(700);
    }
```

- [ ] **Step 4: Expose leg lengths from OSRM**

`phaseBounds` needs the per-leg coordinate counts, which `fetchRoute` does not currently return. In `scripts/seed/osrm.ts`, add `legCoordCounts: number[]` to `OsrmRoute` and populate it:

```ts
    // One entry per leg: how many geometry coordinates that leg contributed.
    // OSRM gives per-leg step geometry only via `annotations`, but the leg's
    // node count is exactly its annotation length, and the whole-route
    // geometry is those legs concatenated.
    legCoordCounts: r.legs.map((l: any) => (l.annotation?.speed?.length ?? 0)),
```

- [ ] **Step 5: Add the column to the seed header**

In the `lines` array at the top of `main()`, beside the existing `alter table` line, add:

```ts
    "alter table routes add column if not exists phases jsonb default '[]';",
```

- [ ] **Step 6: Dry-run against one centre**

Temporarily slice `centres` to the first entry (`for (let ci = 0; ci < 1; ci++)`) and run:

Run: `npm run seed`
Expected: ten `ok:` lines, each reporting between 36 and 42 minutes, and each listing its phases. Restore the full loop afterwards.

- [ ] **Step 7: Full run**

Run: `npm run seed`
Expected: `wrote supabase/seed.sql`, no `FAILED` lines. This takes roughly 40 minutes; every fetch is cached, so a re-run after a failure is fast.

- [ ] **Step 8: Verify the distribution actually moved**

Run:

```bash
python - <<'EOF'
import re, io
s = io.open('supabase/seed.sql', encoding='utf8').read()
mins = [int(m.group(1)) for m in re.finditer(r"::jsonb,\s*(\d+),\s*([\d.]+),\s*(\d)", s)]
mins.sort()
n = len(mins)
inband = sum(1 for x in mins if 36 <= x <= 42)
print("routes:", n, "min/med/max:", mins[0], mins[n//2], mins[-1])
print("in the 36-42 band:", inband, "of", n)
EOF
```

Expected: 400 routes, and the great majority inside 36–42. Report the actual figure — do not claim success without it.

- [ ] **Step 9: Commit**

```bash
git add scripts/seed/generate.ts scripts/seed/osrm.ts supabase/seed.sql
git commit -m "feat: seed every centre ten loops the length of a real test"
```

---

### Task 6: Push and confirm in the app

**Files:** none — verification.

- [ ] **Step 1: Push the seed**

Run: `npx tsx scripts/seed/push.ts` with the pooler credentials from `SETUP.md`.
Expected: the row-count summary reports 400 routes.

- [ ] **Step 2: Confirm in the app**

Run: `npm start`. Open a centre and check that its ten routes all read between 36 and 42 minutes, that their names are roads the route drives, and that a route preview still draws a closed loop back to the centre.

- [ ] **Step 3: Report**

State the measured in-band figure from Task 5 Step 8 and anything that did not land.

---

## Self-Review

**Spec coverage.** Section 02's duration defect and the 36–42 target → Tasks 3 and 5. Section 03's six phases, their OSM tags and the two optional phases → Tasks 1 and 2. Section 08's `scripts/seed/testPhases.ts`, `routePlan.ts`/`overpass.ts` edits and the `routes.phases` migration → Tasks 1, 2, 4, 5.

**Placeholders.** None. Every code step carries the code.

**Type consistency.** `PhaseName` in `testPhases.ts` and `RoutePhaseName` in `db.ts` list the same six strings; `PlannedPhase.kind` is `FeatureKind | "ring"` and is widened to `string` on `RoutePhase.kind` because the stored JSON is read back untyped. `planTestRoute(centre, features, routeIndex, scale)` is called with exactly that arity in Task 5.

**Ordering note.** Task 4's migration must be applied before Task 5's generated SQL is pushed, since the insert names the `phases` column.
