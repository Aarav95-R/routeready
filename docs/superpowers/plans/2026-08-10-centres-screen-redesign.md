# Centres Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `app/(tabs)/index.tsx` as a Mapbox map of nearby test centres with a bottom sheet of cards bound to it by scroll, each centre carrying a generated colour and monogram.

**Architecture:** All list-shaping and identity rules live in pure modules under `src/lib` and are tested there; `src/ui` holds three presentational components that take everything as props; the screen wires data to them and owns nothing but state. This mirrors how `lib/routeSummary.ts` serves `ui/RouteCard.tsx` today.

**Tech Stack:** Expo 54, React Native 0.81, expo-router, NativeWind 4, `@rnmapbox/maps` 10.3, `@gorhom/bottom-sheet` 5, `react-native-reanimated` 4, `react-native-svg` 15, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-10-centres-screen-redesign.md`

## Global Constraints

- **No new dependencies.** Every library named above is already in `package.json`.
- **Emerald is reserved.** `#059669` (`colors.accent`) means *you* or *go* only — the location dot, the distance rings, buttons. It is never an identity colour on this screen.
- **The screen may not state what the app does not know.** No drive times, no "within N miles" claims. Distance is straight-line `haversineM`, rendered `1.2 mi away`.
- **Near set:** centres within 30 miles of the driver, capped at 12, floored at 8, ordered by distance.
- **Row height is exactly 88** and is exported as a constant — the scroll↔camera binding divides by it.
- **Contrast gate:** every identity hue clears 4.5:1 against white and against its own tint. Task 1's test enforces this.
- **Test command:** `npm test`. A single file: `npx jest src/lib/__tests__/centreIdentity.test.ts`.
- **Imports use the `@/` alias** for anything under `src/` (`moduleNameMapper` maps `^@/(.*)$` → `<rootDir>/src/$1`). Tests inside `__tests__` may use relative `../` for the module under test, as the existing tests do.
- **Commit style:** lowercase `type: summary` subject, no trailing period, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` as the last line.

---

### Task 1: Centre identity — palette, contrast gate, assignment

**Files:**
- Create: `src/lib/centreIdentity.ts`
- Test: `src/lib/__tests__/centreIdentity.test.ts`

**Interfaces:**
- Consumes: `Centre` from `@/types/db`.
- Produces:
  - `type CentreIdentity = { hue: string; tint: string; initials: string; seed: number }`
  - `const IDENTITY_PALETTE: readonly { hue: string; tint: string }[]` — length 12
  - `function initials(name: string): string`
  - `function assignIdentities(centres: Centre[]): Map<string, CentreIdentity>` — keyed by `centre.id`; the nth centre in the array given takes the nth palette entry, wrapping past 12; `seed` is that index + 1.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/centreIdentity.test.ts`:

```ts
import type { Centre } from "@/types/db";
import { assignIdentities, IDENTITY_PALETTE, initials } from "../centreIdentity";

// WCAG 2.1 relative luminance and contrast ratio. Test-only: nothing in the app
// computes contrast at runtime, but the palette is not allowed to drift below
// the gate without this suite going red.
const luminance = (hex: string) => {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const centre = (id: string, name = id): Centre => ({
  id, name, address: "", lat: 51.6, lng: -0.24,
  pass_rate: 40, pass_rate_history: [], test_types: ["manual"], region: "Greater London",
});

test("every hue is legible as white monogram on the pin", () => {
  for (const { hue } of IDENTITY_PALETTE) {
    expect(contrast(hue, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  }
});

test("every hue is legible on its own tint", () => {
  for (const { hue, tint } of IDENTITY_PALETTE) {
    expect(contrast(hue, tint)).toBeGreaterThanOrEqual(4.5);
  }
});

test("a full near set of twelve gets twelve different hues", () => {
  const centres = Array.from({ length: 12 }, (_, i) => centre(`c${i}`));
  const hues = [...assignIdentities(centres).values()].map((v) => v.hue);
  expect(new Set(hues).size).toBe(12);
});

test("assignment follows position in the list given, and wraps past twelve", () => {
  const centres = Array.from({ length: 14 }, (_, i) => centre(`c${i}`));
  const ids = assignIdentities(centres);
  expect(ids.get("c0")!.hue).toBe(IDENTITY_PALETTE[0].hue);
  expect(ids.get("c11")!.hue).toBe(IDENTITY_PALETTE[11].hue);
  expect(ids.get("c12")!.hue).toBe(IDENTITY_PALETTE[0].hue);
  expect(ids.get("c0")!.seed).toBe(1);
});

test("initials take one letter per word and ignore a parenthesised suffix", () => {
  expect(initials("Mill Hill (London)")).toBe("MH");
  expect(initials("Barnet")).toBe("B");
  expect(initials("Bishop's Stortford")).toBe("BS");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/centreIdentity.test.ts`
Expected: FAIL — `Cannot find module '../centreIdentity'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/centreIdentity.ts`:

```ts
import type { Centre } from "@/types/db";

export type CentreIdentity = {
  hue: string;
  tint: string;
  /** Up to two letters, drawn on the pin and the emblem tile. */
  initials: string;
  /** Drives the generated arcs on the emblem. 1-based position in the list. */
  seed: number;
};

// Emerald is deliberately absent: it means "you" or "go" everywhere in this app
// and an identity colour that matched the buttons would leave the screen
// without an action colour.
//
// The order is not the colour wheel's. Adjacent entries go to adjacent centres
// in the list, so neighbouring hues are kept apart on purpose — teal follows
// rose rather than pink following rose.
//
// Every value here is gated at 4.5:1 against white (the monogram) and against
// its own tint (the emblem lettering) by centreIdentity.test.ts. Four of them
// are a shade darker than the obvious choice for exactly that reason.
export const IDENTITY_PALETTE = [
  { hue: "#BE123C", tint: "#FFF1F2" }, // rose
  { hue: "#0F766E", tint: "#F0FDFA" }, // teal
  { hue: "#A16207", tint: "#FFFBEB" }, // amber
  { hue: "#4F46E5", tint: "#EEF2FF" }, // indigo
  { hue: "#4D7C0F", tint: "#F7FEE7" }, // lime
  { hue: "#BE185D", tint: "#FDF2F8" }, // pink
  { hue: "#0369A1", tint: "#F0F9FF" }, // sky
  { hue: "#C2410C", tint: "#FFF7ED" }, // orange
  { hue: "#7C3AED", tint: "#F5F3FF" }, // violet
  { hue: "#0E7490", tint: "#ECFEFF" }, // cyan
  { hue: "#A21CAF", tint: "#FDF4FF" }, // fuchsia
  { hue: "#475569", tint: "#F1F5F9" }, // slate
] as const;

/** "Mill Hill (London)" -> "MH". Seeded names carry a parenthesised town. */
export function initials(name: string): string {
  return name
    .split(/[\s(]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Colour by position, not by hash.
 *
 * A hash of `centre.id` spread over twelve hues collides constantly across the
 * forty seeded centres, and two identically coloured pins side by side is the
 * one failure this design cannot absorb. Position guarantees the near set —
 * capped at twelve, against a palette of twelve — never repeats on the map.
 *
 * Callers pass the distance-sorted list, never the displayed one, so
 * re-sorting by pass rate repaints nothing.
 */
export function assignIdentities(centres: Centre[]): Map<string, CentreIdentity> {
  const out = new Map<string, CentreIdentity>();
  centres.forEach((centre, i) => {
    const { hue, tint } = IDENTITY_PALETTE[i % IDENTITY_PALETTE.length];
    out.set(centre.id, { hue, tint, initials: initials(centre.name), seed: i + 1 });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/centreIdentity.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/centreIdentity.ts src/lib/__tests__/centreIdentity.test.ts
git commit -m "feat: give every centre a colour and a monogram

Colour is assigned by position in the distance-sorted list rather than
hashed from the id: twelve hues over forty centres collide constantly by
hash, and two identical pins side by side is the failure this design
cannot absorb.

The palette is gated by test at 4.5:1 against white and against its own
tint, which is why four of the twelve are a shade darker than the
obvious choice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `ringPolygon` — distance rings as real geography

**Files:**
- Modify: `src/types/db.ts` (add `GeoPolygon` beside the existing `GeoLineString`)
- Modify: `src/lib/geo.ts` (append `ringPolygon`)
- Test: `src/lib/__tests__/geo.test.ts` (append)

**Interfaces:**
- Consumes: `LatLng` and `haversineM` from `@/lib/geo`.
- Produces:
  - `type GeoPolygon = { type: "Polygon"; coordinates: [number, number][][] }` in `@/types/db`
  - `function ringPolygon(centre: LatLng, radiusM: number, segments?: number): GeoPolygon` — default `segments = 64`, coordinates are `[lng, lat]`, the first vertex repeated as the last so the ring closes.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/geo.test.ts`:

