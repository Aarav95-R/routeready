# Waze Map Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the practice-drive navigation map look and behave like Waze — coloured base map with wide roads, a three-layer puck, GPS snapped to the route, and a camera that stops twitching.

**Architecture:** New pure geometry helpers (`projectOnSegment`, `snapToPath`, `smoothHeading`) in `src/lib/geo.ts` and a hysteresis-aware `navZoom` in `src/lib/navigation.ts` carry all the testable logic. Presentation moves out of the already-large `app/route/[id]/practice.tsx` into two new files: `src/ui/mapStyle.ts` (palette + road-width expressions) and `src/ui/NavPuck.tsx` (the puck). The screen then swaps its base style, applies layer overrides, and takes manual control of the camera so the snapped position and smoothed heading actually reach the view.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript, `@rnmapbox/maps` ^10.3.5, `react-native-svg` 15.12.1, `expo-location`, Jest (`jest-expo` preset) + `@testing-library/react-native`, NativeWind.

**Spec:** `docs/superpowers/specs/2026-08-03-waze-map-design.md`

## Global Constraints

- **No new dependencies.** Everything needed (`react-native-svg`, `@rnmapbox/maps`) is already installed.
- **Path alias:** `@/` resolves to `src/` (configured in `tsconfig.json` and jest `moduleNameMapper`).
- **Test command:** `npm test` (Jest, `jest-expo` preset). Single file: `npx jest src/lib/__tests__/geo.test.ts`.
- **No emoji anywhere in UI or copy.** British English in user-facing strings.
- **Emerald identity is fixed:** route core `#059669` (`colors.accent`), route casing `#04684C`, puck arrow `#059669`. Do not substitute Waze purple or blue.
- **Existing test files are extended, not replaced.** `src/lib/__tests__/geo.test.ts` and `navigation.test.ts` already exist and pass; keep every existing test green except the one `navZoom` assertion Task 2 explicitly updates.
- **Comment style:** the codebase uses sparse comments that explain *why*, not *what*. Match it.
- **Device verification** uses the **Hemel Hempstead (TEST)** route loop.

---

### Task 1: Geometry primitives — projection, snapping, heading smoothing

**Files:**
- Modify: `src/lib/geo.ts` (append; existing exports untouched)
- Test: `src/lib/__tests__/geo.test.ts` (append)

**Interfaces:**
- Consumes: existing `LatLng`, `haversineM`, `bearingDeg`, `turnAngleDeg`, and the module-private `R` / `toRad` constants in `src/lib/geo.ts`.
- Produces:
  - `type Projection = { point: LatLng; t: number; distM: number }`
  - `projectOnSegment(a: LatLng, b: LatLng, p: LatLng): Projection`
  - `type Snap = { point: LatLng; idx: number; distM: number; bearing: number }`
  - `snapToPath(coords: LatLng[], p: LatLng, nearIdx?: number, windowSize?: number): Snap | null`
  - `smoothHeading(prev: number, next: number, alpha?: number): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/geo.test.ts`:

