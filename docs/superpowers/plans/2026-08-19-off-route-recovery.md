# Off-Route Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when a driver leaves the practice route, guide them back onto it via the cheapest rejoin that needs no U-turn, and record each departure on the mock-test result.

**Architecture:** A new pure module `src/lib/offRoute.ts` holds a four-state machine with two-sided hysteresis plus a `chooseRejoin` scorer. Neither touches React or the network, so every threshold is testable in Jest. `practice.tsx` and `mock.tsx` feed it the snap distance already computed by `navSnap`, and on a departure fetch a return leg through the existing `fetchDirections` service — the same call both screens already use for the approach leg. `ManeuverBanner` gains an amber tone; `NavMap` gains a return-leg line and dims the main route.

**Tech Stack:** TypeScript, React Native / Expo (expo-router, expo-location, expo-speech, expo-haptics), `@rnmapbox/maps`, Jest + `jest-expo`, Supabase Postgres.

**Spec:** `docs/design/2026-08-19-routes-offroute.html` (sections 04, 05, 06, 07)

## Global Constraints

- All thresholds live as exported named constants in `src/lib/offRoute.ts`. No numeric literal for a threshold at any call site.
- `src/lib/offRoute.ts` imports only from `./geo` and `@/types/db`. No React, no `fetch`, no `expo-*`.
- Speech uses `{ language: "en-GB" }`, matching every other `Speech.speak` call in the two screens.
- Colours come from `src/ui/theme.ts` (`colors.warning` is `#D97706`). No new hex literal in a component.
- A deviation is **not** a DVSA fault. It is never added to `mistakes[]` and never changes `mock_test_score`.
- Run tests with `npx jest <path>`. Lint with `npm run lint`.
- Commit messages: `feat:` / `fix:` / `test:` prefix, and end with the Co-Authored-By trailer used by this repo.

---

### Task 1: The off-route state machine

**Files:**
- Create: `src/lib/offRoute.ts`
- Test: `src/lib/__tests__/offRoute.test.ts`

**Interfaces:**
- Consumes: `LatLng` from `src/lib/geo.ts`.
- Produces: `OFF_ROUTE_ENTER_M`, `OFF_ROUTE_EXIT_M`, `ENTER_FIXES`, `EXIT_FIXES`, `SKIP_WARN_M`, type `OffRoutePhase`, type `OffRouteState`, type `OffRouteInput`, type `OffRouteEvent`, type `OffRouteStep`, `initialOffRoute`, `stepOffRoute(prev, input) => OffRouteStep`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/offRoute.test.ts`:

```ts
import {
  ENTER_FIXES,
  initialOffRoute,
  OFF_ROUTE_ENTER_M,
  stepOffRoute,
  type OffRouteInput,
  type OffRouteState,
} from "../offRoute";

const input = (over: Partial<OffRouteInput> = {}): OffRouteInput => ({
  routeDistM: 5,
  returnLegDistM: null,
  trailIdx: 40,
  returnLegReady: false,
  ...over,
});

/** Feed the machine `n` identical fixes and return the final step. */
function feed(state: OffRouteState, over: Partial<OffRouteInput>, n: number) {
  let s = state;
  let event: ReturnType<typeof stepOffRoute>["event"] = "none";
  for (let i = 0; i < n; i++) {
    const r = stepOffRoute(s, input(over));
    s = r.state;
    event = r.event;
  }
  return { state: s, event };
}

test("a fix on the line keeps it on-route and reports nothing", () => {
  const r = stepOffRoute(initialOffRoute, input());
  expect(r.state.phase).toBe("on-route");
  expect(r.event).toBe("none");
});

test("one fix past the entry threshold strays but stays silent", () => {
  const r = stepOffRoute(initialOffRoute, input({ routeDistM: OFF_ROUTE_ENTER_M + 10 }));
  expect(r.state.phase).toBe("straying");
  expect(r.event).toBe("none");
  expect(r.state.departedIdx).toBe(40);
});

test("a GPS spike that returns to the line never announces a departure", () => {
  // Two wild fixes, then back on the road — the classic urban-canyon bounce.
  const strayed = feed(initialOffRoute, { routeDistM: 300 }, ENTER_FIXES - 1);
  expect(strayed.event).toBe("none");
  const back = stepOffRoute(strayed.state, input({ routeDistM: 5 }));
  expect(back.state.phase).toBe("on-route");
  expect(back.state.departedIdx).toBeNull();
  expect(back.event).toBe("none");
});

test("three consecutive fixes past the threshold declare a departure once", () => {
  const gone = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES);
  expect(gone.state.phase).toBe("off-route");
  expect(gone.event).toBe("departed");
  // A fourth fix must not re-announce.
  const again = stepOffRoute(gone.state, input({ routeDistM: 130 }));
  expect(again.event).toBe("none");
});