```ts
test("ringPolygon puts every vertex at the requested radius", () => {
  const centre = { lat: 51.6087, lng: -0.2412 };
  const radius = 8 * 1609.34;
  const ring = ringPolygon(centre, radius);
  const points = ring.coordinates[0];

  for (const [lng, lat] of points) {
    const d = haversineM(centre, { lat, lng });
    expect(Math.abs(d - radius) / radius).toBeLessThan(0.005);
  }
});

test("ringPolygon closes and honours its segment count", () => {
  const ring = ringPolygon({ lat: 51.6, lng: -0.24 }, 5000, 16);
  const points = ring.coordinates[0];
  expect(points).toHaveLength(17);            // 16 segments + the repeated first
  expect(points[16]).toEqual(points[0]);
  expect(ring.type).toBe("Polygon");
});
```

Add `ringPolygon` to the import at the top of that file — the existing first line becomes:

```ts
import { bandSpeedMph, bearingDeg, cumulativeM, haversineM, isInZone, mpsToMph, nearestVertex, ringPolygon, turnAngleDeg, projectOnSegment, snapToPath, smoothHeading } from "../geo";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/geo.test.ts`
Expected: FAIL — `ringPolygon is not a function`

- [ ] **Step 3: Write the implementation**

Add to `src/types/db.ts`, directly under the `GeoLineString` line:

```ts
export type GeoPolygon = { type: "Polygon"; coordinates: [number, number][][] }; // [lng, lat]
```

Append to `src/lib/geo.ts`:

```ts
/**
 * A circle of `radiusM` around `centre`, as a GeoJSON polygon.
 *
 * The map draws distance rings from this rather than from a `circle-radius`
 * paint property, because a pixel radius does not scale with zoom: a ring set
 * to "8 miles" in pixels is only 8 miles at one zoom level and a lie at every
 * other. A polygon is in world coordinates, so it stays 8 miles wide however
 * far the camera pulls back.
 */
export function ringPolygon(centre: LatLng, radiusM: number, segments = 64): GeoPolygon {
  const latRad = toRad(centre.lat);
  const dLat = toDeg(radiusM / R);
  const dLng = toDeg(radiusM / (R * Math.cos(latRad)));
  const points: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    points.push([centre.lng + dLng * Math.cos(theta), centre.lat + dLat * Math.sin(theta)]);
  }
  points.push(points[0]);
  return { type: "Polygon", coordinates: [points] };
}
```

Add the type import at the top of `src/lib/geo.ts`:

```ts
import type { GeoPolygon } from "@/types/db";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/geo.test.ts`
Expected: PASS, all existing tests plus the 2 new ones

- [ ] **Step 5: Commit**

```bash
git add src/types/db.ts src/lib/geo.ts src/lib/__tests__/geo.test.ts
git commit -m "feat: add ringPolygon for map distance rings

A circle-radius paint property is measured in pixels, so a ring set to
eight miles is eight miles at exactly one zoom and wrong at every other.
This returns world coordinates instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `centresView` — near set, sort, filter, sections

**Files:**
- Create: `src/lib/centresView.ts`
- Test: `src/lib/__tests__/centresView.test.ts`

**Interfaces:**
- Consumes: `Centre` from `@/types/db`, `LatLng` and `haversineM` from `@/lib/geo`.
- Produces:
  - `type CentreSort = "nearest" | "pass"`
  - `type CentreFilter = "all" | "manual" | "auto"`
  - `type ViewCentre = { centre: Centre; distanceM: number | null; pinned: boolean }`
  - `type CentreSection = { title: string; data: ViewCentre[] }`
  - `const NEAR_RADIUS_M: number`, `const NEAR_MAX: number`, `const NEAR_MIN: number`
  - `function nearSet(centres: Centre[], me: LatLng | null): Centre[]`
  - `function buildSections(input: { centres: Centre[]; me: LatLng | null; sort: CentreSort; filter: CentreFilter; query: string }): CentreSection[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/centresView.test.ts`:

```ts
import type { Centre } from "@/types/db";
import { buildSections, nearSet, NEAR_MAX, NEAR_MIN } from "../centresView";

const MILL_HILL = { lat: 51.6087, lng: -0.2412 };

// Roughly one mile of latitude per 0.0145 degrees, so `n` below is ~n miles out.
const at = (id: string, milesNorth: number, over: Partial<Centre> = {}): Centre => ({
  id, name: id, address: "", lat: MILL_HILL.lat + milesNorth * 0.0145, lng: MILL_HILL.lng,
  pass_rate: 40, pass_rate_history: [], test_types: ["manual", "auto"], region: "Greater London",
  ...over,
});

test("the near set takes what is within thirty miles", () => {
  const centres = [at("a", 1), at("b", 5), at("c", 40), at("d", 60)];
  expect(nearSet(centres, MILL_HILL).map((c) => c.id)).toEqual(["a", "b"]);
});

test("the near set never exceeds the cap", () => {
  const centres = Array.from({ length: 20 }, (_, i) => at(`c${i}`, i + 1));
  expect(nearSet(centres, MILL_HILL)).toHaveLength(NEAR_MAX);
});

test("the near set falls back to the nearest few when nothing is within range", () => {
  // A rural driver: an empty map is worse than a wide one.
  const centres = Array.from({ length: 12 }, (_, i) => at(`c${i}`, 40 + i));
  const near = nearSet(centres, MILL_HILL);
  expect(near).toHaveLength(NEAR_MIN);
  expect(near[0].id).toBe("c0");
});

test("there is no near set without a fix", () => {
  expect(nearSet([at("a", 1)], null)).toEqual([]);
});

test("sorting by pass rate survives a type filter", () => {
  const centres = [
    at("low", 1, { pass_rate: 30 }),
    at("high", 2, { pass_rate: 60 }),
    at("autoOnly", 3, { pass_rate: 90, test_types: ["auto"] }),
  ];
  const sections = buildSections({
    centres, me: MILL_HILL, sort: "pass", filter: "manual", query: "",
  });
  const ids = sections.flatMap((s) => s.data.map((v) => v.centre.id));
  expect(ids).toEqual(["high", "low"]);
});

test("centres beyond the near set are listed apart and carry no pin", () => {
  const centres = [at("near", 2), at("far", 80, { region: "Tyne and Wear" })];
  const sections = buildSections({
    centres, me: MILL_HILL, sort: "nearest", filter: "all", query: "",
  });
  expect(sections.map((s) => s.title)).toEqual(["Near you", "Further afield"]);
  expect(sections[0].data[0].pinned).toBe(true);
  expect(sections[1].data[0].pinned).toBe(false);
});

test("without a fix everything is one section sorted by pass rate", () => {
  const centres = [at("a", 1, { pass_rate: 30 }), at("b", 2, { pass_rate: 50 })];
  const sections = buildSections({
    centres, me: null, sort: "pass", filter: "all", query: "",
  });
  expect(sections).toHaveLength(1);
  expect(sections[0].title).toBe("All centres");
  expect(sections[0].data.map((v) => v.centre.id)).toEqual(["b", "a"]);
  expect(sections[0].data[0].distanceM).toBeNull();
});

test("search matches name and region, and an empty result is still a valid view", () => {
  const centres = [at("Mill Hill", 1), at("Newcastle", 80, { region: "Tyne and Wear" })];
  const byRegion = buildSections({
    centres, me: MILL_HILL, sort: "nearest", filter: "all", query: "tyne",
  });
  expect(byRegion.flatMap((s) => s.data.map((v) => v.centre.id))).toEqual(["Newcastle"]);

  const none = buildSections({
    centres, me: MILL_HILL, sort: "nearest", filter: "all", query: "brixton",
  });
  expect(none.flatMap((s) => s.data)).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/centresView.test.ts`
Expected: FAIL — `Cannot find module '../centresView'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/centresView.ts`:

```ts
import { haversineM, LatLng } from "@/lib/geo";
import type { Centre } from "@/types/db";

export type CentreSort = "nearest" | "pass";
export type CentreFilter = "all" | "manual" | "auto";

export type ViewCentre = {
  centre: Centre;
  /** Straight line, metres. Null until there is a fix — never a drive time. */
  distanceM: number | null;
  /** In the near set, so it has a pin on the map and moves the camera. */
  pinned: boolean;
};

export type CentreSection = { title: string; data: ViewCentre[] };

export const NEAR_RADIUS_M = 30 * 1609.34;
export const NEAR_MAX = 12;   // the identity palette is twelve, so a full near set never repeats a colour
export const NEAR_MIN = 8;    // a rural driver with nothing in range still gets a map worth looking at

const byDistance = (me: LatLng) => (a: Centre, b: Centre) =>
  haversineM(me, { lat: a.lat, lng: a.lng }) - haversineM(me, { lat: b.lat, lng: b.lng });

/**
 * The centres the map plots. Forty centres across fifteen regions cannot all be
 * pins: at a zoom that fits Newcastle and Kent the distance rings mean nothing
 * and every London centre is one dot.
 */
export function nearSet(centres: Centre[], me: LatLng | null): Centre[] {
  if (!me) return [];
  const sorted = [...centres].sort(byDistance(me));
  const within = sorted.filter((c) => haversineM(me, { lat: c.lat, lng: c.lng }) <= NEAR_RADIUS_M);
  const chosen = within.length >= NEAR_MIN ? within : sorted.slice(0, NEAR_MIN);
  return chosen.slice(0, NEAR_MAX);
}

/**
 * Everything the sheet renders, in the order it renders it.
 *
 * Sort and filter are separate axes on purpose. The screen this replaces put
 * "Nearest", "Pass rate", "Manual" and "Auto" in one segmented control, so
 * choosing a car type silently threw away the sort.
 */
export function buildSections(input: {
  centres: Centre[];
  me: LatLng | null;
  sort: CentreSort;
  filter: CentreFilter;
  query: string;
}): CentreSection[] {
  const { centres, me, sort, filter, query } = input;

  const near = new Set(nearSet(centres, me).map((c) => c.id));

  const q = query.trim().toLowerCase();
  let shown = centres;
  if (q) {
    shown = shown.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.region ?? "").toLowerCase().includes(q)
    );
  }
  if (filter !== "all") shown = shown.filter((c) => c.test_types.includes(filter));

  // Sorting by distance needs a fix; without one the control offering it is
  // disabled, and this stays a safe no-op if it is ever reached anyway.
  const ordered =
    sort === "nearest" && me
      ? [...shown].sort(byDistance(me))
      : [...shown].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0));

  const toView = (centre: Centre): ViewCentre => ({
    centre,
    distanceM: me ? haversineM(me, { lat: centre.lat, lng: centre.lng }) : null,
    pinned: near.has(centre.id),
  });

  if (!me) return [{ title: "All centres", data: ordered.map(toView) }];

  const sections: CentreSection[] = [];
  const pinned = ordered.filter((c) => near.has(c.id)).map(toView);
  const rest = ordered.filter((c) => !near.has(c.id)).map(toView);
  if (pinned.length) sections.push({ title: "Near you", data: pinned });
  if (rest.length) sections.push({ title: "Further afield", data: rest });
  return sections;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/centresView.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/centresView.ts src/lib/__tests__/centresView.test.ts