```ts
import { projectOnSegment, snapToPath, smoothHeading } from "../geo";

// A due-east segment at lat 51.5. 0.001 deg of latitude is ~111 m.
const segA = { lat: 51.5, lng: -0.1 };
const segB = { lat: 51.5, lng: -0.09 };

test("projectOnSegment drops a perpendicular onto the segment", () => {
  const r = projectOnSegment(segA, segB, { lat: 51.501, lng: -0.095 });
  expect(r.t).toBeCloseTo(0.5, 2);
  expect(r.point.lat).toBeCloseTo(51.5, 5);
  expect(r.point.lng).toBeCloseTo(-0.095, 5);
  expect(r.distM).toBeCloseTo(111, 0);
});

test("projectOnSegment clamps past either end", () => {
  const past = projectOnSegment(segA, segB, { lat: 51.5, lng: -0.08 });
  expect(past.t).toBe(1);
  expect(past.point.lng).toBeCloseTo(-0.09, 6);

  const before = projectOnSegment(segA, segB, { lat: 51.5, lng: -0.11 });
  expect(before.t).toBe(0);
  expect(before.point.lng).toBeCloseTo(-0.1, 6);
});

test("projectOnSegment handles a zero-length segment", () => {
  const r = projectOnSegment(segA, segA, { lat: 51.501, lng: -0.1 });
  expect(r.t).toBe(0);
  expect(r.distM).toBeCloseTo(111, 0);
});

// A loop: 11 vertices north up lng -0.1, then 11 back south up lng -0.1002
// (~14 m to the east). This is the shape of the seeded test-centre routes.
const OUT = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));
const BACK = Array.from({ length: 11 }, (_, i) => ({ lat: 51.51 - i * 0.001, lng: -0.1002 }));
const loop = [...OUT, ...BACK];

// Sitting on the outbound leg but physically nearer the return leg.
const driver = { lat: 51.5055, lng: -0.10015 };

test("snapToPath stays on the outbound leg inside the window", () => {
  const s = snapToPath(loop, driver, 5, 3)!;
  expect(s.idx).toBe(5);
  expect(s.distM).toBeCloseTo(10.4, 0);
  expect(s.bearing).toBeCloseTo(0, 0); // due north
  expect(s.point.lng).toBeCloseTo(-0.1, 5);
});

test("snapToPath without a window jumps onto the return leg", () => {
  // Proves the window is what prevents cross-snapping on loop routes.
  const s = snapToPath(loop, driver, 5, 100)!;
  expect(s.idx).toBeGreaterThan(10);
  expect(s.bearing).toBeCloseTo(180, 0);
});

test("snapToPath returns null for a path with no segments", () => {
  expect(snapToPath([], driver, 0)).toBeNull();
  expect(snapToPath([segA], driver, 0)).toBeNull();
});

test("smoothHeading eases toward the target", () => {
  expect(smoothHeading(0, 90, 0.15)).toBeCloseTo(13.5, 3);
  expect(smoothHeading(90, 90, 0.15)).toBeCloseTo(90, 3);
});

test("smoothHeading takes the short way across north", () => {
  // 355 -> 5 must move forward through 0, not backward through 180.
  expect(smoothHeading(355, 5, 0.5)).toBeCloseTo(0, 3);
  expect(smoothHeading(5, 355, 0.5)).toBeCloseTo(0, 3);
  expect(smoothHeading(350, 10, 0.25)).toBeCloseTo(355, 3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/geo.test.ts`
Expected: FAIL — `projectOnSegment is not a function` (or a TypeScript "has no exported member" error).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/geo.ts`:

```ts
export type Projection = { point: LatLng; t: number; distM: number };

// Perpendicular projection of `p` onto segment a->b. Works in local metres
// via an equirectangular approximation around `a` — over a single route
// segment (tens of metres) the error is far below GPS noise.
export function projectOnSegment(a: LatLng, b: LatLng, p: LatLng): Projection {
  const cosLat = Math.cos(toRad(a.lat));
  const x = (c: LatLng) => toRad(c.lng) * R * cosLat;
  const y = (c: LatLng) => toRad(c.lat) * R;

  const dx = x(b) - x(a);
  const dy = y(b) - y(a);
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x(p) - x(a)) * dx + (y(p) - y(a)) * dy) / len2));

  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return { point, t, distM: haversineM(point, p) };
}

export type Snap = { point: LatLng; idx: number; distM: number; bearing: number };

// Snap `p` onto the polyline, searching only the segments within `windowSize`
// vertices of `nearIdx`. The window matters: the seeded routes are loops, and
// an unbounded search snaps the driver onto the return leg wherever the
// outbound and inbound roads run close together.
export function snapToPath(coords: LatLng[], p: LatLng, nearIdx = 0, windowSize = 30): Snap | null {
  if (coords.length < 2) return null;
  const last = coords.length - 2;
  const centre = Math.min(Math.max(nearIdx, 0), last);
  const lo = Math.max(0, centre - windowSize);
  const hi = Math.min(last, centre + windowSize);

  let best: Snap | null = null;
  for (let i = lo; i <= hi; i++) {
    const pr = projectOnSegment(coords[i], coords[i + 1], p);
    if (!best || pr.distM < best.distM) {
      best = { point: pr.point, idx: i, distM: pr.distM, bearing: bearingDeg(coords[i], coords[i + 1]) };
    }
  }
  return best;
}