test("the departure index is the trail index at the moment of leaving, not later", () => {
  let s = stepOffRoute(initialOffRoute, input({ routeDistM: 120, trailIdx: 40 })).state;
  s = stepOffRoute(s, input({ routeDistM: 200, trailIdx: 41 })).state;
  s = stepOffRoute(s, input({ routeDistM: 260, trailIdx: 42 })).state;
  expect(s.phase).toBe("off-route");
  expect(s.departedIdx).toBe(40);
});

test("the hysteresis gap holds: a fix between exit and entry changes nothing", () => {
  const strayed = stepOffRoute(initialOffRoute, input({ routeDistM: 120 })).state;
  const held = stepOffRoute(strayed, input({ routeDistM: 35 }));
  expect(held.state.phase).toBe("straying");
  expect(held.state.streak).toBe(strayed.streak);
});

test("a fetched return leg moves off-route to returning", () => {
  const gone = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  const r = stepOffRoute(gone, input({ routeDistM: 120, returnLegReady: true, returnLegDistM: 4 }));
  expect(r.state.phase).toBe("returning");
  expect(r.event).toBe("none");
});

test("two fixes back on the line rejoin and announce once", () => {
  let s = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  s = stepOffRoute(s, input({ routeDistM: 120, returnLegReady: true, returnLegDistM: 4 })).state;
  const first = stepOffRoute(s, input({ routeDistM: 8, returnLegReady: true, returnLegDistM: 6 }));
  expect(first.event).toBe("none");
  const second = stepOffRoute(first.state, input({ routeDistM: 6, returnLegReady: true, returnLegDistM: 6 }));
  expect(second.state.phase).toBe("on-route");
  expect(second.event).toBe("rejoined");
  expect(second.state.departedIdx).toBeNull();
});

test("leaving the return leg asks for a recompute without re-announcing a departure", () => {
  let s = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  s = stepOffRoute(s, input({ routeDistM: 120, returnLegReady: true, returnLegDistM: 4 })).state;
  const r = feed(s, { routeDistM: 300, returnLegReady: true, returnLegDistM: 200 }, ENTER_FIXES);
  expect(r.state.phase).toBe("off-route");
  expect(r.event).toBe("recompute");
});