git commit -m "feat: shape the centres list into a near set and the rest

Forty centres across fifteen regions cannot all be pins, so the map gets
those within thirty miles - capped at twelve so the identity palette
never repeats on screen, floored at eight so a rural driver still gets a
map - and everything else is listed apart without one.

Sort and filter become separate axes. The screen this replaces put both
in one segmented control, so choosing Manual silently threw away
whichever sort was active.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `CentreEmblem` — the generated tile

**Files:**
- Create: `src/ui/CentreEmblem.tsx`
- Test: `src/ui/__tests__/centreEmblem.test.tsx`

**Interfaces:**
- Consumes: `CentreIdentity` from `@/lib/centreIdentity`.
- Produces: `function CentreEmblem({ identity, size }: { identity: CentreIdentity; size?: number }): JSX.Element` — default `size = 52`. Renders `testID="emblem"` on the root and `testID="emblem-initials"` on the text.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/centreEmblem.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import type { CentreIdentity } from "@/lib/centreIdentity";
import { CentreEmblem } from "../CentreEmblem";

const identity: CentreIdentity = {
  hue: "#BE123C", tint: "#FFF1F2", initials: "MH", seed: 1,
};

test("shows the monogram in the centre's hue on its tint", () => {
  render(<CentreEmblem identity={identity} />);
  expect(screen.getByTestId("emblem-initials")).toHaveTextContent("MH");
  expect(screen.getByTestId("emblem")).toHaveStyle({ backgroundColor: "#FFF1F2" });
});