// Circular exponential moving average. Wraps correctly across 0/360 by
// easing along the shortest signed turn rather than the raw difference.
export function smoothHeading(prev: number, next: number, alpha = 0.15): number {
  const delta = turnAngleDeg(prev, next);
  return (((prev + delta * alpha) % 360) + 360) % 360;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/geo.test.ts`
Expected: PASS — all tests, old and new.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — nothing else in the repo imports these names yet, so no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geo.ts src/lib/__tests__/geo.test.ts
git commit -m "feat: road-snapping and heading-smoothing geometry helpers"
```

---

### Task 2: Zoom hysteresis

**Files:**
- Modify: `src/lib/navigation.ts:41-47` (replace `navZoom`)
- Test: `src/lib/__tests__/navigation.test.ts:62-67` (replace the existing `navZoom` test) plus new cases

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `NAV_ZOOM_NEAR = 18.6`, `NAV_ZOOM_MID = 18.0`, `NAV_ZOOM_FAR = 17.5`
  - `navZoom(distanceToManeuverM: number, currentZoom?: number): number` — **signature change**, gains a second parameter defaulting to `NAV_ZOOM_MID`.

Today `navZoom` flips hard at 150 m and 600 m, so a driver hovering near a threshold gets the camera zooming in and out repeatedly. Hysteresis means the level you are *currently* at changes where the next boundary sits.

- [ ] **Step 1: Replace the existing navZoom test with the new ones**

In `src/lib/__tests__/navigation.test.ts`, **delete** this existing test:

```ts
test("navZoom tightens near turns, widens on straights", () => {
  expect(navZoom(80)).toBeGreaterThan(navZoom(300));
  expect(navZoom(300)).toBeGreaterThan(navZoom(900));
  expect(navZoom(80)).toBe(19);
  expect(navZoom(900)).toBe(17.5);
});
```

and put these in its place (also add the three constants to the import on line 1):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/navigation.test.ts`
Expected: FAIL — `NAV_ZOOM_NEAR` is not exported, and `navZoom(80)` still returns `19`.

- [ ] **Step 3: Write the implementation**

In `src/lib/navigation.ts`, replace the whole `navZoom` block (currently lines 41–47) with:

```ts
// Camera zoom by distance to the next maneuver: tight near turns, wide on
// straights. Each band has a hysteresis gap — you enter the tight band at
// 130 m but do not leave it until 180 m — so a driver hovering near a
// boundary does not get the camera zooming in and out repeatedly.
export const NAV_ZOOM_NEAR = 18.6;
export const NAV_ZOOM_MID = 18.0;
export const NAV_ZOOM_FAR = 17.5;

const NEAR_ENTER_M = 130;
const NEAR_LEAVE_M = 180;
const FAR_ENTER_M = 650;
const FAR_LEAVE_M = 550;

export function navZoom(distanceToManeuverM: number, currentZoom: number = NAV_ZOOM_MID): number {
  const d = distanceToManeuverM;
  if (currentZoom === NAV_ZOOM_NEAR) {
    if (d <= NEAR_LEAVE_M) return NAV_ZOOM_NEAR;
    return d > FAR_ENTER_M ? NAV_ZOOM_FAR : NAV_ZOOM_MID;
  }
  if (currentZoom === NAV_ZOOM_FAR) {
    if (d >= FAR_LEAVE_M) return NAV_ZOOM_FAR;
    return d < NEAR_ENTER_M ? NAV_ZOOM_NEAR : NAV_ZOOM_MID;
  }
  if (d < NEAR_ENTER_M) return NAV_ZOOM_NEAR;
  if (d > FAR_ENTER_M) return NAV_ZOOM_FAR;
  return NAV_ZOOM_MID;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. `app/route/[id]/practice.tsx:198` still calls `navZoom(st.distanceToManeuverM)` with one argument — that compiles fine against the default parameter and is rewired in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/navigation.ts src/lib/__tests__/navigation.test.ts
git commit -m "feat: zoom hysteresis so the nav camera stops flip-flopping"
```

---

### Task 3: Map palette and road widths

**Files:**
- Create: `src/ui/mapStyle.ts`
- Test: `src/ui/__tests__/mapStyle.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `mapColors` — frozen object with keys `land`, `roadFill`, `roadCasing`, `motorwayFill`, `park`, `water`, `building`, `routeCore`, `routeCasing`
  - `roadWidths` — object with keys `motorway`, `primary`, `residential`, each `readonly [zoom, px][]`
  - `casingWidths` — same shape, the outer stroke widths
  - `lineWidthExpression(stops: readonly (readonly [number, number])[]): unknown[]` — builds a Mapbox `interpolate` expression

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/mapStyle.test.ts`:

```ts
import { casingWidths, lineWidthExpression, mapColors, roadWidths } from "../mapStyle";

test("palette entries are all six-digit uppercase hex", () => {
  for (const value of Object.values(mapColors)) {
    expect(value).toMatch(/^#[0-9A-F]{6}$/);
  }
});

test("the route stays the brightest green — park is well desaturated", () => {
  expect(mapColors.routeCore).toBe("#059669");
  expect(mapColors.routeCasing).toBe("#04684C");
  expect(mapColors.park).toBe("#DCE7CE");
});

test("road widths grow with zoom", () => {
  for (const stops of [...Object.values(roadWidths), ...Object.values(casingWidths)]) {
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      expect(stops[i][1]).toBeGreaterThan(stops[i - 1][1]);
    }
  }
});

test("bigger roads are wider than smaller roads at nav zoom", () => {
  const at19 = (s: readonly (readonly [number, number])[]) => s[s.length - 1][1];
  expect(at19(roadWidths.motorway)).toBeGreaterThan(at19(roadWidths.primary));
  expect(at19(roadWidths.primary)).toBeGreaterThan(at19(roadWidths.residential));
  expect(at19(roadWidths.residential)).toBeGreaterThan(15);
});

test("casings are wider than the fills they sit under", () => {
  const at19 = (s: readonly (readonly [number, number])[]) => s[s.length - 1][1];
  expect(at19(casingWidths.motorway)).toBeGreaterThan(at19(roadWidths.motorway));
  expect(at19(casingWidths.primary)).toBeGreaterThan(at19(roadWidths.primary));
  expect(at19(casingWidths.residential)).toBeGreaterThan(at19(roadWidths.residential));
});

test("lineWidthExpression flattens stops into a mapbox interpolate expression", () => {
  expect(lineWidthExpression([[15, 5], [19, 24]])).toEqual([
    "interpolate", ["linear"], ["zoom"], 15, 5, 19, 24,
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/mapStyle.test.ts`
Expected: FAIL — cannot find module `../mapStyle`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/mapStyle.ts`:

```ts
// Waze-style light palette for the navigation map. The layout copies Waze —
// wide white roads on warm off-white land — but the route and puck stay
// emerald, so the map still reads as this app.
//
// Park green is deliberately low-saturation: a vivid park sitting next to the
// emerald route line would compete with it. The route must always be the
// brightest green on screen.
export const mapColors = {
  land: "#EFEEE8",
  roadFill: "#FFFFFF",
  roadCasing: "#C3C8C1",
  motorwayFill: "#F7DFAE",
  park: "#DCE7CE",
  water: "#A9D3EA",
  building: "#E4E2DB",
  routeCore: "#059669",
  routeCasing: "#04684C",
} as const;

type Stops = readonly (readonly [number, number])[];

// [zoom, width] stops, roughly double the stock widths, so junction shape
// reads three blocks ahead at navigation zoom.
export const roadWidths = {
  motorway: [[15, 7], [17, 15], [19, 30]],
  primary: [[15, 5], [17, 12], [19, 24]],
  residential: [[15, 3], [17, 8], [19, 17]],
} as const satisfies Record<string, Stops>;

// Casings are drawn under the fills; the difference is the visible outline.
export const casingWidths = {
  motorway: [[15, 9], [17, 18], [19, 35]],
  primary: [[15, 7], [17, 15], [19, 29]],
  residential: [[15, 5], [17, 11], [19, 22]],
} as const satisfies Record<string, Stops>;

// Mapbox style expressions are flat arrays: ["interpolate", ["linear"],
// ["zoom"], z1, w1, z2, w2, ...].
export function lineWidthExpression(stops: Stops): unknown[] {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, w]) => [z, w])];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/ui/__tests__/mapStyle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/mapStyle.ts src/ui/__tests__/mapStyle.test.ts
git commit -m "feat: Waze-style map palette and road width expressions"
```

---

### Task 4: The puck

**Files:**
- Create: `src/ui/NavPuck.tsx`
- Test: `src/ui/__tests__/navPuck.test.tsx`

**Interfaces:**
- Consumes: `mapColors` from Task 3, `colors` from `src/ui/theme.ts`.
- Produces:
  - `PUCK_SIZE = 88` (px, the marker's square footprint)
  - `NavPuck({ rotation?: number })` — default export is named, not default: `export function NavPuck(...)`

Today the screen renders an emerald disc containing an Ionicons paper-plane rotated `-45deg`, which reads as a map pin and hides the road beneath it. Waze's puck is three stacked layers.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/navPuck.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { NavPuck, PUCK_SIZE } from "../NavPuck";

test("NavPuck renders the three layers", () => {
  render(<NavPuck />);
  expect(screen.getByTestId("puck-pad")).toBeTruthy();
  expect(screen.getByTestId("puck-disc")).toBeTruthy();
  expect(screen.getByTestId("puck-arrow")).toBeTruthy();
});

test("NavPuck points straight up by default", () => {
  render(<NavPuck />);
  expect(screen.getByTestId("nav-puck").props.style.transform).toEqual([{ rotate: "0deg" }]);
});

test("NavPuck rotates when the camera is not following", () => {
  render(<NavPuck rotation={137} />);
  expect(screen.getByTestId("nav-puck").props.style.transform).toEqual([{ rotate: "137deg" }]);
});

test("the arrow is emerald, not Waze blue", () => {
  render(<NavPuck />);
  expect(screen.getByTestId("puck-arrow").props.fill).toBe("#059669");
});

test("PUCK_SIZE leaves room for the presence pad", () => {
  expect(PUCK_SIZE).toBeGreaterThanOrEqual(80);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/navPuck.test.tsx`
Expected: FAIL — cannot find module `../NavPuck`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/NavPuck.tsx`:

```tsx
import { View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { mapColors } from "./mapStyle";

export const PUCK_SIZE = 88;

type Props = {
  /**
   * Degrees to rotate the arrow. While the camera is following, screen-up
   * already is the driver's heading, so this stays 0; it is only used once
   * the driver has panned away from follow mode.
   */
  rotation?: number;
};

// Three stacked layers, the way Waze builds it: a soft grey pad that gives
// the vehicle a footprint on the road, a white disc, and the arrow. The pad
// is translucent so the road underneath still shows through.
export function NavPuck({ rotation = 0 }: Props) {
  return (
    <View testID="nav-puck" style={{ width: PUCK_SIZE, height: PUCK_SIZE, transform: [{ rotate: `${rotation}deg` }] }}>
      <Svg width={PUCK_SIZE} height={PUCK_SIZE} viewBox="0 0 88 88">
        <Ellipse testID="puck-pad" cx={44} cy={46} rx={34} ry={27} fill="#0F172A" opacity={0.1} />
        <Ellipse cx={44} cy={46} rx={25} ry={20} fill="#0F172A" opacity={0.08} />
        <Circle testID="puck-disc" cx={44} cy={44} r={20} fill="#FFFFFF" />
        <Path
          testID="puck-arrow"
          d="M44 29 L56 58 L44 51 L32 58 Z"
          fill={mapColors.routeCore}
          stroke={mapColors.routeCasing}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/ui/__tests__/navPuck.test.tsx`
Expected: PASS. If `react-native-svg` fails to transform, confirm it is listed in the `transformIgnorePatterns` allowlist in `package.json` — it already is.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/NavPuck.tsx src/ui/__tests__/navPuck.test.tsx
git commit -m "feat: three-layer Waze-style navigation puck"
```

---

### Task 5: Colour the map and widen the roads

**Files:**
- Modify: `app/route/[id]/practice.tsx` — line 19 (`NAV_STYLE`), the import block, the `MapView` children, and the route `LineLayer` colours at lines 328–345

**Interfaces:**
- Consumes: `mapColors`, `roadWidths`, `casingWidths`, `lineWidthExpression` from Task 3.
- Produces: nothing consumed by later tasks. Task 6 edits the same file but different regions.

This task is visual and verified on-device; there is no unit test for it.

- [ ] **Step 1: Switch the base style**

In `app/route/[id]/practice.tsx`, change line 19:

```ts
const NAV_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
```

`navigation-day-v1` already ships wider roads and navigation-oriented colouring, so it is a much shorter distance to the target than `light-v11` was.

- [ ] **Step 2: Import the palette**

Add below the existing `import { colors } from "@/ui/theme";`:

```ts
import { casingWidths, lineWidthExpression, mapColors, roadWidths } from "@/ui/mapStyle";
```

- [ ] **Step 3: Confirm the style's layer IDs before writing overrides**

`@rnmapbox/maps` layer components accept an `existing` prop that restyles a layer already present in the loaded style — but only if the `id` matches exactly, and a wrong id silently does nothing.

Open `navigation-day-v1` in Mapbox Studio (or the style JSON at `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1?access_token=<token>`, using the token in `.env`) and write down the real layer ids for: land/background, water, park landuse, building, and the road fill + casing layers for motorway, primary/secondary, and residential.

The ids below are the expected ones. **Replace any that do not match.**

- [ ] **Step 4: Add the layer overrides**

Inside `<MapView>`, immediately after the opening `<Camera ... />` element, add:

```tsx
{/* Waze-style base: wide white roads on warm off-white land, with parks
    and water carrying the only other colour. Applied as overrides on the
    loaded style's own layers rather than a fork of the whole style. */}
<BackgroundLayer id="background" existing style={{ backgroundColor: mapColors.land }} />
<FillLayer id="landuse" existing style={{ fillColor: mapColors.park }} />
<FillLayer id="water" existing style={{ fillColor: mapColors.water }} />
<FillLayer id="building" existing style={{ fillColor: mapColors.building }} />

<LineLayer id="road-motorway-trunk-case" existing style={{ lineColor: mapColors.roadCasing, lineWidth: lineWidthExpression(casingWidths.motorway) }} />
<LineLayer id="road-motorway-trunk" existing style={{ lineColor: mapColors.motorwayFill, lineWidth: lineWidthExpression(roadWidths.motorway) }} />
<LineLayer id="road-primary-case" existing style={{ lineColor: mapColors.roadCasing, lineWidth: lineWidthExpression(casingWidths.primary) }} />
<LineLayer id="road-primary" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidthExpression(roadWidths.primary) }} />
<LineLayer id="road-secondary-tertiary-case" existing style={{ lineColor: mapColors.roadCasing, lineWidth: lineWidthExpression(casingWidths.primary) }} />
<LineLayer id="road-secondary-tertiary" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidthExpression(roadWidths.primary) }} />
<LineLayer id="road-street-case" existing style={{ lineColor: mapColors.roadCasing, lineWidth: lineWidthExpression(casingWidths.residential) }} />
<LineLayer id="road-street" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidthExpression(roadWidths.residential) }} />
```

Extend the Mapbox import on line 5 to include the two new layer types:

```ts
import Mapbox, { BackgroundLayer, Camera, FillLayer, LineLayer, MapView, MarkerView, PointAnnotation, ShapeSource, UserTrackingMode } from "@rnmapbox/maps";
```

- [ ] **Step 5: Move the route line onto the shared palette**

Replace the hard-coded `"#047857"` casing colour in all four route `LineLayer` styles (lines 328, 336, and the `aheadCasing` fallback) with `mapColors.routeCasing`, and `colors.accent` with `mapColors.routeCore`. Also bump the widths so the route stays visibly on top of the now-wider roads.

Change lines 306–307 from:

```ts
const aheadCore = isApproach ? "#94A3B8" : colors.accent;
const aheadCasing = isApproach ? "#64748B" : "#047857";
```

to:

```ts
const aheadCore = isApproach ? "#94A3B8" : mapColors.routeCore;
const aheadCasing = isApproach ? "#64748B" : mapColors.routeCasing;
```

Then update the six layer widths: `routeCasing` 11 → 15, `routeCore` 8 → 10, `trailCasing` 11 → 15, `trailCore` 7.5 → 10, `aheadCasing` 12 → 16, `aheadCore` 8.5 → 11. Set every `lineColor: "#047857"` to `mapColors.routeCasing` and every `lineColor: colors.accent` to `mapColors.routeCore`.

- [ ] **Step 6: Verify on device**

Run: `npm start`, open the dev build, go to the Hemel Hempstead (TEST) route, and tap into Practice.

Check:
- Land is warm off-white, not white. Parks are sage. Water is pale blue.
- Roads are visibly fat with a grey outline; junction shape is readable several blocks ahead.
- The emerald route still stands out clearly above the roads.

If any layer override had no effect, its id was wrong — go back to Step 3. If several ids cannot be made to work, fall back to the plan in the spec: author the palette as a custom style in Mapbox Studio and point `NAV_STYLE` at that URL, deleting the override block.

- [ ] **Step 7: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add app/route/\[id\]/practice.tsx
git commit -m "feat: Waze-style coloured base map with wide roads"
```

---

### Task 6: Snapped position, smoothed heading, manual camera

**Files:**
- Modify: `app/route/[id]/practice.tsx` — imports, constants block near line 19, `onPosition` (169–222), `recenter` (162–167), the `Camera` element (316–323), the `MapView` element (311–315), and the puck `MarkerView` (364–370)

**Interfaces:**
- Consumes: `snapToPath`, `smoothHeading`, `turnAngleDeg` from Task 1 and existing `geo.ts`; `NAV_ZOOM_MID`, `navZoom` from Task 2; `NavPuck`, `PUCK_SIZE` from Task 4.
- Produces: nothing.

This is the structural change from the spec. Today the camera runs `followUserLocation` + `UserTrackingMode.FollowWithHeading`, which means the **native** layer picks both the centre (raw GPS) and the heading (raw compass). Neither is reachable from JS, so snapping and smoothing would have no visible effect at all. The camera therefore moves to manual control.

This task is verified on-device; the logic it depends on is already unit-tested in Tasks 1 and 2.

- [ ] **Step 1: Add the constants**

Below `const ARRIVE_M = 30;` near line 22:

```ts
const SNAP_MAX_M = 40;          // beyond this we assume you've left the route
const SNAP_WINDOW = 30;         // vertices searched either side of the current index
const ROAD_BEARING_MIN_MPH = 3; // below this a vehicle has no meaningful course
const HEADING_ALPHA = 0.15;
const HEADING_DEADBAND_DEG = 3;
const CAM_TICK_MS = 250;        // at most 4 camera updates a second
const CAM_ANIM_MS = 300;        // slightly longer than the tick, so moves blend
const PUCK_SCREEN_FRACTION = 0.62; // how far down the screen the driver sits
```

- [ ] **Step 2: Update the imports**

```ts
import { advance, ANNOUNCE_M, formatDistance, navZoom, NAV_ZOOM_FAR, NAV_ZOOM_MID, remainingM, trailIndex } from "@/lib/navigation";
import { bearingDeg, haversineM, LatLng, mpsToMph, smoothHeading, snapToPath, turnAngleDeg } from "@/lib/geo";
import { NavPuck, PUCK_SIZE } from "@/ui/NavPuck";
```

- [ ] **Step 3: Add the new refs and state**

Beside the existing refs (around line 82):

```ts
const smoothHeadingRef = useRef(0);
const zoomRef = useRef(NAV_ZOOM_MID);
const lastCamRef = useRef(0);
const mapHeightRef = useRef(0);
const followingRef = useRef(true);
```

`followingRef` mirrors the existing `following` state so `onPosition` — which is a `useCallback` with a stable identity — can read it without being re-created on every toggle. Keep them in sync:

```ts
useEffect(() => { followingRef.current = following; }, [following]);
```

- [ ] **Step 4: Add the camera driver**

Above `onPosition`:

```ts
// Drive the camera by hand. followUserLocation would centre on the raw GPS
// fix and rotate to the raw compass, both of which are exactly what we are
// trying to filter out, and neither is reachable from JS.
const pushCamera = useCallback((centre: LatLng, heading: number, zoom: number, force = false) => {
  if (!followingRef.current) return;
  const now = Date.now();
  if (!force && now - lastCamRef.current < CAM_TICK_MS) return;
  lastCamRef.current = now;

  // Padding shifts the camera centre down the screen so more road is visible
  // ahead: centreFraction = 0.5 + paddingTop / (2 * height).
  const paddingTop = mapHeightRef.current * (PUCK_SCREEN_FRACTION - 0.5) * 2;

  cameraRef.current?.setCamera({
    centerCoordinate: [centre.lng, centre.lat],
    heading,
    zoomLevel: zoom,
    pitch: NAV_PITCH,
    padding: { paddingTop, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    animationDuration: force ? 500 : CAM_ANIM_MS,
    animationMode: "easeTo",
  });
}, []);
```

- [ ] **Step 5: Snap and smooth inside onPosition**

In `onPosition`, replace the opening three lines:

```ts
const p = { lat: c.latitude, lng: c.longitude };
setPos(p);
setSpeedMph(Math.round(mpsToMph(Math.max(0, c.speed ?? 0))));
```

with:

```ts
const raw = { lat: c.latitude, lng: c.longitude };
const mph = Math.round(mpsToMph(Math.max(0, c.speed ?? 0)));
setSpeedMph(mph);

// Snap onto the active polyline. Raw GPS wanders 5-15 m, which drifts the
// puck through gardens; the route is already in memory, so no API call.
const ph0 = phaseRef.current;
const activeCoords = ph0 === "route" ? routeLLRef.current : approachRef.current?.coords ?? [];
const snap = snapToPath(activeCoords, raw, trailRef.current, SNAP_WINDOW);
const onRoute = !!snap && snap.distM <= SNAP_MAX_M;
const p = onRoute ? snap!.point : raw;
setPos(p);

// The snap gives us the road bearing for free — pointing down the road
// removes most of the wobble a hand-held compass introduces.
const target = onRoute && mph >= ROAD_BEARING_MIN_MPH ? snap!.bearing : headingRef.current;
// Deadband: sub-3-degree wiggle never reaches the camera at all.
if (Math.abs(turnAngleDeg(smoothHeadingRef.current, target)) >= HEADING_DEADBAND_DEG) {
  smoothHeadingRef.current = smoothHeading(smoothHeadingRef.current, target, HEADING_ALPHA);
}
```

Everything downstream in `onPosition` keeps using `p` exactly as before, so voice prompts, `advance`, and `remainingM` continue to work — but note they now run on the snapped point. That is intended: it makes distance-to-manoeuvre steadier too. The **rate** is unchanged; only the camera is throttled.

- [ ] **Step 6: Use the snap index for the trail, and drive the camera**

The `followZoom` state existed only to feed the `Camera` element's `followZoomLevel` prop, which is going away. Zoom now lives in `zoomRef` instead, so every `setFollowZoom` call is deleted rather than kept.

Replace:

```ts
const ti = trailIndex(coords, p, trailRef.current);
trailRef.current = ti;
setTrailIdx(ti);
setFollowZoom(navZoom(st.distanceToManeuverM));
```

with:

```ts
const ti = onRoute ? Math.max(trailRef.current, snap!.idx) : trailIndex(coords, p, trailRef.current);
trailRef.current = ti;
setTrailIdx(ti);

zoomRef.current = navZoom(st.distanceToManeuverM, zoomRef.current);
pushCamera(p, smoothHeadingRef.current, zoomRef.current);
```

In the fallback branch (the one that runs when `ph === "approach" && fallbackRef.current`), replace its `setFollowZoom(17.5)` line with:

```ts
zoomRef.current = NAV_ZOOM_FAR;
pushCamera(p, smoothHeadingRef.current, NAV_ZOOM_FAR);
```

and add `NAV_ZOOM_FAR` to the `@/lib/navigation` import from Step 2.

Then delete the `const [followZoom, setFollowZoom] = useState(18);` declaration (line 69) — with the `Camera` props gone in Step 7, nothing reads it. Add `pushCamera` to the `useCallback` dependency array of `onPosition`.

- [ ] **Step 7: Rewire follow, recenter and the Camera element**

`onUserTrackingModeChange` no longer fires, because tracking mode is off. Detect panning from the map instead. On `<MapView>`, add:

```tsx
onLayout={(e) => { mapHeightRef.current = e.nativeEvent.layout.height; }}
onTouchStart={() => { if (phaseRef.current !== "preview") setFollowing(false); }}
```

Replace `recenter` with:

```ts
// Re-lock the camera onto the driver after they've panned the map.
const recenter = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  followingRef.current = true;
  setFollowing(true);
  if (pos) pushCamera(pos, smoothHeadingRef.current, zoomRef.current, true);
};
```

Replace the whole `<Camera>` element with:

```tsx
<Camera ref={cameraRef} />
```

The `preview` phase still calls `cameraRef.current?.fitBounds(...)` in `fitPreview`, which is unaffected.

Delete the now-unused `UserTrackingMode` from the Mapbox import on line 5.

- [ ] **Step 8: Swap in the new puck**

Replace the puck `MarkerView` body:

```tsx
{(phase === "approach" || phase === "route") && pos && (
  <MarkerView id="puck" coordinate={toPos(pos)} anchor={{ x: 0.5, y: 0.5 }}>
    <NavPuck rotation={following ? 0 : smoothHeadingRef.current} />
  </MarkerView>
)}
```

`PUCK_SIZE` is imported so the marker reserves the right footprint; if the marker clips, set `style={{ width: PUCK_SIZE, height: PUCK_SIZE }}` on the `MarkerView`.

- [ ] **Step 9: Verify on device**

Run: `npm start`, open the Hemel Hempstead (TEST) route, tap Practice, then Start.

Check:
- The puck sits low on the screen with road ahead visible, not dead centre.
- The puck is the three-layer design and points up while following.
- Standing still and rotating the phone no longer swings the map wildly.
- Driving: the puck stays on the road rather than drifting into gardens, and the map does not zoom in and out repeatedly on approach to a turn.
- Panning the map stops the follow; the recenter button restores it.
- Voice prompts still fire at the same points as before.

- [ ] **Step 10: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add app/route/\[id\]/practice.tsx
git commit -m "feat: snap the puck to the road and steady the nav camera"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| 1 — palette, road widths, `navigation-day-v1`, `existing` overrides, Studio fallback | 3, 5 |
| 2 — three-layer puck, SVG chevron, rotation rule, 62% screen position | 4, 6 |
| 2 — manual camera control, recenter rewiring, pan detection, animation blending | 6 |
| 3 — `projectOnSegment`, `snapToPath`, `smoothHeading`, ±30 window, 40 m cutoff, road bearing above 3 mph | 1, 6 |
| 4 — heading EMA, deadband, camera throttle, zoom levels and hysteresis, GPS rate unchanged | 2, 6 |
| 6 — wraparound test, loop-route window test, hysteresis oscillation test, device verification | 1, 2, 5, 6 |
| 7 — out of scope: rerouting, banner/speedometer/bottom bar, traffic, dark map | not implemented, by design |