test("coming back before the return leg arrives still counts as rejoined", () => {
  const gone = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  const r = feed(gone, { routeDistM: 5 }, 2);
  expect(r.state.phase).toBe("on-route");
  expect(r.event).toBe("rejoined");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/offRoute.test.ts`
Expected: FAIL — `Cannot find module '../offRoute'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/offRoute.ts`:

```ts
/**
 * Whether the driver is still on the route, and what to do about it.
 *
 * `navSnap` in ./navmap has reported an `onRoute` flag since the nav map was
 * built, and nothing consumed it. The reason it could not simply be shown is
 * that a single fix beyond the snap radius means nothing: urban canyons,
 * multi-storey car parks and tunnel mouths throw fixes hundreds of metres
 * wide, and a banner driven straight off that flag strobes at every red light
 * beside a tall building.
 *
 * So this is a machine, not an `if`. Two things stop it flapping: entry and
 * exit use different distances, and both directions need consecutive fixes.
 * Noise that crosses one threshold cannot cross the other.
 *
 * Pure — no React, no network. The screens own the fetching and the speaking.
 */

/** Past this distance from the line the driver is a candidate for "left the route". */
export const OFF_ROUTE_ENTER_M = 45;
/**
 * Back inside this and they are on it again. Twenty metres below entry: the
 * gap is the hysteresis, and it is what a fix sitting exactly on the boundary
 * cannot oscillate across.
 */
export const OFF_ROUTE_EXIT_M = 25;
/** At roughly 1 Hz, three seconds of genuinely being somewhere else. */
export const ENTER_FIXES = 3;
/** Faster to forgive than to accuse. */
export const EXIT_FIXES = 2;
/**
 * Below this, a rejoin is not worth mentioning. Telling a driver they missed
 * 40 m is noise, and noise is what makes people mute an app mid-drive.
 */
export const SKIP_WARN_M = 250;

export type OffRoutePhase = "on-route" | "straying" | "off-route" | "returning";

export type OffRouteState = {
  phase: OffRoutePhase;
  /** Consecutive fixes supporting the transition currently being considered. */
  streak: number;
  /**
   * The route vertex the driver was last on before leaving, or null while on
   * the route. Captured at the *first* straying fix rather than when the
   * departure is declared, because by the third fix the trail index has
   * already crept along the nearest bit of line the driver is no longer on.
   */
  departedIdx: number | null;
};

export const initialOffRoute: OffRouteState = { phase: "on-route", streak: 0, departedIdx: null };

export type OffRouteInput = {
  /** Distance from this fix to the nearest point on the active route polyline. */
  routeDistM: number;
  /** Distance to the return leg, or null when there is no return leg yet. */
  returnLegDistM: number | null;
  /** The trail index at this fix. */
  trailIdx: number;
  /** True once a return leg has been fetched and is being navigated. */
  returnLegReady: boolean;
};

/**
 * What the screen has to act on. Every event fires exactly once per
 * occurrence — the screens speak and vibrate on these, so a repeat is a
 * driver being told the same thing twice.
 */
export type OffRouteEvent = "none" | "departed" | "rejoined" | "recompute";

export type OffRouteStep = { state: OffRouteState; event: OffRouteEvent };

const on = (): OffRouteState => ({ phase: "on-route", streak: 0, departedIdx: null });

export function stepOffRoute(prev: OffRouteState, input: OffRouteInput): OffRouteStep {
  const { routeDistM, returnLegDistM, trailIdx, returnLegReady } = input;
  const near = routeDistM <= OFF_ROUTE_EXIT_M;
  const far = routeDistM > OFF_ROUTE_ENTER_M;

  switch (prev.phase) {
    case "on-route":
      if (!far) return { state: prev, event: "none" };
      return { state: { phase: "straying", streak: 1, departedIdx: trailIdx }, event: "none" };

    case "straying": {
      if (near) return { state: on(), event: "none" };
      // Between the two thresholds: hold everything, including the streak.
      if (!far) return { state: prev, event: "none" };
      const streak = prev.streak + 1;
      if (streak < ENTER_FIXES) return { state: { ...prev, streak }, event: "none" };
      return { state: { ...prev, phase: "off-route", streak: 0 }, event: "departed" };
    }

    case "off-route": {
      // They may find their own way back before the directions call resolves.
      if (near) {
        const streak = prev.streak + 1;
        if (streak < EXIT_FIXES) return { state: { ...prev, streak }, event: "none" };
        return { state: on(), event: "rejoined" };
      }
      if (returnLegReady) return { state: { ...prev, phase: "returning", streak: 0 }, event: "none" };
      return { state: { ...prev, streak: 0 }, event: "none" };
    }

    case "returning": {
      if (near) {
        const streak = prev.streak + 1;
        if (streak < EXIT_FIXES) return { state: { ...prev, streak }, event: "none" };
        return { state: on(), event: "rejoined" };
      }
      // Off the return leg too — the rejoin we picked is no longer reachable
      // the way we planned, so ask for a new one. Measured against the return
      // leg, not the route: the driver is *supposed* to be far from the route
      // here, and scoring that as a second departure would loop forever.
      if (returnLegDistM !== null && returnLegDistM > OFF_ROUTE_ENTER_M) {
        const streak = prev.streak + 1;
        if (streak < ENTER_FIXES) return { state: { ...prev, streak }, event: "none" };
        return { state: { ...prev, phase: "off-route", streak: 0 }, event: "recompute" };
      }
      return { state: { ...prev, streak: 0 }, event: "none" };
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/offRoute.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offRoute.ts src/lib/__tests__/offRoute.test.ts
git commit -m "feat: tell a stray GPS fix from a driver who has actually left the route"
```

---

### Task 2: Choosing where to rejoin

**Files:**
- Modify: `src/lib/offRoute.ts` (append)
- Test: `src/lib/__tests__/offRoute.test.ts` (append)

**Interfaces:**
- Consumes: `LatLng`, `haversineM`, `bearingDeg`, `turnAngleDeg` from `src/lib/geo.ts`; `cumulativeM` output (a `number[]`) supplied by the caller.
- Produces: `SKIP_PENALTY`, `BEHIND_DEG`, type `Rejoin = { idx: number; point: LatLng; skippedM: number }`, `chooseRejoin(coords, cum, pos, departedIdx, headingDeg) => Rejoin | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/offRoute.test.ts`:

```ts
import { chooseRejoin } from "../offRoute";
import type { LatLng } from "../geo";

// A straight eastbound line at 51.5N, one point roughly every 70 m.
const straight: LatLng[] = Array.from({ length: 21 }, (_, i) => ({ lat: 51.5, lng: -0.1 + i * 0.001 }));
const cumOf = (cs: LatLng[]) => {
  const out = [0];
  for (let i = 1; i < cs.length; i++) {
    const dx = (cs[i].lng - cs[i - 1].lng) * 111320 * Math.cos((51.5 * Math.PI) / 180);
    const dy = (cs[i].lat - cs[i - 1].lat) * 110540;
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
};
const cum = cumOf(straight);

test("a driver just north of the line rejoins at the nearest vertex ahead", () => {
  const pos = { lat: 51.5008, lng: -0.0945 };  // ~90 m north, level with vertex 5
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.idx).toBeGreaterThanOrEqual(5);
  expect(r.idx).toBeLessThanOrEqual(8);
  expect(r.skippedM).toBeGreaterThanOrEqual(0);
});

test("skipped distance is measured along the route, not as the crow flies", () => {
  const pos = { lat: 51.5008, lng: -0.0905 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.skippedM).toBeCloseTo(cum[r.idx] - cum[5], 0);
});

test("a candidate behind the driver is rejected rather than asking for a U-turn", () => {
  // Driver is level with vertex 15, still heading east; the departure was at 5.
  const pos = { lat: 51.5008, lng: -0.085 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  // Everything at or before 15 is behind them, so the rejoin must be ahead.
  expect(r.idx).toBeGreaterThanOrEqual(15);
});

test("with no heading known, nothing is rejected for being behind", () => {
  const pos = { lat: 51.5008, lng: -0.085 };
  const r = chooseRejoin(straight, cum, pos, 5, null)!;
  expect(r.idx).toBeGreaterThanOrEqual(5);
});

test("the skip penalty stops a far rejoin winning on crow distance alone", () => {
  // Sitting right beside vertex 6 but pointing east: vertex 6 costs almost no
  // detour and skips almost nothing, so it must beat the end of the line.
  const pos = { lat: 51.5004, lng: -0.0941 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.idx).toBeLessThan(12);
});

test("a route with no vertices ahead of the departure returns null", () => {
  const r = chooseRejoin(straight, cum, { lat: 51.5008, lng: -0.08 }, straight.length - 1, 90);
  expect(r).toBeNull();
});

test("the returned point is the coordinate at the chosen index", () => {
  const pos = { lat: 51.5008, lng: -0.0945 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.point).toEqual(straight[r.idx]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/offRoute.test.ts -t rejoin`
Expected: FAIL — `chooseRejoin is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/offRoute.ts` (and extend the existing import at the top of the file to `import { bearingDeg, haversineM, turnAngleDeg, type LatLng } from "./geo";`):

```ts
/**
 * What a metre of skipped route costs, against a metre of driving to reach the
 * rejoin. Above 1 so that skipping is never free — at 1.0 the scorer would
 * happily throw away half the loop to save a single metre of detour — and not
 * far above it, because a driver who has genuinely overshot should not be sent
 * backwards down the road to save route they cannot reach anyway.
 */
export const SKIP_PENALTY = 1.5;

/**
 * A rejoin more than this far off the driver's heading is behind them, and
 * reaching it means a U-turn. 120° rather than 90°: at exactly abeam, a point
 * across a dual carriageway is usually still reachable at the next junction,
 * and rejecting it would push the rejoin needlessly far down the route.
 */
export const BEHIND_DEG = 120;

export type Rejoin = {
  /** Index into the route polyline to rejoin at. */
  idx: number;
  point: LatLng;
  /** Metres of route between where they left and where they rejoin. */
  skippedM: number;
};

/**
 * The cheapest point on the route ahead that does not require a U-turn.
 *
 * Candidates start at `departedIdx` and run to the end of the line. Rejoining
 * *behind* the departure is deliberately not offered: it is the "drive back to
 * where you went wrong" option, and on a missed roundabout exit that means
 * instructing a learner to turn around, which this app should not do.
 *
 * `headingDeg` is the driver's course, or null when they are too slow for one
 * to be meaningful (see travelBearing). Null disables the behind-you filter
 * rather than rejecting everything: a stationary driver has no "behind".
 */
export function chooseRejoin(
  coords: LatLng[],
  cum: number[],
  pos: LatLng,
  departedIdx: number,
  headingDeg: number | null,
): Rejoin | null {
  const from = Math.min(Math.max(departedIdx, 0), coords.length - 1);
  if (from >= coords.length - 1) return null;

  let best: Rejoin | null = null;
  let bestScore = Infinity;

  for (let i = from; i < coords.length; i++) {
    const c = coords[i];
    const reach = haversineM(pos, c);
    if (headingDeg !== null && reach > 1) {
      const off = Math.abs(turnAngleDeg(headingDeg, bearingDeg(pos, c)));
      if (off > BEHIND_DEG) continue;
    }
    const skippedM = Math.max(0, (cum[i] ?? 0) - (cum[from] ?? 0));
    const score = reach + skippedM * SKIP_PENALTY;
    if (score < bestScore) {
      bestScore = score;
      best = { idx: i, point: c, skippedM: Math.round(skippedM) };
    }
  }

  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/offRoute.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offRoute.ts src/lib/__tests__/offRoute.test.ts
git commit -m "feat: pick the cheapest rejoin that does not ask for a U-turn"
```

---

### Task 3: The spoken lines

**Files:**
- Modify: `src/lib/offRoute.ts` (append)
- Test: `src/lib/__tests__/offRoute.test.ts` (append)

**Interfaces:**
- Consumes: `SKIP_WARN_M`, `formatDistance` from `src/lib/navigation.ts`.
- Produces: `departureLine(skippedM: number) => string`, `REJOINED_LINE: string`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/offRoute.test.ts`:

```ts
import { departureLine, REJOINED_LINE, SKIP_WARN_M } from "../offRoute";

test("a long skip is quantified out loud", () => {
  expect(departureLine(380)).toBe("You've left the route. Rejoining ahead — you'll miss about 380 m.");
});

test("a skip under the warning threshold is not mentioned", () => {
  expect(departureLine(SKIP_WARN_M - 1)).toBe("You've left the route. Getting you back on.");
});

test("rejoining says one short thing", () => {
  expect(REJOINED_LINE).toBe("Back on route.");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/offRoute.test.ts -t "left the route"`
Expected: FAIL — `departureLine is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/offRoute.ts`, and add `import { formatDistance } from "./navigation";` to the imports.

```ts
export const REJOINED_LINE = "Back on route.";

/**
 * What the app says when the driver has left the route.
 *
 * The distance is dropped below SKIP_WARN_M rather than rounded down to zero:
 * a sentence that ends "you'll miss about 0 m" is worse than one that does not
 * mention it, and the number is only there to tell the learner they have some
 * route left to re-drive.
 */
export function departureLine(skippedM: number): string {
  if (skippedM < SKIP_WARN_M) return "You've left the route. Getting you back on.";
  return `You've left the route. Rejoining ahead — you'll miss about ${formatDistance(skippedM)}.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/offRoute.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offRoute.ts src/lib/__tests__/offRoute.test.ts
git commit -m "feat: say what was missed, and only when it is worth saying"
```

---

### Task 4: Amber mode on the manoeuvre banner

**Files:**
- Modify: `src/ui/ManeuverBanner.tsx`
- Test: `src/ui/__tests__/maneuverBanner.test.tsx` (create)

**Interfaces:**
- Consumes: `ManeuverBannerProps` as it stands today.
- Produces: `ManeuverBannerProps` gains `tone?: "go" | "off"` (default `"go"`) and `eyebrowIcon?: keyof typeof Ionicons.glyphMap`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/maneuverBanner.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { ManeuverBanner } from "../ManeuverBanner";
import type { NavStep } from "@/types/db";

const step: NavStep = {
  lat: 51.5, lng: -0.1, instruction: "Turn left onto Sandpit Lane",
  road: "Sandpit Lane", type: "turn", modifier: "left", distanceM: 120,
};

test("the banner shows the instruction it was given", () => {
  const { getByText } = render(<ManeuverBanner step={step} distanceM={200} />);
  expect(getByText("Turn left onto Sandpit Lane")).toBeTruthy();
});

test("the off tone replaces the distance with the rejoin label", () => {
  const { getByText, queryByText } = render(
    <ManeuverBanner tone="off" eyebrow="Off route" step={step} distanceM={200} distanceLabel="Rejoining ahead" />
  );
  expect(getByText("Off route")).toBeTruthy();
  expect(getByText("Rejoining ahead")).toBeTruthy();
  expect(queryByText("200 m")).toBeNull();
});

test("the go tone still formats the distance", () => {
  const { getByText } = render(<ManeuverBanner step={step} distanceM={200} />);
  expect(getByText("200 m")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/maneuverBanner.test.tsx`
Expected: FAIL — the `tone` and `distanceLabel` props do not exist, so "Rejoining ahead" is not found.

- [ ] **Step 3: Write the implementation**

In `src/ui/ManeuverBanner.tsx`, extend the props type and the two coloured elements. Add to `ManeuverBannerProps`:

```ts
  /**
   * "go" is the normal green drive. "off" is the amber off-route state: same
   * geometry and same position, because a driver mid-turn should not have to
   * re-find the banner — only its colour and its eyebrow change.
   */
  tone?: "go" | "off";
  /** Replaces the formatted distance, e.g. "Rejoining ahead". */
  distanceLabel?: string | null;
```

Destructure them with defaults `tone = "go", distanceLabel = null`, then replace the eyebrow strip and the icon tile:

```tsx
  const off = tone === "off";
  const stripBg = off ? "#7C4A06" : "#064E3B";
  const stripFg = off ? "#FCD9A0" : "#6EE7B7";
```

The eyebrow block becomes:

```tsx
      {eyebrow && (
        <View className="flex-row items-center gap-1.5 px-4 py-1.5" style={{ backgroundColor: stripBg }}>
          <Ionicons name={off ? "warning-outline" : "flag-outline"} size={12} color={stripFg} />
          <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: stripFg }}>{eyebrow}</Text>
        </View>
      )}
```

The icon tile's class becomes:

```tsx
        <View className={`h-12 w-12 items-center justify-center rounded-xl ${fallback ? "bg-slate-600" : off ? "bg-warning" : "bg-accent"}`}>
```

And the distance line becomes:

```tsx
          {(distanceLabel !== null || distanceM !== null) && (
            <Text className="text-[13px] font-semibold" style={{ color: stripFg }}>
              {distanceLabel ?? formatDistance(distanceM!)}
            </Text>
          )}
```

- [ ] **Step 4: Confirm `bg-warning` exists**

Run: `grep -n "warning" tailwind.config.js`
Expected: a `warning` colour mapping to `#D97706`. If it is absent, add it to the `colors` block in `tailwind.config.js` alongside `accent`, mirroring `colors.warning` in `src/ui/theme.ts`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/ui/__tests__/maneuverBanner.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ManeuverBanner.tsx src/ui/__tests__/maneuverBanner.test.tsx tailwind.config.js
git commit -m "feat: give the manoeuvre banner an amber off-route tone"
```

---

### Task 5: Drawing the return leg on the map

**Files:**
- Modify: `src/ui/NavMap.tsx`

**Interfaces:**
- Consumes: existing `NavMapProps`, `lineShape`, `EMPTY_SHAPE`, `mapColors`.
- Produces: `NavMapProps` gains `returnLL?: LatLng[]` (default `[]`) and `dimRoute?: boolean` (default `false`).

- [ ] **Step 1: Add the props**

In `src/ui/NavMap.tsx`, add to `NavMapProps`:

```ts
  /**
   * The amber leg back onto the route. Empty draws nothing. Kept separate from
   * `routeLL` rather than swapped into it, because the route has to stay on
   * screen underneath — a driver who cannot see the line they left has no way
   * to judge whether the way back makes sense.
   */
  returnLL?: LatLng[];
  /** Mute the route while the return leg is the thing being driven. */
  dimRoute?: boolean;
```

Destructure with `returnLL = [], dimRoute = false`.

- [ ] **Step 2: Memoise the shape**

Beside the existing shape memos, add:

```tsx
  const returnShape = useMemo(() => lineShape(returnLL), [returnLL]);
```

- [ ] **Step 3: Add the layer**

After the existing "ahead" `ShapeSource`/`LineLayer` pair, add a permanently-mounted source (same rule as every other source in this file — see the comment above `EMPTY_SHAPE`):

```tsx
      <ShapeSource id="returnLeg" shape={returnShape}>
        <LineLayer
          id="returnLegLine"
          style={{
            lineColor: colors.warning,
            lineWidth: 7,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </ShapeSource>
```

Import `colors` from `@/ui/theme` if it is not already imported.

- [ ] **Step 4: Dim the route behind it**

On the existing "ahead" `LineLayer`, make the opacity conditional:

```tsx
          style={{ ...aheadStyle, lineOpacity: dimRoute ? 0.35 : 1 }}
```

Apply the same to the trail layer's style. Keep whatever `aheadStyle`/trail style object the file already defines rather than inlining new colours.

- [ ] **Step 5: Verify it compiles and nothing regressed**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest src/ui`
Expected: PASS — the existing UI suite is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/ui/NavMap.tsx
git commit -m "feat: draw the way back onto the route, with the route still visible under it"
```

---

### Task 6: Wire the machine into the practice screen

**Files:**
- Modify: `app/route/[id]/practice.tsx`

**Interfaces:**
- Consumes: `stepOffRoute`, `initialOffRoute`, `chooseRejoin`, `departureLine`, `REJOINED_LINE`, `type OffRouteState`, `type Rejoin` from `@/lib/offRoute`; `fetchDirections` from `@/services/directions`; `snapToPath` from `@/lib/geo`.
- Produces: nothing consumed by later tasks in this plan.

- [ ] **Step 1: Add the imports and refs**

Add to the imports:

```ts
import { chooseRejoin, departureLine, initialOffRoute, REJOINED_LINE, stepOffRoute, type OffRouteState, type Rejoin } from "@/lib/offRoute";
import { snapToPath } from "@/lib/geo";
```

Add beside the existing state:

```ts
  const [returnLeg, setReturnLeg] = useState<Directions | null>(null);
  const [offPhase, setOffPhase] = useState<OffRouteState["phase"]>("on-route");
```

and beside the existing refs:

```ts
  const offRef = useRef<OffRouteState>(initialOffRoute);
  const returnLegRef = useRef<Directions | null>(null);
  const rejoinRef = useRef<Rejoin | null>(null);
  // Guards the directions fetch: the GPS callback runs several times a second
  // and a departure stays true until the driver is back on the line.
  const fetchingReturnRef = useRef(false);
```

- [ ] **Step 2: Add the return-leg fetcher**

Add above `onPosition`:

```ts
  /**
   * Fetch the way back onto the route. Never awaited by the GPS callback —
   * that runs on every fix, and an awaited fetch there would queue one call
   * per fix for as long as the driver is off route.
   */
  const fetchReturnLeg = useCallback(async (from: LatLng, rejoin: Rejoin) => {
    if (fetchingReturnRef.current) return;
    fetchingReturnRef.current = true;
    try {
      const dirs = await fetchDirections(from, rejoin.point);
      returnLegRef.current = dirs;
      setReturnLeg(dirs);
    } catch {
      // No directions available — the banner still says "off route" and the
      // route stays drawn, which is more useful than an error the driver
      // cannot act on at the wheel.
      returnLegRef.current = null;
      setReturnLeg(null);
    } finally {
      fetchingReturnRef.current = false;
    }
  }, []);
```

- [ ] **Step 3: Drive the machine from the GPS callback**

In `onPosition`, immediately after `const result = navFix({ ...fixInput, distanceToManeuverM, snap });` and the `setPos(p)` block, insert:

```ts
    // Off-route only applies to the route leg. The approach leg is a drive to
    // the start line that the driver may legitimately take any way they like.
    if (ph === "route") {
      const routeSnap = snapToPath(coords, raw, trailRef.current);
      const legSnap = returnLegRef.current
        ? snapToPath(returnLegRef.current.coords, raw, 0, returnLegRef.current.coords.length)
        : null;
      const { state, event } = stepOffRoute(offRef.current, {
        routeDistM: routeSnap?.distM ?? Infinity,
        returnLegDistM: legSnap?.distM ?? null,
        trailIdx: result.trailIdx,
        returnLegReady: returnLegRef.current !== null,
      });
      offRef.current = state;
      setOffPhase(state.phase);

      if (event === "departed" || event === "recompute") {
        const rejoin = chooseRejoin(coords, cum, p, state.departedIdx ?? result.trailIdx, mapBearingRef.current);
        rejoinRef.current = rejoin;
        returnLegRef.current = null;
        setReturnLeg(null);
        if (rejoin) {
          if (event === "departed") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Speech.speak(departureLine(rejoin.skippedM), { language: "en-GB" });
          }
          void fetchReturnLeg(p, rejoin);
        }
      }

      if (event === "rejoined") {
        rejoinRef.current = null;
        returnLegRef.current = null;
        setReturnLeg(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Speech.speak(REJOINED_LINE, { language: "en-GB" });
      }
    }
```

- [ ] **Step 4: Reset the machine when a leg begins**

In `beginRoute`, alongside the existing resets, add:

```ts
    offRef.current = initialOffRoute;
    setOffPhase("on-route");
    rejoinRef.current = null;
    returnLegRef.current = null;
    setReturnLeg(null);
```

- [ ] **Step 5: Render it**

Change the `NavMap` element to pass the new props:

```tsx
        returnLL={returnLeg?.coords ?? []}
        dimRoute={offPhase === "off-route" || offPhase === "returning"}
```

Change the `ManeuverBanner` element so the off-route state overrides its tone, eyebrow and step. Replace the existing `<ManeuverBanner … />` with:

```tsx
            {offPhase === "off-route" || offPhase === "returning" ? (
              <ManeuverBanner
                tone="off"
                eyebrow="Off route"
                step={returnLeg?.steps?.[0]}
                distanceM={null}
                distanceLabel={
                  rejoinRef.current && rejoinRef.current.skippedM >= SKIP_WARN_M
                    ? `Rejoining — ${formatDistance(rejoinRef.current.skippedM)} skipped`
                    : "Rejoining ahead"
                }
                fallbackText="Rejoining the route"
                fallback={!returnLeg}
              />
            ) : (
              <ManeuverBanner
                eyebrow={isApproach ? "To the start" : null}
                fallback={fallback}
                step={current}
                next={next}
                distanceM={fallback ? directDist : distanceM}
              />
            )}
```

Keep whatever props the existing call already passes on the `go` branch — the block above shows the shape, not a licence to drop props that are there today. Add `SKIP_WARN_M` to the `@/lib/offRoute` import.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: clean.

Run: `npx jest`
Expected: the whole suite passes.

- [ ] **Step 7: Commit**

```bash
git add app/route/\[id\]/practice.tsx
git commit -m "feat: talk a practice driver back onto the route when they leave it"
```

---

### Task 7: The same wiring in the mock test, with departures recorded

**Files:**
- Modify: `app/route/[id]/mock.tsx`
- Modify: `src/types/db.ts`
- Create: `supabase/migrations/2026-08-19-deviations.sql`

**Interfaces:**
- Consumes: everything Task 6 consumes.
- Produces: `type Deviation = { atIdx: number; lat: number; lng: number; skippedM: number; seconds: number }` exported from `src/types/db.ts`; `ProgressEntry` gains `deviations: Deviation[]`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026-08-19-deviations.sql`:

```sql
-- Off-route departures, recorded per mock-test run.
--
-- Safe to re-run.
--
-- A deviation is not a DVSA fault — leaving the examiner's route is not on the
-- marking sheet — so it lives in its own column rather than in `mistakes`, and
-- it never reaches mock_test_score.
--
-- Shape: [{ "atIdx": 214, "lat": 51.74, "lng": -0.33, "skippedM": 380,
--           "seconds": 47 }]
begin;

alter table user_progress add column if not exists deviations jsonb default '[]';

commit;
```

- [ ] **Step 2: Add the type**

In `src/types/db.ts`, above `ProgressEntry`:

```ts
/**
 * One departure from the route during a drive.
 *
 * `atIdx` is the route vertex the driver left at, which is what lets the
 * result screen put a pin back on the map without storing a second polyline.
 */
export type Deviation = {
  atIdx: number;
  lat: number;
  lng: number;
  /** Metres of route skipped by the rejoin that followed. */
  skippedM: number;
  /** How long they were off the route. */
  seconds: number;
};
```

and add to `ProgressEntry`:

```ts
  deviations: Deviation[];
```

- [ ] **Step 3: Apply the migration**

Run the migration against the project the same way the quiz migration was applied (see `SETUP.md` — the session pooler host, `aws-0-eu-west-1`, with the project ref in the username).

Verify: `select column_name from information_schema.columns where table_name='user_progress' and column_name='deviations';` returns one row.

- [ ] **Step 4: Repeat Task 6's wiring in `mock.tsx`**

`mock.tsx` has the same `onPosition` shape, the same `navSnap`/`navFix` pair and the same `ManeuverBanner`/`NavMap` render. Apply Task 6 steps 1, 2, 3, 4 and 5 to it verbatim, with one addition: record each departure.

Add the ref:

```ts
  const deviationsRef = useRef<Deviation[]>([]);
  const offSinceRef = useRef<number | null>(null);
```

In the `departed` branch, after the speech:

```ts
        offSinceRef.current = Date.now();
```

In the `rejoined` branch, before the speech:

```ts
        const since = offSinceRef.current;
        const rejoin = rejoinRef.current;
        if (since !== null) {
          deviationsRef.current.push({
            atIdx: offRef.current.departedIdx ?? result.trailIdx,
            lat: p.lat,
            lng: p.lng,
            skippedM: rejoin?.skippedM ?? 0,
            seconds: Math.round((Date.now() - since) / 1000),
          });
          offSinceRef.current = null;
        }
```

Note the ordering: read `offRef.current.departedIdx` **before** the machine's `rejoined` step has cleared it, i.e. capture it from the pre-step state. Hold the pre-step `departedIdx` in a local at the top of the `if (ph === "route")` block:

```ts
      const departedIdxBefore = offRef.current.departedIdx;
```

and use `departedIdxBefore` in the push above.

- [ ] **Step 5: Persist them**

Where `mock.tsx` builds the `ProgressEntry` it inserts on finishing, add:

```ts
      deviations: deviationsRef.current,
```

Then check `src/services/progressRepo.ts`: if it lists columns explicitly on insert or select, add `deviations` to both. If it uses `select("*")` and passes the entry object whole, no change is needed.

Run: `grep -n "select\|insert" src/services/progressRepo.ts`

- [ ] **Step 6: Show them on the result screen**

In `app/route/[id]/result.tsx`, below the fault bars, render a row when there were any:

```tsx
      {deviations.length > 0 && (
        <View className="flex-row items-baseline justify-between px-4 py-3">
          <Text style={{ ...subheadline, color: colors.labelSecondary }}>
            {deviations.length === 1 ? "Went off route once" : `Went off route ${deviations.length} times`}
          </Text>
          <Text style={{ ...footnote, color: colors.warning }}>
            {formatDistance(deviations.reduce((s, d) => s + d.skippedM, 0))} not driven
          </Text>
        </View>
      )}
```

Read `deviations` from the progress row the screen already loads. Match the surrounding rows' markup rather than the sketch above where they differ.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npx jest`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add app/route/\[id\]/mock.tsx app/route/\[id\]/result.tsx src/types/db.ts src/services/progressRepo.ts supabase/migrations/2026-08-19-deviations.sql
git commit -m "feat: guide a mock-test driver back, and say on the result that they wandered"
```

---

### Task 8: Confirm it works in the running app

**Files:** none — this is a verification task.

- [ ] **Step 1: Start the app**

Run: `npm start`, then open it on device or simulator.

- [ ] **Step 2: Drive a route off-course**

Use a simulated location that leaves the route by more than 45 m for at least three fixes. Confirm, in order:
1. Nothing happens on the first or second stray fix.
2. On the third, the banner turns amber, reads "Off route", and one sentence is spoken.
3. The route dims and an amber return leg appears.
4. Coming back onto the line turns the banner green again and says "Back on route." exactly once.

- [ ] **Step 3: Confirm the mock test records it**

Complete a mock test with one deliberate departure and check the result screen shows "Went off route once" with a skipped distance, and that `mock_test_score` is unchanged by it.

- [ ] **Step 4: Commit nothing; report findings**

If any step misbehaves, fix it under `superpowers:systematic-debugging` rather than patching blind.

---

## Self-Review

**Spec coverage.** Section 04's state machine and all five constants → Task 1. Section 05's rejoin scoring, U-turn rejection and skip accounting → Task 2. Section 06's amber banner, dimmed route, return leg and four spoken lines → Tasks 3, 4, 5, 6. Section 07's deviation recording, result row and "not a fault" rule → Task 7. Section 08's file list → Tasks 1–7, minus `scripts/seed/*` and `routes.phases`, which belong to the companion plan.

**Placeholders.** None. Every code step carries the code.

**Type consistency.** `OffRouteState.departedIdx` is `number | null` throughout; `Rejoin.skippedM` is a rounded `number` and is read as such in `departureLine`, the banner label and `Deviation.skippedM`. `chooseRejoin` takes `headingDeg: number | null` and both screens pass `mapBearingRef.current`, a `number`.