test("two seeds draw different marks", () => {
  const { unmount } = render(<CentreEmblem identity={identity} />);
  const first = screen.getAllByTestId("emblem-arc").map((n) => n.props.cx);
  unmount();

  render(<CentreEmblem identity={{ ...identity, seed: 7 }} />);
  const second = screen.getAllByTestId("emblem-arc").map((n) => n.props.cx);
  expect(second).not.toEqual(first);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/centreEmblem.test.tsx`
Expected: FAIL — `Cannot find module '../CentreEmblem'`

- [ ] **Step 3: Write the implementation**

Create `src/ui/CentreEmblem.tsx`:

```tsx
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { CentreIdentity } from "@/lib/centreIdentity";

// Three arcs whose radii and offsets come from the seed. Nothing here is
// hand-authored, so seeding a new centre never needs a design pass.
const noise = (seed: number, n: number) =>
  ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

/**
 * A centre as a tile: its colour, its generated mark, its monogram. The same
 * identity paints its pin on the map, which is what lets a learner match the
 * two without reading either label.
 */
export function CentreEmblem({ identity, size = 52 }: { identity: CentreIdentity; size?: number }) {
  const { hue, tint, initials, seed } = identity;
  return (
    <View
      testID="emblem"
      style={{
        width: size, height: size, borderRadius: size * 0.29, backgroundColor: tint,
        alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {[0, 1, 2].map((k) => (
          <Circle
            key={k}
            testID="emblem-arc"
            cx={(0.13 + noise(seed, k) * 0.74) * size}
            cy={(0.13 + noise(seed, k + 3) * 0.74) * size}
            r={(0.23 + noise(seed, k + 6) * 0.33) * size}
            fill="none"
            stroke={hue}
            strokeOpacity={0.1 + k * 0.05}
            strokeWidth={2 + k}
          />
        ))}
      </Svg>
      <Text
        testID="emblem-initials"
        style={{ fontSize: size * 0.35, fontWeight: "700", letterSpacing: -0.9, color: hue }}
      >
        {initials}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/centreEmblem.test.tsx`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/CentreEmblem.tsx src/ui/__tests__/centreEmblem.test.tsx
git commit -m "feat: add the generated centre emblem

Three arcs seeded from the centre's position in the list, so no two
tiles draw the same mark and none of it is hand-authored.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `CentreRow` — the 88pt card

**Files:**
- Create: `src/ui/CentreRow.tsx`
- Test: `src/ui/__tests__/centreRow.test.tsx`

**Interfaces:**
- Consumes: `ViewCentre` from `@/lib/centresView`, `CentreIdentity` from `@/lib/centreIdentity`, `CentreEmblem` from `@/ui/CentreEmblem`.
- Produces:
  - `const CENTRE_ROW_H = 88` — the scroll↔camera binding divides scroll offset by this.
  - `function CentreRow(props: { item: ViewCentre; identity: CentreIdentity; active: boolean; index: number; onPress: () => void }): JSX.Element`
  - testIDs: `centre-row`, `centre-row-name`, `centre-row-meta`, `centre-row-rate`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/centreRow.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { ViewCentre } from "@/lib/centresView";
import type { Centre } from "@/types/db";
import { CENTRE_ROW_H, CentreRow } from "../CentreRow";

const centre: Centre = {
  id: "c1", name: "Mill Hill (London)", address: "71 Watford Way",
  lat: 51.6087, lng: -0.2412, pass_rate: 43.5, pass_rate_history: [],
  test_types: ["manual", "auto"], region: "Greater London",
};

const identity: CentreIdentity = { hue: "#BE123C", tint: "#FFF1F2", initials: "MH", seed: 1 };

const setup = (item: Partial<ViewCentre> = {}, over: { active?: boolean; onPress?: () => void } = {}) =>
  render(
    <CentreRow
      item={{ centre, distanceM: 1931, pinned: true, ...item }}
      identity={identity}
      active={over.active ?? false}
      index={0}
      onPress={over.onPress ?? (() => {})}
    />
  );

test("the row is exactly the height the map binding assumes", () => {
  expect(CENTRE_ROW_H).toBe(88);
  setup();
  expect(screen.getByTestId("centre-row")).toHaveStyle({ height: 88 });
});

test("shows distance in miles when there is a fix", () => {
  setup();
  expect(screen.getByTestId("centre-row-name")).toHaveTextContent("Mill Hill (London)");
  expect(screen.getByTestId("centre-row-meta")).toHaveTextContent("1.2 mi away");
});

test("falls back to the region when there is no fix", () => {
  setup({ distanceM: null });
  expect(screen.getByTestId("centre-row-meta")).toHaveTextContent("Greater London");
});

test("a centre with no published rate says so rather than showing zero", () => {
  setup({ centre: { ...centre, pass_rate: null } });
  expect(screen.getByTestId("centre-row-rate")).toHaveTextContent("—");
});

test("the active row takes the centre's tint", () => {
  setup({}, { active: true });
  expect(screen.getByTestId("centre-row")).toHaveStyle({ backgroundColor: "#FFF1F2" });
});

test("pressing the row opens the centre", () => {
  const onPress = jest.fn();
  setup({}, { onPress });
  fireEvent.press(screen.getByTestId("centre-row"));
  expect(onPress).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/centreRow.test.tsx`
Expected: FAIL — `Cannot find module '../CentreRow'`

- [ ] **Step 3: Write the implementation**

Create `src/ui/CentreRow.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { ViewCentre } from "@/lib/centresView";
import { CentreEmblem } from "@/ui/CentreEmblem";

/** Fixed, and exported, because the scroll-to-camera binding divides by it. */
export const CENTRE_ROW_H = 88;

const RING_SIZE = 44;
const RING_R = 19;
const RING_CIRC = 2 * Math.PI * RING_R;
// The ring reads on a fixed 0-60% domain rather than 0-100. Pass rates live
// between 30 and 55, so on a 0-100 ring every centre would sit near half full
// and the graphic would carry no information at all.
const RING_DOMAIN = 60;

const miles = (m: number) => `${(m / 1609.34).toFixed(1)} mi away`;

/**
 * One centre in the sheet: its emblem, its name, how far off it is, and its
 * pass rate as a ring in its own colour. The row and its pin on the map share
 * an identity, which is the whole point of the layout.
 */
export function CentreRow({
  item, identity, active, index, onPress,
}: {
  item: ViewCentre;
  identity: CentreIdentity;
  active: boolean;
  index: number;
  onPress: () => void;
}) {
  const { centre, distanceM } = item;
  const rate = centre.pass_rate;
  const filled = rate === null ? 0 : Math.min(1, rate / RING_DOMAIN);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(16)}>
      <Pressable
        testID="centre-row"
        accessibilityRole="button"
        accessibilityLabel={`${centre.name}, ${rate === null ? "pass rate unknown" : `${rate.toFixed(0)} percent pass rate`}`}
        onPress={onPress}
        style={{
          height: CENTRE_ROW_H,
          backgroundColor: active ? identity.tint : "#FFFFFF",
          flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16,
          borderBottomWidth: 1, borderBottomColor: "#F5F8FA",
        }}
      >
        <CentreEmblem identity={identity} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            testID="centre-row-name"
            numberOfLines={1}
            style={{ fontSize: 16.5, fontWeight: "700", letterSpacing: -0.5, color: "#0F172A" }}
          >
            {centre.name}
          </Text>
          <Text
            testID="centre-row-meta"
            numberOfLines={1}
            style={{ marginTop: 2, fontSize: 12, fontWeight: "500", color: "#64748B" }}
          >
            {distanceM !== null ? miles(distanceM) : centre.region ?? ""}
          </Text>
        </View>

        <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke={identity.tint} strokeWidth={4.5} />
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none"
              stroke={identity.hue} strokeWidth={4.5} strokeLinecap="round"
              strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - filled)}
            />
          </Svg>
          <Text
            testID="centre-row-rate"
            style={{ fontSize: 12.5, fontWeight: "700", letterSpacing: -0.5, color: "#0F172A" }}
          >
            {rate === null ? "—" : `${rate.toFixed(0)}%`}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/centreRow.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/CentreRow.tsx src/ui/__tests__/centreRow.test.tsx
git commit -m "feat: add the centre row with its emblem and pass-rate ring

The ring reads on a fixed 0-60 domain: pass rates live between 30 and
55, so on 0-100 every centre would sit near half full and the graphic
would say nothing.

Distance is straight-line miles, which is what the screen actually
knows. A centre with no published rate says so instead of showing zero.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `CentresMap` — rings, pins, driver

**Files:**
- Create: `src/ui/CentresMap.tsx`
- Test: `src/ui/__tests__/centresMap.test.tsx`

**Interfaces:**
- Consumes: `ringPolygon` and `LatLng` from `@/lib/geo`, `CentreIdentity` from `@/lib/centreIdentity`, `mapColors` from `@/ui/mapStyle`.
- Produces:
  - `type CentresMapHandle = { focus: (c: LatLng) => void; fitAll: () => void }`
  - `const CentresMap: React.ForwardRefExoticComponent<CentresMapProps & React.RefAttributes<CentresMapHandle>>` where
    `CentresMapProps = { pins: Centre[]; identities: Map<string, CentreIdentity>; me: LatLng | null; activeId: string | null }`
  - Source ids, asserted by the tests: `source:rings`, `source:pins`, `source:me`.

Read `src/ui/NavMap.tsx` before starting. It is the only other Mapbox component in the app and it carries a long comment explaining why every `ShapeSource` stays mounted for the life of the map — mounting and unmounting them mid-session produced a native `Source 'route' is not in style` crash. **The same rule applies here:** all three sources below mount once and are handed an empty `FeatureCollection` when there is nothing to draw. Never conditionally render a source.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/centresMap.test.tsx`:

```tsx
import { createRef } from "react";
import { render, screen } from "@testing-library/react-native";

// Kept outside __tests__ so jest does not collect it as a suite of its own.
jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));

// eslint-disable-next-line import/first
import type { CentreIdentity } from "@/lib/centreIdentity";
// eslint-disable-next-line import/first
import type { Centre } from "@/types/db";
// eslint-disable-next-line import/first
import { CentresMap, CentresMapHandle } from "../CentresMap";

const centre = (id: string, lat: number, lng: number): Centre => ({
  id, name: id, address: "", lat, lng, pass_rate: 40,
  pass_rate_history: [], test_types: ["manual"], region: "Greater London",
});

const identity: CentreIdentity = { hue: "#BE123C", tint: "#FFF1F2", initials: "MH", seed: 1 };

const pins = [centre("a", 51.60, -0.24), centre("b", 51.63, -0.16)];
const identities = new Map(pins.map((p) => [p.id, identity]));

const setup = (over: Partial<React.ComponentProps<typeof CentresMap>> = {}) =>
  render(
    <CentresMap
      ref={createRef<CentresMapHandle>()}
      pins={pins}
      identities={identities}
      me={{ lat: 51.601, lng: -0.235 }}
      activeId={null}
      {...over}
    />
  );

const shapeOf = (id: string) => screen.getByTestId(`source:${id}`).props.shape;

test("rings, pins and the driver each get a source that is always mounted", () => {
  setup();
  for (const id of ["rings", "pins", "me"]) {
    expect(screen.getByTestId(`source:${id}`)).toBeTruthy();
  }
});

test("the sources stay mounted with no fix and no pins, holding empty collections", () => {
  setup({ me: null, pins: [], identities: new Map() });
  for (const id of ["rings", "pins", "me"]) {
    expect(screen.getByTestId(`source:${id}`)).toBeTruthy();
    expect(shapeOf(id).features).toEqual([]);
  }
});

test("one ring feature per distance band", () => {
  setup();
  expect(shapeOf("rings").features).toHaveLength(3);
  expect(shapeOf("rings").features[0].geometry.type).toBe("Polygon");
});

test("each pin carries its own colour and monogram as feature properties", () => {
  setup();
  const features = shapeOf("pins").features;
  expect(features).toHaveLength(2);
  expect(features[0].properties).toMatchObject({ id: "a", hue: "#BE123C", initials: "MH" });
  expect(features[0].geometry.coordinates).toEqual([-0.24, 51.60]);
});

test("the active pin is flagged so the style can lift it", () => {
  setup({ activeId: "b" });
  const features = shapeOf("pins").features;
  expect(features.find((f: any) => f.properties.id === "b").properties.active).toBe(true);
  expect(features.find((f: any) => f.properties.id === "a").properties.active).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/centresMap.test.tsx`
Expected: FAIL — `Cannot find module '../CentresMap'`

- [ ] **Step 3: Write the implementation**

Create `src/ui/CentresMap.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { BackgroundLayer, Camera, CircleLayer, LineLayer, MapView, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import { ringPolygon, type LatLng } from "@/lib/geo";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { Centre } from "@/types/db";
import { mapColors } from "@/ui/mapStyle";

const OVERVIEW_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const RING_MILES = [3, 8, 15];
const ACCENT = "#059669";

// Every source below stays mounted for the life of the map and is handed an
// empty FeatureCollection when there is nothing to draw. Mounting and
// unmounting them is what produced the native "Source is not in style" crash
// the NavMap comment documents at length; the same trap is here.
const EMPTY = { type: "FeatureCollection" as const, features: [] };

export type CentresMapHandle = {
  /** Ease the camera onto one centre. */
  focus: (c: LatLng) => void;
  /** Refit the camera to the driver plus every pin. */
  fitAll: () => void;
};

export type CentresMapProps = {
  pins: Centre[];
  identities: Map<string, CentreIdentity>;
  me: LatLng | null;
  activeId: string | null;
};

export const CentresMap = forwardRef<CentresMapHandle, CentresMapProps>(
  function CentresMap({ pins, identities, me, activeId }, ref) {
    const camera = useRef<Camera>(null);

    const rings = useMemo(() => {
      if (!me) return EMPTY;
      return {
        type: "FeatureCollection" as const,
        features: RING_MILES.map((mi) => ({
          type: "Feature" as const,
          properties: { miles: mi },
          geometry: ringPolygon(me, mi * 1609.34),
        })),
      };
    }, [me]);

    const pinShape = useMemo(() => ({
      type: "FeatureCollection" as const,
      features: pins.map((c) => {
        const identity = identities.get(c.id);
        return {
          type: "Feature" as const,
          properties: {
            id: c.id,
            name: c.name,
            hue: identity?.hue ?? "#475569",
            initials: identity?.initials ?? "",
            active: c.id === activeId,
          },
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] as [number, number] },
        };
      }),
    }), [pins, identities, activeId]);

    const meShape = useMemo(() => {
      if (!me) return EMPTY;
      return {
        type: "FeatureCollection" as const,
        features: [{
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: [me.lng, me.lat] as [number, number] },
        }],
      };
    }, [me]);

    useImperativeHandle(ref, () => ({
      focus: (c) => camera.current?.setCamera({
        centerCoordinate: [c.lng, c.lat],
        animationDuration: 350,
        animationMode: "easeTo",
      }),
      fitAll: () => {
        const points = [...pins.map((p) => [p.lng, p.lat] as [number, number])];
        if (me) points.push([me.lng, me.lat]);
        if (!points.length) return;
        const lngs = points.map((p) => p[0]);
        const lats = points.map((p) => p[1]);
        camera.current?.fitBounds(
          [Math.max(...lngs), Math.max(...lats)],
          [Math.min(...lngs), Math.min(...lats)],
          [80, 40, 380, 40],   // top, right, bottom, left — the sheet covers the bottom half
          600
        );
      },
    }), [pins, me]);

    return (
      <MapView
        style={{ flex: 1 }}
        styleURL={OVERVIEW_STYLE}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
      >
        {/* What shows when tiles have not loaded, which is what offline looks
            like. A flat warm ground reads as deliberate; a grey void reads as
            broken. */}
        <BackgroundLayer id="ground" style={{ backgroundColor: mapColors.land }} />

        <Camera ref={camera} />

        <ShapeSource id="rings" shape={rings}>
          <LineLayer
            id="ring-lines"
            style={{ lineColor: ACCENT, lineWidth: 1.5, lineDasharray: [4, 5], lineOpacity: 0.28 }}
          />
        </ShapeSource>

        <ShapeSource id="pins" shape={pinShape}>
          <CircleLayer
            id="pin-body"
            style={{
              circleColor: ["get", "hue"],
              circleRadius: ["case", ["get", "active"], 15, 11],
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 2,
              circleTranslate: [0, -18],
            }}
          />
          <SymbolLayer
            id="pin-initials"
            style={{
              textField: ["get", "initials"],
              textSize: ["case", ["get", "active"], 13, 9.5],
              textColor: "#FFFFFF",
              textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              textOffset: [0, -1.6],
              textAllowOverlap: true,
            }}
          />
          <SymbolLayer
            id="pin-label"
            style={{
              textField: ["case", ["get", "active"], ["get", "name"], ""],
              textSize: 11,
              textColor: ["get", "hue"],
              textHaloColor: "#FFFFFF",
              textHaloWidth: 1.6,
              textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              textOffset: [0, -3.6],
              textAllowOverlap: true,
            }}
          />
        </ShapeSource>

        <ShapeSource id="me" shape={meShape}>
          <CircleLayer
            id="me-halo"
            style={{ circleColor: ACCENT, circleOpacity: 0.22, circleRadius: 16 }}
          />
          <CircleLayer
            id="me-dot"
            style={{ circleColor: ACCENT, circleRadius: 6, circleStrokeColor: "#FFFFFF", circleStrokeWidth: 2.5 }}
          />
        </ShapeSource>
      </MapView>
    );
  }
);
```

Add `SymbolLayer` to `src/test/rnmapboxMock.tsx` so the mock covers what this component mounts — append beside the existing exports:

```tsx
export const SymbolLayer = stub("layer");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/centresMap.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/CentresMap.tsx src/ui/__tests__/centresMap.test.tsx src/test/rnmapboxMock.tsx
git commit -m "feat: add the centres overview map

Rings are polygons in world coordinates, not a pixel circle-radius, so
they stay three, eight and fifteen miles wide at every zoom. Each pin
carries its centre's hue and monogram as feature properties so the map
and the sheet show the same object.

All three sources mount once and take an empty collection when there is
nothing to draw, for the reason the NavMap comment sets out at length.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The screen — map, sheet, filters, states

**Files:**
- Modify: `app/(tabs)/index.tsx` (full rewrite)
- Test: `src/ui/__tests__/centresScreen.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–6, plus `listCentres` from `@/services/centresRepo`, `useNetwork` from `@/stores/networkStore`, `OfflineBanner`, `SegmentedControl`, `Skeleton`.
- Produces: the screen. No exports beyond the default.

This task delivers the screen with the sheet, the filters and every state. The scroll↔camera binding is Task 8, so at the end of this task scrolling the sheet does not move the map, and that is expected.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/centresScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));
jest.mock("expo-location", () => require("../../test/locationMock"));
jest.mock("@/services/centresRepo", () => ({ listCentres: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line import/first
import { listCentres } from "@/services/centresRepo";
// eslint-disable-next-line import/first
import { resetLocationMock, requestForegroundPermissionsAsync, setLastKnownPosition } from "../../test/locationMock";
// eslint-disable-next-line import/first
import type { Centre } from "@/types/db";
// eslint-disable-next-line import/first
import Centres from "../../../app/(tabs)/index";

const centre = (id: string, over: Partial<Centre> = {}): Centre => ({
  id, name: id, address: "", lat: 51.61, lng: -0.24, pass_rate: 40,
  pass_rate_history: [], test_types: ["manual", "auto"], region: "Greater London",
  ...over,
});

const CENTRES = [
  centre("Mill Hill", { lat: 51.6087, lng: -0.2412, pass_rate: 43.5 }),
  centre("Hendon", { lat: 51.5921, lng: -0.2495, pass_rate: 39 }),
  centre("Chingford", { lat: 51.6316, lng: -0.006, pass_rate: 50, test_types: ["auto"] }),
];

beforeEach(() => {
  resetLocationMock();
  setLastKnownPosition(51.601, -0.235);
  (listCentres as jest.Mock).mockResolvedValue({ data: CENTRES, stale: false });
});

test("lists the centres once they load", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  expect(screen.getByText("Mill Hill")).toBeTruthy();
});

test("a type filter keeps the active sort instead of replacing it", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  fireEvent.press(screen.getByText("Pass rate"));
  fireEvent.press(screen.getByText("Auto"));

  // All three centres offer auto, so the filter removes nothing; what matters
  // is that the pass-rate sort chosen a moment ago survived it. On the screen
  // this replaces, tapping a car type reset the order.
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
  expect(names[0]).toBe("Chingford");   // 50%, the highest
});

test("searching matches on region as well as name", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  fireEvent.changeText(screen.getByTestId("centre-search"), "hendon");
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(1));
});

test("a search matching nothing says so", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  fireEvent.changeText(screen.getByTestId("centre-search"), "brixton");
  await waitFor(() => expect(screen.getByTestId("centres-empty")).toBeTruthy());
});

test("without location permission, Nearest is disabled and the sort is by pass rate", async () => {
  requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  expect(screen.getByTestId("sort-nearest")).toBeDisabled();
  const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
  expect(names[0]).toBe("Chingford");   // 50%, the highest
  expect(screen.getByTestId("centre-row-meta")).toHaveTextContent("Greater London");
});

test("a failed load with no cache offers a retry rather than an empty list", async () => {
  (listCentres as jest.Mock).mockRejectedValue(new Error("offline"));
  render(<Centres />);
  await waitFor(() => expect(screen.getByTestId("centres-error")).toBeTruthy());

  (listCentres as jest.Mock).mockResolvedValue({ data: CENTRES, stale: false });
  fireEvent.press(screen.getByTestId("centres-retry"));
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/centresScreen.test.tsx`
Expected: FAIL — the current screen has no `centre-row` testIDs

- [ ] **Step 3: Write the implementation**

Replace `app/(tabs)/index.tsx` entirely:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { assignIdentities } from "@/lib/centreIdentity";
import {
  buildSections, nearSet,
  type CentreFilter, type CentreSort, type ViewCentre,
} from "@/lib/centresView";
import { haversineM, type LatLng } from "@/lib/geo";
import { listCentres } from "@/services/centresRepo";
import { useNetwork } from "@/stores/networkStore";
import type { Centre } from "@/types/db";
import { CENTRE_ROW_H, CentreRow } from "@/ui/CentreRow";
import { CentresMap, type CentresMapHandle } from "@/ui/CentresMap";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const SORTS: { key: CentreSort; label: string }[] = [
  { key: "nearest", label: "Nearest" },
  { key: "pass", label: "Pass rate" },
];
const FILTERS: { key: CentreFilter; label: string }[] = [
  { key: "manual", label: "Manual" },
  { key: "auto", label: "Auto" },
];

type Row = { kind: "header"; title: string } | { kind: "centre"; item: ViewCentre; index: number };

export default function Centres() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const online = useNetwork((s) => s.online);
  const map = useRef<CentresMapHandle>(null);

  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CentreSort>("nearest");
  const [filter, setFilter] = useState<CentreFilter>("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await listCentres();
      setCentres(r.data);
      setStale(r.stale);
    } catch {
      setError("Couldn't load centres.");
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      // No fix means no distances and no near set. The sort falls back rather
      // than leaving a "Nearest" control that silently does nothing, which is
      // what the screen this replaces did.
      if (status !== "granted") { setSort("pass"); return; }
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
      if (pos) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })();
  }, [load]);

  // Identity is assigned from the distance-sorted list, never the displayed
  // one, so re-sorting by pass rate repaints nothing.
  const identities = useMemo(() => {
    const all = centres ?? [];
    const ordered = me
      ? [...all].sort((a, b) =>
          haversineM(me, { lat: a.lat, lng: a.lng }) - haversineM(me, { lat: b.lat, lng: b.lng }))
      : all;
    return assignIdentities(ordered);
  }, [centres, me]);

  const pins = useMemo(() => nearSet(centres ?? [], me), [centres, me]);

  const sections = useMemo(
    () => buildSections({ centres: centres ?? [], me, sort, filter, query }),
    [centres, me, sort, filter, query]
  );

  // One flat array, because a fixed row height is what lets the map binding
  // work out the active centre from a scroll offset without measuring.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let index = 0;
    for (const section of sections) {
      if (sections.length > 1) out.push({ kind: "header", title: section.title });
      for (const item of section.data) out.push({ kind: "centre", item, index: index++ });
    }
    return out;
  }, [sections]);

  const empty = centres !== null && !error && rows.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <CentresMap ref={map} pins={pins} identities={identities} me={me} activeId={null} />

      <View style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, flexDirection: "row", gap: 8 }}>
        <View style={pillStyle}>
          <Ionicons name="location" size={13} color={colors.accent} />
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.primary }}>Test centres</Text>
        </View>
        {!me && (
          <Pressable
            testID="enable-location"
            style={pillStyle}
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== "granted") return;
              const pos = await Location.getCurrentPositionAsync({});
              setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: "#64748B" }}>Turn on location for distances</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable testID="recentre" style={pillStyle} onPress={() => map.current?.fitAll()}>
          <Ionicons name="locate" size={15} color={colors.accent} />
        </Pressable>
      </View>

      <BottomSheet index={0} snapPoints={["52%", "92%"]} bottomInset={0}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Ionicons name="search" size={15} color={colors.ink3} />
            <TextInput
              testID="centre-search"
              style={{ flex: 1, fontSize: 14 }}
              placeholder="Search centres"
              value={query}
              onChangeText={setQuery}
            />
          </View>

          {/* Two axes, not one. Choosing a car type keeps the sort. */}
          <View style={{ flexDirection: "row", backgroundColor: "rgba(226,232,240,0.8)", borderRadius: 9, padding: 2 }}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                testID={`sort-${s.key}`}
                disabled={s.key === "nearest" && !me}
                onPress={() => setSort(s.key)}
                style={[segStyle, sort === s.key && segOnStyle]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: segTextColor(sort === s.key, s.key === "nearest" && !me) }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(filter === f.key ? "all" : f.key)}
                style={[segStyle, filter === f.key && segOnStyle]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: segTextColor(filter === f.key, false) }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <OfflineBanner visible={stale || !online} />

        {/* A sheet whose list has been replaced by an error has nothing to pull
            down, so the retry is a button. */}
        {error && (
          <View testID="centres-error" style={{ padding: 24, alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>{error}</Text>
            <Pressable
              testID="centres-retry"
              onPress={load}
              style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.accent }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>Try again</Text>
            </Pressable>
          </View>
        )}

        {centres === null && !error && (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={CENTRE_ROW_H - 12} />)}
          </View>
        )}

        {empty && (
          <View testID="centres-empty" style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748B" }}>No centres match “{query}”.</Text>
          </View>
        )}

        {!error && rows.length > 0 && (
          <BottomSheetFlatList
            data={rows}
            keyExtractor={(r) => (r.kind === "header" ? `h:${r.title}` : r.item.centre.id)}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item: row }) =>
              row.kind === "header" ? (
                <Text style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: "#94A3B8" }}>
                  {row.title}
                </Text>
              ) : (
                <CentreRow
                  item={row.item}
                  identity={identities.get(row.item.centre.id)!}
                  active={false}
                  index={row.index}
                  onPress={() => router.push(`/centre/${row.item.centre.id}`)}
                />
              )
            }
          />
        )}
      </BottomSheet>
    </View>
  );
}

const pillStyle = {
  backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 999,
  paddingHorizontal: 13, paddingVertical: 7,
  flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
  shadowColor: "#0F172A", shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
};
const segStyle = { flex: 1, minHeight: 32, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 7 };
const segOnStyle = {
  backgroundColor: "#FFFFFF",
  shadowColor: "#0F172A", shadowOpacity: 0.14, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 },
};
const segTextColor = (on: boolean, disabled: boolean) =>
  disabled ? "#CBD5E1" : on ? colors.primary : "#64748B";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/centresScreen.test.tsx`
Expected: PASS, 6 tests

If `BottomSheet` renders nothing under test, mock it in this suite alongside the others — `@gorhom/bottom-sheet` needs a real layout pass that the test renderer does not give it:

```tsx
jest.mock("@gorhom/bottom-sheet", () => {
  const { View, FlatList } = require("react-native");
  return {
    __esModule: true,
    default: ({ children }: any) => <View>{children}</View>,
    BottomSheetFlatList: FlatList,
  };
});
```

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: PASS, every suite

```bash
git add app/\(tabs\)/index.tsx src/ui/__tests__/centresScreen.test.tsx
git commit -m "feat: rebuild the centres screen as a map with a sheet

The list of forty centres becomes a map of the ones you can reach with a
sheet of cards over it. Sort and filter split into two axes, so choosing
Manual no longer throws away the sort, and Nearest is disabled outright
without a fix rather than silently doing nothing.

Drive times and the 'within 17 miles' claim from the design artifact are
absent on purpose: nothing on this screen fetches a route, and
listCentres returns all forty nationwide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The binding — scroll the sheet, the map follows

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Test: `src/ui/__tests__/centresScreen.test.tsx` (append)

**Interfaces:**
- Consumes: `CENTRE_ROW_H` from `@/ui/CentreRow`, `CentresMapHandle.focus` from `@/ui/CentresMap`.
- Produces: nothing new — the screen gains an `activeId` state which it already passes to `CentresMap`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/__tests__/centresScreen.test.tsx`:

```tsx
const scrollTo = (y: number) =>
  fireEvent.scroll(screen.UNSAFE_getByType(require("react-native").FlatList), {
    nativeEvent: {
      contentOffset: { y, x: 0 },
      contentSize: { height: 1000, width: 390 },
      layoutMeasurement: { height: 400, width: 390 },
    },
  });

test("scrolling the sheet makes the arrived-at centre active", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  // 88pt rows: an offset of two rows lands on the third centre.
  scrollTo(176);
  await waitFor(() => {
    const active = screen.getAllByTestId("centre-row").filter((r) => r.props.style.backgroundColor !== "#FFFFFF");
    expect(active).toHaveLength(1);
  });
});

test("a row under Further afield does not become active", async () => {
  // Newcastle is 250 miles out, so it is listed but never pinned.
  (listCentres as jest.Mock).mockResolvedValue({
    data: [...CENTRES, centre("Newcastle", { lat: 54.97, lng: -1.61, region: "Tyne and Wear" })],
    stale: false,
  });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(4));

  scrollTo(2000);   // far past the end, onto the unpinned section
  await waitFor(() => {
    const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
    expect(names).toContain("Newcastle");
  });
  const active = screen.getAllByTestId("centre-row").filter((r) => r.props.style.backgroundColor !== "#FFFFFF");
  expect(active).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/centresScreen.test.tsx`
Expected: FAIL — no row ever becomes active, because `activeId` is hardcoded `null`

- [ ] **Step 3: Write the implementation**

In `app/(tabs)/index.tsx`, add the state and the handler above the `return`:

```tsx
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastMove = useRef(0);

  /**
   * The sheet and the map are one instrument: scrolling the cards is the same
   * gesture as panning the map.
   *
   * Rows are a fixed CENTRE_ROW_H, so the arrived-at row is a division rather
   * than a measurement. Two guards keep the camera from feeling seasick: it
   * only moves when the row actually changes, and never twice inside 150ms, so
   * a flung list settles before the map chases it.
   */
  const onScroll = useCallback((offsetY: number) => {
    const centreRows = rows.filter((r): r is Extract<Row, { kind: "centre" }> => r.kind === "centre");
    if (!centreRows.length) return;

    const i = Math.min(centreRows.length - 1, Math.max(0, Math.round(offsetY / CENTRE_ROW_H)));
    const row = centreRows[i];

    // Rows under "Further afield" have no pin, so there is nothing to fly to
    // and a jump from London to Newcastle mid-scroll would be violent.
    if (!row.item.pinned) { setActiveId(null); return; }
    if (row.item.centre.id === activeId) return;

    setActiveId(row.item.centre.id);

    const now = Date.now();
    if (now - lastMove.current < 150) return;
    lastMove.current = now;
    map.current?.focus({ lat: row.item.centre.lat, lng: row.item.centre.lng });
  }, [rows, activeId]);
```

Change the `CentresMap` element to pass the state instead of `null`:

```tsx
      <CentresMap ref={map} pins={pins} identities={identities} me={me} activeId={activeId} />
```

Wire the list to the handler and give it a fixed layout, replacing the `BottomSheetFlatList` opening tag and adding `active` to the row:

```tsx
          <BottomSheetFlatList
            data={rows}
            keyExtractor={(r) => (r.kind === "header" ? `h:${r.title}` : r.item.centre.id)}
            contentContainerStyle={{ paddingBottom: 120 }}
            scrollEventThrottle={16}
            onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
```

and inside `renderItem`, for the centre branch:

```tsx
                <CentreRow
                  item={row.item}
                  identity={identities.get(row.item.centre.id)!}
                  active={row.item.centre.id === activeId}
                  index={row.index}
                  onPress={() => router.push(`/centre/${row.item.centre.id}`)}
                />
```

Finally, make the nearest centre active once the pins land — add below the existing effects:

```tsx
  // The first pin is active from the start, so the map opens already pointed
  // at something rather than at the middle of nowhere.
  useEffect(() => {
    if (pins.length && activeId === null) setActiveId(pins[0].id);
  }, [pins, activeId]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/centresScreen.test.tsx`
Expected: PASS, 8 tests

- [ ] **Step 5: Run the whole suite, lint, and commit**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors

```bash
git add app/\(tabs\)/index.tsx src/ui/__tests__/centresScreen.test.tsx
git commit -m "feat: bind the sheet's scroll to the map's camera

Rows are a fixed height, so the arrived-at centre is a division rather
than a measurement. The camera only moves when the row changes and never
twice inside 150ms, so a flung list settles before the map chases it,
and rows under Further afield move nothing because they have no pin.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Motion

**Files:**
- Modify: `src/ui/CentresMap.tsx`
- Modify: `src/ui/CentreRow.tsx`
- Modify: `src/ui/CentreEmblem.tsx`
- Test: `src/ui/__tests__/centresMap.test.tsx` (append)

**Interfaces:**
- Consumes: everything as built. No signature changes — `CentresMap` gains internal reveal state, the row and emblem gain internal animation.
- Produces: nothing new.

**One adjustment to the spec.** The spec says the distance rings "expand outward". Expanding a polygon means regenerating its 64 vertices every frame and re-uploading the shape to the native map sixty times a second, which is exactly the kind of churn the `NavMap` comment warns about. The rings instead **appear in sequence** — 3 miles, then 8, then 15, 130ms apart — each fading in through Mapbox's own `lineOpacityTransition`, which runs native-side at no cost. The outward read survives; the per-frame geometry upload does not happen. Update the spec's motion table to match when this task is done.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/__tests__/centresMap.test.tsx`:

```tsx
test("pins arrive one at a time rather than all at once", () => {
  jest.useFakeTimers();
  setup();

  // Nothing on the map on the first frame; the stagger fills it in.
  expect(shapeOf("pins").features).toHaveLength(0);

  jest.advanceTimersByTime(70);
  expect(shapeOf("pins").features).toHaveLength(1);

  jest.advanceTimersByTime(70 * 5);
  expect(shapeOf("pins").features).toHaveLength(2);
  jest.useRealTimers();
});

test("a changed pin set restarts the reveal rather than jumping", () => {
  jest.useFakeTimers();
  const { rerender } = setup();
  jest.advanceTimersByTime(70 * 4);
  expect(shapeOf("pins").features).toHaveLength(2);

  rerender(
    <CentresMap
      pins={[...pins, centre("c", 51.65, -0.08)]}
      identities={new Map([...identities, ["c", identity]])}
      me={{ lat: 51.601, lng: -0.235 }}
      activeId={null}
    />
  );
  expect(shapeOf("pins").features).toHaveLength(0);
  jest.advanceTimersByTime(70 * 4);
  expect(shapeOf("pins").features).toHaveLength(3);
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/centresMap.test.tsx`
Expected: FAIL — the first assertion gets 2 features, because every pin is drawn immediately

- [ ] **Step 3: Write the implementation**

In `src/ui/CentresMap.tsx`, add the reveal state. Import `useEffect`, `useState` and Reanimated's reduced-motion hook alongside the existing imports:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
```

Add these constants beside the existing ones:

```tsx
const PIN_STAGGER_MS = 70;
const RING_STAGGER_MS = 130;
```

Inside the component, above the `rings` memo:

```tsx
    // Pins and rings arrive in sequence rather than all at once. The reveal is
    // a count, not a per-frame geometry change: expanding the rings by
    // regenerating their vertices every frame would re-upload three polygons to
    // the native map sixty times a second, which is the churn NavMap's header
    // comment exists to warn about. Mapbox's own opacity transitions do the
    // fading, native-side and free.
    const reducedMotion = useReducedMotion();
    const [revealed, setRevealed] = useState(0);
    const [ringsShown, setRingsShown] = useState(0);

    useEffect(() => {
      if (reducedMotion) { setRevealed(pins.length); setRingsShown(RING_MILES.length); return; }
      setRevealed(0);
      setRingsShown(0);
      const timers = [
        ...pins.map((_, i) => setTimeout(() => setRevealed(i + 1), (i + 1) * PIN_STAGGER_MS)),
        ...RING_MILES.map((_, i) => setTimeout(() => setRingsShown(i + 1), (i + 1) * RING_STAGGER_MS)),
      ];
      return () => timers.forEach(clearTimeout);
    }, [pins, reducedMotion]);
```

Change the `rings` memo to slice by `ringsShown`:

```tsx
    const rings = useMemo(() => {
      if (!me) return EMPTY;
      return {
        type: "FeatureCollection" as const,
        features: RING_MILES.slice(0, ringsShown).map((mi) => ({
          type: "Feature" as const,
          properties: { miles: mi },
          geometry: ringPolygon(me, mi * 1609.34),
        })),
      };
    }, [me, ringsShown]);
```

Change the `pinShape` memo's first line to slice by `revealed`:

```tsx
      features: pins.slice(0, revealed).map((c) => {
```

and add `revealed` to its dependency array:

```tsx
    }), [pins, identities, activeId, revealed]);
```

Give both layers a native transition so the newly added features fade and grow rather than popping. In `ring-lines`:

```tsx
          <LineLayer
            id="ring-lines"
            style={{
              lineColor: ACCENT, lineWidth: 1.5, lineDasharray: [4, 5], lineOpacity: 0.28,
              lineOpacityTransition: { duration: 600, delay: 0 },
            }}
          />
```

In `pin-body`:

```tsx
          <CircleLayer
            id="pin-body"
            style={{
              circleColor: ["get", "hue"],
              circleRadius: ["case", ["get", "active"], 15, 11],
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 2,
              circleTranslate: [0, -18],
              circleRadiusTransition: { duration: 320, delay: 0 },
              circleOpacityTransition: { duration: 320, delay: 0 },
            }}
          />
```

In `src/ui/CentreEmblem.tsx`, bloom the generated mark in. Add the imports:

```tsx
import { useEffect } from "react";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
```

Inside the component, above the `return`:

```tsx
  // The mark blooms in behind the monogram: the tile is the first thing that
  // says which centre this is, so it should arrive rather than simply exist.
  const reducedMotion = useReducedMotion();
  const bloom = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) { bloom.value = 1; return; }
    bloom.value = withDelay(110, withTiming(1, { duration: 700 }));
  }, [bloom, reducedMotion]);
  const markStyle = useAnimatedStyle(() => ({
    opacity: bloom.value,
    transform: [{ scale: 0.7 + bloom.value * 0.3 }, { rotate: `${-24 + bloom.value * 24}deg` }],
  }));
```

and wrap the `<Svg>` in an `Animated.View` carrying it:

```tsx
      <Animated.View style={[{ position: "absolute", width: size, height: size }, markStyle]}>
        <Svg width={size} height={size}>
          {/* …the three Circles, unchanged… */}
        </Svg>
      </Animated.View>
```

In `src/ui/CentreRow.tsx`, sweep the ring instead of drawing it filled. Add the imports:

```tsx
import { useEffect } from "react";
import Animated, { FadeInDown, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
```

Add below the existing constants:

```tsx
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
```

Inside the component, above the `return`:

```tsx
  const reducedMotion = useReducedMotion();
  const sweep = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) { sweep.value = 1; return; }
    sweep.value = withDelay(index * 60 + 160, withTiming(1, { duration: 950 }));
  }, [sweep, index, reducedMotion, filled]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRC * (1 - filled * sweep.value),
  }));
```

and change the filled arc from `<Circle>` to `<AnimatedCircle>`, replacing its static `strokeDashoffset` with `animatedProps`:

```tsx
            <AnimatedCircle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none"
              stroke={identity.hue} strokeWidth={4.5} strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              animatedProps={arcProps}
            />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/ui/__tests__/centresMap.test.tsx`
Expected: PASS, 7 tests

The row and emblem animations are **not** unit-tested here, deliberately. A test that advances a Reanimated clock and asserts an interpolated `strokeDashoffset` asserts the library works, not that the screen does. They are checked on device in Task 10.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: PASS, every suite

```bash
git add src/ui/CentresMap.tsx src/ui/CentreRow.tsx src/ui/CentreEmblem.tsx src/ui/__tests__/centresMap.test.tsx
git commit -m "feat: bring the centres screen in rather than switching it on

Pins arrive one every 70ms and rings one every 130ms, outward from the
driver; each row's pass-rate ring sweeps and its emblem mark blooms in.

The rings appear in sequence rather than expanding: growing a polygon
means regenerating 64 vertices a frame and re-uploading three shapes to
the native map sixty times a second, which is the churn NavMap's header
comment exists to warn about. Mapbox's own opacity transitions do the
fade instead, native-side.

Every entrance collapses to its end state under useReducedMotion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: On-device pass

**Files:** none — this is measurement, not code.

The spec names three risks that only a device can settle. Nothing here is committable; the deliverable is a decision on each.

- [ ] **Step 1: Build and run**

Run: `npx expo start --dev-client`, open on the iPhone dev build (see `docs/dev-build.md`).

- [ ] **Step 2: Cold-start the centres tab**

The map is now the heaviest thing the app mounts and it mounts on launch. Time from tapping the app icon to the first pin appearing. If it is over 2 seconds, mount the sheet first and the map behind it on the next frame.

- [ ] **Step 3: Fling the sheet**

Scroll the list hard and watch the camera. If it feels seasick despite the 150ms floor, change `onScroll` to `onMomentumScrollEnd` so the camera only moves once the list stops.

- [ ] **Step 4: Watch the entrance, then watch it with Reduce Motion on**

Task 9's row and emblem animations have no unit test on purpose. Open the tab cold and check the ring sweep and the mark bloom read as one movement rather than two competing ones, then turn on iOS Settings → Accessibility → Motion → Reduce Motion and confirm everything is simply *there*, with the pins and rings still correctly placed.

- [ ] **Step 5: Look at twelve pins at once**

Twelve saturated pins is close to the limit. Check the monogram is still legible at the fitted zoom and that no two pins overlap so badly the colours merge. If they do, raise `NEAR_RADIUS_M` handling so the fit has more spread, or drop `NEAR_MAX` to ten.

- [ ] **Step 6: Turn off the network and reopen the tab**

Tiles will not load. Confirm the `BackgroundLayer` ground shows, that pins and rings still draw in the right places, and that the `OfflineBanner` appears. The layout must not change shape.

- [ ] **Step 7: Record what you found**

Append a short "On device" section to `docs/superpowers/specs/2026-08-10-centres-screen-redesign.md` with the cold-start number and any of the three fallbacks you had to take, then commit that doc change.

---

## Notes for the implementer

**Read `src/ui/NavMap.tsx` before Task 6.** Its header comment documents a native crash caused by mounting and unmounting `ShapeSource`s, and Task 6 is one careless refactor away from the same bug.

**`ui.test.tsx` may need updating.** It is the general UI suite and may render the old centres screen; check it after Task 7 and fix any reference to the removed layout in the same commit.

**Do not add a `min drive` string anywhere.** It is the thing the spec explicitly cut, and it will look like an obvious improvement to anyone who has not read why.
