# RouteReady Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working Expo Go app: sign in → browse 40 UK test centres → pick a route → guided practice drive with voice → silent mock test → DVSA-style scored result saved to Supabase.

**Architecture:** Three strict layers — `src/services/` repositories (Supabase → AsyncStorage cache-through + outbox), `src/stores/` Zustand, `app/` Expo Router screens (presentational only). Pure-function libraries (`src/lib/geo`, `src/lib/scoring`, `src/lib/instructions`) carry all testable logic. A one-off Node seed pipeline (`scripts/seed/`) generates road-snapped routes via the public OSRM API and emits `supabase/seed.sql`.

**Tech Stack:** Expo SDK 52 (TypeScript strict), Expo Router, NativeWind 4, Zustand, Reanimated 3, react-native-maps (Apple Maps), @gorhom/bottom-sheet, expo-speech/location/haptics/secure-store/font, @react-native-community/netinfo, @supabase/supabase-js, react-native-gifted-charts, jest-expo + @testing-library/react-native.

## Global Constraints

- iOS-only; must run in **Expo Go** — only Expo-Go-compatible libraries, no custom native code, no `expo prebuild`.
- Colours (exact): Primary `#0F172A`, Accent `#059669` (pressed `#047857`), Warning `#D97706`, Surface `#F8FAFC`, Card `#FFFFFF`, Danger `#DC2626`.
- Type: Inter via `expo-font`/`@expo-google-fonts/inter`; headings semibold, letter-spacing -0.02em.
- Radii: cards 12px, pills/CTAs 9999px, inputs 8px. 16px horizontal screen margins. Touch targets ≥ 44×44pt.
- **No emojis anywhere in UI copy.** Filter/toggle rows are flush iOS-style segmented controls, not gapped pill chips (user preference, 2026-07-28).
- Map: Apple Maps default provider, `mapType="mutedStandard"`; route polyline `#059669`, 5px, rounded caps; hazard pins `#D97706`.
- Auth is required at launch. Supabase URL/key come from `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`); `.env` is gitignored, `.env.example` committed.
- Mock scoring: minors ≤ 15 and no serious = pass. Speeding = GPS speed > limit × 1.1 + 2 mph; sustained ≥ 5 s = serious, shorter = minor. Missed observation-zone tap = minor.
- TDD for all pure logic (geo, seed derivations, repos, stores, instructions, scoring). Screens verified by typecheck + manual QA in Expo Go.
- Every task ends with `npx tsc --noEmit` clean and a git commit.
- Spec: `docs/superpowers/specs/2026-07-28-routeready-design.md`. Two amendments made by this plan (kept in sync in the spec): (a) voice instructions are derived **client-side at route load** from geometry via `src/lib/instructions.ts` (not stored in DB); (b) `test_centres.pass_rate_history jsonb` added so the centre-detail sparkline has data.

## File Structure (end state of Phase 1)

```
app/
  _layout.tsx              # fonts, auth gate, providers
  (auth)/sign-in.tsx       # email/password + magic link
  (auth)/sign-up.tsx
  (tabs)/_layout.tsx       # 4 tabs (Progress/Manoeuvres/Quiz are placeholders in P1)
  (tabs)/index.tsx         # centre directory
  (tabs)/progress.tsx      # placeholder
  (tabs)/manoeuvres.tsx    # placeholder
  (tabs)/quiz.tsx          # placeholder
  centre/[id].tsx
  route/[id]/index.tsx     # route detail
  route/[id]/practice.tsx
  route/[id]/mock.tsx
  route/[id]/result.tsx
src/
  lib/geo.ts               # pure geometry helpers (shared with seed scripts)
  lib/instructions.ts      # derive + trigger voice instructions
  lib/scoring/engine.ts    # mock-test fault detection + aggregation
  lib/supabase.ts          # client with SecureStore auth storage
  types/db.ts              # row + JSON types
  services/cache.ts        # cachedFetch + outbox primitives
  services/centresRepo.ts
  services/routesRepo.ts
  services/progressRepo.ts
  services/favouritesRepo.ts
  stores/sessionStore.ts
  stores/networkStore.ts
  stores/mockTestStore.ts
  ui/theme.ts              # colour/token constants
  ui/Button.tsx  ui/Card.tsx  ui/SegmentedControl.tsx
  ui/Skeleton.tsx  ui/OfflineBanner.tsx  ui/DifficultyPips.tsx
scripts/seed/
  centres.json             # 40 real DVSA centres
  osrm.ts                  # OSRM fetch wrapper
  derive.ts                # pure derivations (difficulty, hazards, zones, bands)
  generate.ts              # orchestrator → writes supabase/seed.sql
supabase/
  schema.sql               # user schema + Phase-1 deltas
  seed.sql                 # generated (committed)
__tests__/ …               # colocated *.test.ts next to each lib/service/store
```

---

### Task 1: Scaffold Expo app + toolchain

**Files:**
- Create: entire Expo project in repo root (template), `tailwind.config.js`, `global.css`, `metro.config.js`, `babel.config.js`, `nativewind-env.d.ts`, `.env.example`, jest config in `package.json`
- Modify: `app.json`, `.gitignore`, `tsconfig.json`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: bootable Expo Router app; NativeWind classes work; `npm test` runs jest-expo; Tailwind tokens `primary/accent/accent-pressed/warning/surface/card/danger` available to all later tasks.

- [ ] **Step 1: Scaffold into a temp dir and move into repo root** (create-expo-app refuses non-empty dirs; `docs/` and `.git` already exist)

```powershell
npx create-expo-app@latest routeready-tmp --template default
robocopy routeready-tmp . /E /MOVE /XF README.md
Remove-Item -Recurse -Force routeready-tmp -ErrorAction SilentlyContinue
npm run reset-project   # answer: delete example files (creates blank app/ dir)
Remove-Item -Recurse -Force app-example -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Install dependencies**

```powershell
npx expo install react-native-maps @react-native-async-storage/async-storage expo-secure-store expo-speech expo-location expo-haptics expo-font @react-native-community/netinfo react-native-svg expo-linear-gradient react-native-gesture-handler react-native-reanimated react-native-safe-area-context
npm install nativewind zustand @supabase/supabase-js react-native-url-polyfill @gorhom/bottom-sheet react-native-gifted-charts @expo-google-fonts/inter
npm install -D tailwindcss@^3.4 jest jest-expo @testing-library/react-native @types/jest tsx
```

- [ ] **Step 3: Configure NativeWind**

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#0F172A",
        accent: { DEFAULT: "#059669", pressed: "#047857" },
        warning: "#D97706",
        surface: "#F8FAFC",
        card: "#FFFFFF",
        danger: "#DC2626",
      },
    },
  },
};
```

`global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```
(Reanimated's babel plugin is bundled in `babel-preset-expo` on SDK 52 — do not add it again.)

`metro.config.js`:
```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: "./global.css" });
```

`nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 4: App config, env, jest**

`app.json` — set inside `expo`:
```json
{
  "name": "RouteReady",
  "slug": "routeready",
  "scheme": "routeready",
  "ios": {
    "bundleIdentifier": "com.routeready.app",
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "RouteReady uses your location to guide you along practice routes and score mock tests."
    }
  }
}
```

`.env.example` (commit; copy to `.env` locally and fill in):
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Append to `.gitignore`:
```
.env
```

Add to `package.json`:
```json
"scripts": { "test": "jest", "seed": "tsx scripts/seed/generate.ts" },
"jest": {
  "preset": "jest-expo",
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|zustand|@supabase/.*|@gorhom/.*|react-native-gifted-charts|gifted-charts-core|react-native-linear-gradient|react-native-url-polyfill)/)"
  ]
}
```

`tsconfig.json` — ensure `"strict": true` and add path alias:
```json
"compilerOptions": { "strict": true, "baseUrl": ".", "paths": { "@/*": ["src/*"] } }
```

- [ ] **Step 5: Smoke-verify toolchain**

Create `src/lib/__tests__/smoke.test.ts`:
```ts
test("jest runs", () => expect(1 + 1).toBe(2));
```
Run: `npm test` → PASS. Run: `npx tsc --noEmit` → no errors. Run: `npx expo-doctor` → all checks pass (warnings about app icons are acceptable). Start `npx expo start` and confirm the blank index screen loads in Expo Go on the iPhone.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "chore: scaffold Expo SDK 52 app with NativeWind, jest, and project toolchain"
```

---

### Task 2: Design tokens + UI primitives

**Files:**
- Create: `src/ui/theme.ts`, `src/ui/Button.tsx`, `src/ui/Card.tsx`, `src/ui/SegmentedControl.tsx`, `src/ui/Skeleton.tsx`, `src/ui/OfflineBanner.tsx`, `src/ui/DifficultyPips.tsx`
- Test: `src/ui/__tests__/ui.test.tsx`

**Interfaces:**
- Consumes: Tailwind tokens from Task 1.
- Produces: `colors` const; `<Button title onPress variant?: "go"|"dark"|"ghost"|"danger" disabled?>`; `<Card className?>{children}`; `<SegmentedControl options: string[] selectedIndex onChange(i)>`; `<Skeleton h w?>`; `<OfflineBanner visible>`; `<DifficultyPips level: 1|2|3|4|5>`.

- [ ] **Step 1: Write failing tests**

`src/ui/__tests__/ui.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { DifficultyPips } from "../DifficultyPips";

test("Button fires onPress and renders title", () => {
  const onPress = jest.fn();
  render(<Button title="Start practice" onPress={onPress} />);
  fireEvent.press(screen.getByText("Start practice"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("Button disabled does not fire", () => {
  const onPress = jest.fn();
  render(<Button title="Go" onPress={onPress} disabled />);
  fireEvent.press(screen.getByText("Go"));
  expect(onPress).not.toHaveBeenCalled();
});

test("SegmentedControl selects segment", () => {
  const onChange = jest.fn();
  render(
    <SegmentedControl options={["Nearest", "Pass rate"]} selectedIndex={0} onChange={onChange} />
  );
  fireEvent.press(screen.getByText("Pass rate"));
  expect(onChange).toHaveBeenCalledWith(1);
});

test("DifficultyPips renders 5 pips with level filled", () => {
  render(<DifficultyPips level={3} />);
  expect(screen.getAllByTestId(/^pip/)).toHaveLength(5);
  expect(screen.getAllByTestId("pip-filled")).toHaveLength(3);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- ui.test` → FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/ui/theme.ts`:
```ts
export const colors = {
  primary: "#0F172A",
  accent: "#059669",
  accentPressed: "#047857",
  warning: "#D97706",
  surface: "#F8FAFC",
  card: "#FFFFFF",
  danger: "#DC2626",
  ink2: "#475569",
  ink3: "#64748B",
  line: "#E2E8F0",
} as const;
```

`src/ui/Button.tsx`:
```tsx
import { Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";

const bg = {
  go: "bg-accent",
  dark: "bg-primary",
  ghost: "bg-transparent border-[1.5px] border-slate-200",
  danger: "bg-danger",
} as const;
const fg = { go: "text-white", dark: "text-white", ghost: "text-primary", danger: "text-white" } as const;

export function Button({
  title, onPress, variant = "go", disabled = false, haptic = false,
}: {
  title: string; onPress: () => void; variant?: keyof typeof bg; disabled?: boolean; haptic?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={`min-h-[48px] items-center justify-center rounded-full px-6 py-3 ${bg[variant]} ${disabled ? "opacity-40" : ""} active:scale-[0.97] ${variant === "go" ? "active:bg-accent-pressed" : ""}`}
    >
      <Text className={`font-semibold text-[15px] ${fg[variant]}`}>{title}</Text>
    </Pressable>
  );
}
```

`src/ui/Card.tsx`:
```tsx
import { View, ViewProps } from "react-native";

export function Card({ className = "", style, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-xl bg-card p-4 ${className}`}
      style={[{ shadowColor: "#0F172A", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, style]}
      {...rest}
    />
  );
}
```

`src/ui/SegmentedControl.tsx` (flush iOS style — the agreed look):
```tsx
import { Pressable, Text, View } from "react-native";

export function SegmentedControl({
  options, selectedIndex, onChange,
}: { options: string[]; selectedIndex: number; onChange: (i: number) => void }) {
  return (
    <View className="flex-row rounded-[9px] bg-slate-200/70 p-[2px]">
      {options.map((label, i) => (
        <Pressable
          key={label}
          onPress={() => onChange(i)}
          hitSlop={{ top: 8, bottom: 8 }}
          className={`min-h-[32px] flex-1 items-center justify-center rounded-[7px] ${i === selectedIndex ? "bg-card" : ""}`}
          style={i === selectedIndex ? { shadowColor: "#0F172A", shadowOpacity: 0.14, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 } } : undefined}
        >
          <Text className={`text-[12px] font-semibold ${i === selectedIndex ? "text-primary" : "text-slate-500"}`}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
```

`src/ui/Skeleton.tsx`:
```tsx
import { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

export function Skeleton({ h, w = "100%" }: { h: number; w?: number | `${number}%` }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ height: h, width: w, borderRadius: 12, backgroundColor: "#E2E8F0" }, style]} />;
}
```

`src/ui/OfflineBanner.tsx`:
```tsx
import { Text, View } from "react-native";

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View className="mx-4 mb-2 rounded-lg bg-warning/10 px-3 py-2">
      <Text className="text-[12px] font-semibold text-warning">Offline — showing saved data</Text>
    </View>
  );
}
```

`src/ui/DifficultyPips.tsx`:
```tsx
import { View } from "react-native";

export function DifficultyPips({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <View className="flex-row gap-[3px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          testID={i <= level ? "pip-filled" : "pip"}
          className={`h-[5px] w-3 rounded-full ${i <= level ? "bg-accent" : "bg-slate-200"}`}
        />
      ))}
    </View>
  );
}
```
(Filled pips carry `testID="pip-filled"`, unfilled `testID="pip"`; the test's regex `/^pip/` matches both, so all 5 are counted.)

- [ ] **Step 4: Run tests** — `npm test -- ui.test` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: design-system UI primitives (Button, Card, SegmentedControl, Skeleton, banners, pips)"`

---

### Task 3: Shared geometry library (pure, TDD)

**Files:**
- Create: `src/lib/geo.ts`
- Test: `src/lib/__tests__/geo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact signatures — used by seed derivations, instructions, scoring):
```ts
export type LatLng = { lat: number; lng: number };
export function haversineM(a: LatLng, b: LatLng): number;
export function bearingDeg(a: LatLng, b: LatLng): number;          // 0–360
export function turnAngleDeg(prev: number, next: number): number;  // signed −180..180 (+ = right)
export function cumulativeM(coords: LatLng[]): number[];           // running distance per vertex
export function nearestVertex(coords: LatLng[], p: LatLng): { idx: number; distM: number };
export function isInZone(p: LatLng, zone: { lat: number; lng: number; radiusM: number }): boolean;
export function mpsToMph(mps: number): number;
export function bandSpeedMph(mps: number): 20 | 30 | 40 | 60 | 70; // nearest UK limit ≥ observed band
```

- [ ] **Step 1: Write failing tests**

`src/lib/__tests__/geo.test.ts`:
```ts
import { bandSpeedMph, bearingDeg, cumulativeM, haversineM, isInZone, mpsToMph, nearestVertex, turnAngleDeg } from "../geo";

const london = { lat: 51.5074, lng: -0.1278 };
const birmingham = { lat: 52.4862, lng: -1.8904 };

test("haversineM London-Birmingham ≈ 163 km", () => {
  expect(haversineM(london, birmingham)).toBeGreaterThan(160_000);
  expect(haversineM(london, birmingham)).toBeLessThan(166_000);
});

test("bearingDeg due north is ~0, due east is ~90", () => {
  expect(bearingDeg(london, { ...london, lat: london.lat + 0.01 })).toBeCloseTo(0, 0);
  expect(bearingDeg(london, { ...london, lng: london.lng + 0.01 })).toBeCloseTo(90, 0);
});

test("turnAngleDeg wraps correctly", () => {
  expect(turnAngleDeg(350, 10)).toBe(20);   // right across north
  expect(turnAngleDeg(10, 350)).toBe(-20);  // left across north
  expect(turnAngleDeg(90, 180)).toBe(90);
});

test("cumulativeM starts at 0 and increases", () => {
  const c = cumulativeM([london, { ...london, lat: london.lat + 0.01 }, { ...london, lat: london.lat + 0.02 }]);
  expect(c[0]).toBe(0);
  expect(c[1]).toBeCloseTo(1112, -1);
  expect(c[2]).toBeCloseTo(2224, -1);
});

test("nearestVertex finds closest point", () => {
  const line = [london, { lat: 51.52, lng: -0.1278 }, { lat: 51.53, lng: -0.1278 }];
  const r = nearestVertex(line, { lat: 51.5205, lng: -0.128 });
  expect(r.idx).toBe(1);
  expect(r.distM).toBeLessThan(100);
});

test("isInZone respects radius", () => {
  expect(isInZone(london, { ...london, radiusM: 50 })).toBe(true);
  expect(isInZone(birmingham, { ...london, radiusM: 50 })).toBe(false);
});

test("speed conversions and banding", () => {
  expect(mpsToMph(13.4112)).toBeCloseTo(30, 1);
  expect(bandSpeedMph(8)).toBe(20);    // 17.9 mph → 20 band
  expect(bandSpeedMph(12.5)).toBe(30); // 28 mph → 30
  expect(bandSpeedMph(16)).toBe(40);   // 35.8 mph → 40
  expect(bandSpeedMph(24)).toBe(60);   // 53.7 mph → 60
  expect(bandSpeedMph(31)).toBe(70);   // 69.3 mph → 70
});
```

- [ ] **Step 2: Run** — `npm test -- geo.test` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/geo.ts`**

```ts
export type LatLng = { lat: number; lng: number };
const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function turnAngleDeg(prev: number, next: number): number {
  let d = next - prev;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function cumulativeM(coords: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]));
  return out;
}

export function nearestVertex(coords: LatLng[], p: LatLng): { idx: number; distM: number } {
  let idx = 0;
  let distM = Infinity;
  coords.forEach((c, i) => {
    const d = haversineM(c, p);
    if (d < distM) { distM = d; idx = i; }
  });
  return { idx, distM };
}

export function isInZone(p: LatLng, zone: { lat: number; lng: number; radiusM: number }): boolean {
  return haversineM(p, zone) <= zone.radiusM;
}

export function mpsToMph(mps: number): number {
  return mps * 2.23694;
}

const BANDS = [20, 30, 40, 60, 70] as const;
export function bandSpeedMph(mps: number): (typeof BANDS)[number] {
  const mph = mpsToMph(mps);
  for (const b of BANDS) if (mph <= b + 2) return b;
  return 70;
}
```

- [ ] **Step 4: Run** — `npm test -- geo.test` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: shared geometry library with tests"`

---

### Task 4: Supabase schema + client + DB types

**Files:**
- Create: `supabase/schema.sql`, `src/lib/supabase.ts`, `src/types/db.ts`

**Interfaces:**
- Consumes: `.env` values from Task 1.
- Produces: `supabase` client singleton; row types `Centre`, `Route`, `Hazard`, `ProgressEntry`, `SpeedProfileSegment`, `ObservationZone` used by every repo and screen.

- [ ] **Step 1: Write `supabase/schema.sql`** — the spec's SQL (test_centres, routes, hazards, user_progress, manoeuvres, show_me_tell_me, RLS policies) **verbatim from the spec section 5 / user brief**, plus these Phase-1 deltas appended:

```sql
-- Phase 1 deltas
alter table test_centres add column if not exists pass_rate_history jsonb default '[]';
alter table routes add column if not exists speed_profile jsonb default '[]';
alter table routes add column if not exists observation_zones jsonb default '[]';

create table if not exists favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, route_id)
);
alter table favourites enable row level security;
create policy "Own favourites" on favourites
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Write `src/types/db.ts`**

```ts
export type SpeedProfileSegment = { startIdx: number; endIdx: number; limitMph: 20 | 30 | 40 | 60 | 70 };
export type ObservationZone = { lat: number; lng: number; radiusM: number; kind: "roundabout" | "junction" | "pedestrian" };
export type GeoLineString = { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]

export type Centre = {
  id: string; name: string; address: string; lat: number; lng: number;
  pass_rate: number | null; pass_rate_history: number[]; test_types: string[]; region: string | null;
};
export type Route = {
  id: string; centre_id: string; name: string; geometry: GeoLineString;
  estimated_minutes: number | null; distance_km: number | null; difficulty: 1 | 2 | 3 | 4 | 5;
  speed_profile: SpeedProfileSegment[]; observation_zones: ObservationZone[];
};
export type Hazard = {
  id: string; route_id: string; lat: number; lng: number;
  type: "roundabout" | "zebra" | "narrow" | "junction"; description: string;
  severity: "low" | "medium" | "high";
};
export type ProgressEntry = {
  id?: string; user_id: string; route_id: string; completed_at?: string;
  mock_test_score: number | null; mistakes: string[]; duration_seconds: number;
};
```

- [ ] **Step 3: Write `src/lib/supabase.ts`**

```ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  }
);
```

- [ ] **Step 4: Verify + hand off to user** — `npx tsc --noEmit` → clean. **USER ACTION:** create the Supabase project, run `supabase/schema.sql` in the SQL Editor, and put URL + anon key in `.env`. (Seed data comes in Task 5.)

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: supabase schema with Phase-1 deltas, client, and DB types"`

---

### Task 5: Seed pipeline — 40 centres, OSRM road-snapped routes, seed.sql

**Files:**
- Create: `scripts/seed/centres.json`, `scripts/seed/osrm.ts`, `scripts/seed/derive.ts`, `scripts/seed/generate.ts`
- Test: `scripts/seed/__tests__/derive.test.ts`
- Output (committed): `supabase/seed.sql`

**Interfaces:**
- Consumes: `src/lib/geo.ts` (haversineM, bearingDeg, turnAngleDeg, cumulativeM, bandSpeedMph, LatLng).
- Produces: `supabase/seed.sql` inserting 40 centres, 3 routes each (120 routes), hazards, observation zones, 18 show_me_tell_me rows, 4 manoeuvres. Derivation functions:
```ts
// derive.ts
export function detectTurnPoints(coords: LatLng[], minAngle?: number): { idx: number; angle: number }[];
export function deriveDifficulty(distanceKm: number, turnCount: number): 1 | 2 | 3 | 4 | 5;
export function deriveSpeedProfile(speedsMps: (number | null)[]): SpeedProfileSegment[];
export function deriveHazards(coords: LatLng[]): { lat: number; lng: number; type: string; description: string; severity: string }[];
export function deriveObservationZones(coords: LatLng[]): ObservationZone[];
export function derivePassHistory(passRate: number, seedIdx: number): number[]; // 8 quarters, deterministic
```

- [ ] **Step 1: Write `scripts/seed/centres.json`** — 40 real DVSA centres with realistic coordinates and pass rates. Format per entry: `{ "name", "address", "lat", "lng", "pass_rate", "region", "test_types": ["manual","auto"] }`. Include: Mill Hill (London), Hendon, Barnet, Wood Green, Enfield, Tottenham, Chingford, Wanstead, Goodmayes, Hornchurch, Loughton, Borehamwood, Watford, St Albans, Luton, Slough, Uxbridge, Pinner, Isleworth, Tolworth, Croydon, Mitcham, Sidcup, Bexleyheath, Erith, Birmingham (Garretts Green), Birmingham (Kings Heath), Birmingham (Kingstanding), Wolverhampton, Coventry, Leicester (Wigston), Nottingham (Colwick), Derby, Sheffield (Handsworth), Leeds (Horsforth), Bradford (Heaton), Manchester (Cheetham Hill), Manchester (Sale), Liverpool (Norris Green), Newcastle. Pass rates 34–58%, urban London lowest, suburban highest. (Implementer: coordinates to 4 dp from public DVSA addresses; exactness beyond street level is not required.)

- [ ] **Step 2: Write failing tests for derivations**

`scripts/seed/__tests__/derive.test.ts`:
```ts
import { deriveDifficulty, derivePassHistory, deriveSpeedProfile, detectTurnPoints } from "../derive";

// L-shaped path: sharp 90° right turn at vertex 2
const elbow = [
  { lat: 51.5, lng: -0.1 }, { lat: 51.51, lng: -0.1 }, { lat: 51.52, lng: -0.1 },
  { lat: 51.52, lng: -0.09 }, { lat: 51.52, lng: -0.08 },
];

test("detectTurnPoints finds the elbow", () => {
  const turns = detectTurnPoints(elbow, 45);
  expect(turns).toHaveLength(1);
  expect(turns[0].idx).toBe(2);
  expect(Math.abs(turns[0].angle)).toBeGreaterThan(80);
});

test("deriveDifficulty scales with turns and distance", () => {
  expect(deriveDifficulty(4, 2)).toBe(1);
  expect(deriveDifficulty(6, 8)).toBeGreaterThanOrEqual(2);
  expect(deriveDifficulty(9, 20)).toBe(5);
});

test("deriveSpeedProfile groups contiguous bands", () => {
  const profile = deriveSpeedProfile([12, 12.5, 12, 25, 26, 25.5]); // 30-band ×3 then 60-band ×3
  expect(profile).toEqual([
    { startIdx: 0, endIdx: 2, limitMph: 30 },
    { startIdx: 3, endIdx: 5, limitMph: 60 },
  ]);
});

test("derivePassHistory is deterministic, 8 entries, near pass_rate", () => {
  const h1 = derivePassHistory(45, 3);
  expect(h1).toHaveLength(8);
  expect(h1).toEqual(derivePassHistory(45, 3));
  h1.forEach((v) => { expect(v).toBeGreaterThan(35); expect(v).toBeLessThan(55); });
});
```

- [ ] **Step 3: Run** — `npm test -- derive.test` → FAIL.

- [ ] **Step 4: Implement `scripts/seed/derive.ts`**

```ts
import { bearingDeg, cumulativeM, bandSpeedMph, LatLng } from "../../src/lib/geo";
import type { ObservationZone, SpeedProfileSegment } from "../../src/types/db";

export function detectTurnPoints(coords: LatLng[], minAngle = 45): { idx: number; angle: number }[] {
  const out: { idx: number; angle: number }[] = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const b1 = bearingDeg(coords[i - 1], coords[i]);
    const b2 = bearingDeg(coords[i], coords[i + 1]);
    let d = b2 - b1;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) >= minAngle) out.push({ idx: i, angle: d });
  }
  return out;
}

export function deriveDifficulty(distanceKm: number, turnCount: number): 1 | 2 | 3 | 4 | 5 {
  const score = distanceKm * 0.3 + turnCount * 0.35;
  if (score < 2) return 1;
  if (score < 4) return 2;
  if (score < 6) return 3;
  if (score < 8.5) return 4;
  return 5;
}

export function deriveSpeedProfile(speedsMps: (number | null)[]): SpeedProfileSegment[] {
  const out: SpeedProfileSegment[] = [];
  let start = 0;
  let band = bandSpeedMph(speedsMps[0] ?? 12);
  for (let i = 1; i <= speedsMps.length; i++) {
    const b = i < speedsMps.length ? bandSpeedMph(speedsMps[i] ?? 12) : null;
    if (b !== band) {
      out.push({ startIdx: start, endIdx: i - 1, limitMph: band });
      if (b !== null) { start = i; band = b; }
    }
  }
  return out;
}

const HAZARD_TYPES = ["junction", "roundabout", "zebra", "narrow"] as const;
const DESCRIPTIONS: Record<(typeof HAZARD_TYPES)[number], string> = {
  junction: "Tight junction — position early and check both mirrors before turning.",
  roundabout: "Busy roundabout — mirror-signal-position on approach, watch lane discipline on exit.",
  zebra: "Pedestrian crossing — scan pavements early and be ready to stop smoothly.",
  narrow: "Narrow section with parked cars — hold back and give way where the obstruction is on your side.",
};

export function deriveHazards(coords: LatLng[]) {
  return detectTurnPoints(coords, 60)
    .slice(0, 4)
    .map((t, i) => {
      const type = HAZARD_TYPES[i % HAZARD_TYPES.length];
      return {
        lat: coords[t.idx].lat, lng: coords[t.idx].lng, type,
        description: DESCRIPTIONS[type],
        severity: Math.abs(t.angle) > 100 ? "high" : i % 2 === 0 ? "medium" : "low",
      };
    });
}

export function deriveObservationZones(coords: LatLng[]): ObservationZone[] {
  return detectTurnPoints(coords, 60)
    .slice(0, 4)
    .map((t, i) => ({
      lat: coords[t.idx].lat, lng: coords[t.idx].lng, radiusM: 60,
      kind: i % 2 === 0 ? "roundabout" : "junction",
    }));
}

export function derivePassHistory(passRate: number, seedIdx: number): number[] {
  const out: number[] = [];
  for (let q = 0; q < 8; q++) {
    const wobble = Math.sin(seedIdx * 3.7 + q * 1.3) * 4;
    out.push(Math.round((passRate + wobble) * 10) / 10);
  }
  return out;
}
```

- [ ] **Step 5: Run** — `npm test -- derive.test` → PASS.

- [ ] **Step 6: Implement OSRM fetch + generator**

`scripts/seed/osrm.ts`:
```ts
import type { LatLng } from "../../src/lib/geo";

export type OsrmRoute = {
  coords: LatLng[];            // decoded geometry
  distanceM: number;
  durationS: number;
  speedsMps: (number | null)[]; // per geometry edge, from annotations
};

export async function fetchRoute(waypoints: LatLng[]): Promise<OsrmRoute> {
  const path = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&annotations=speed&steps=false`;
  const res = await fetch(url, { headers: { "User-Agent": "routeready-seed/1.0" } });
  if (!res.ok) throw new Error(`OSRM ${res.status} for ${path}`);
  const json = (await res.json()) as any;
  if (json.code !== "Ok" || !json.routes?.length) throw new Error(`OSRM no route: ${json.code}`);
  const r = json.routes[0];
  return {
    coords: r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceM: r.distance,
    durationS: r.duration,
    speedsMps: r.legs.flatMap((l: any) => l.annotation.speed as (number | null)[]),
  };
}
```

`scripts/seed/generate.ts` (orchestrator — run with `npm run seed`):
```ts
import { writeFileSync } from "node:fs";
import centres from "./centres.json";
import { fetchRoute } from "./osrm";
import { derivePassHistory, deriveDifficulty, deriveHazards, deriveObservationZones, deriveSpeedProfile } from "./derive";
import type { LatLng } from "../../src/lib/geo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/'/g, "''");
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

// 3 loops per centre: out-and-back triangles at different bearings/radii
function waypointSets(c: { lat: number; lng: number }): LatLng[][] {
  const ring = (bearing: number, km: number): LatLng => ({
    lat: c.lat + (km / 111) * Math.cos((bearing * Math.PI) / 180),
    lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((bearing * Math.PI) / 180),
  });
  return [
    [c, ring(30, 1.6), ring(120, 1.9), c],
    [c, ring(200, 2.2), ring(280, 1.7), c],
    [c, ring(330, 2.5), ring(60, 2.1), c],
  ];
}

const ROUTE_NAMES = ["Town loop", "Residential circuit", "Main-road run"];

async function main() {
  const lines: string[] = ["-- Generated by scripts/seed/generate.ts — do not edit by hand", "begin;"];
  for (let ci = 0; ci < centres.length; ci++) {
    const c = centres[ci];
    lines.push(
      `insert into test_centres (id, name, address, lat, lng, pass_rate, pass_rate_history, test_types, region) values ` +
      `(gen_random_uuid(), '${esc(c.name)}', '${esc(c.address)}', ${c.lat}, ${c.lng}, ${c.pass_rate}, ` +
      `${j(derivePassHistory(c.pass_rate, ci))}, '{${c.test_types.join(",")}}', '${esc(c.region)}');`
    );
    for (let ri = 0; ri < 3; ri++) {
      try {
        const r = await fetchRoute(waypointSets(c)[ri]);
        const geometry = { type: "LineString", coordinates: r.coords.map((p) => [p.lng, p.lat]) };
        const hazards = deriveHazards(r.coords);
        lines.push(
          `insert into routes (id, centre_id, name, geometry, estimated_minutes, distance_km, difficulty, speed_profile, observation_zones) ` +
          `select gen_random_uuid(), id, '${esc(`Route ${ri + 1} · ${ROUTE_NAMES[ri]}`)}', ${j(geometry)}, ` +
          `${Math.round((r.durationS / 60) * 1.15)}, ${(r.distanceM / 1000).toFixed(2)}, ` +
          `${deriveDifficulty(r.distanceM / 1000, hazards.length * 2)}, ${j(deriveSpeedProfile(r.speedsMps))}, ` +
          `${j(deriveObservationZones(r.coords))} from test_centres where name = '${esc(c.name)}';`
        );
        for (const h of hazards) {
          lines.push(
            `insert into hazards (id, route_id, lat, lng, type, description, severity) ` +
            `select gen_random_uuid(), id, ${h.lat}, ${h.lng}, '${h.type}', '${esc(h.description)}', '${h.severity}' ` +
            `from routes where name = '${esc(`Route ${ri + 1} · ${ROUTE_NAMES[ri]}`)}' and centre_id = (select id from test_centres where name = '${esc(c.name)}');`
          );
        }
        console.log(`ok: ${c.name} route ${ri + 1} (${(r.distanceM / 1000).toFixed(1)} km)`);
      } catch (e) {
        console.warn(`SKIP ${c.name} route ${ri + 1}: ${(e as Error).message}`);
      }
      await sleep(700); // be polite to the public OSRM server
    }
  }
  lines.push(SHOW_ME_TELL_ME_SQL, MANOEUVRES_SQL, "commit;");
  writeFileSync("supabase/seed.sql", lines.join("\n"));
  console.log("wrote supabase/seed.sql");
}
main();
```

`SHOW_ME_TELL_ME_SQL` and `MANOEUVRES_SQL` are template-string constants in the same file containing insert statements for the 18 official DVSA "show me / tell me" questions (categories: `under_bonnet`, `inside_car`, `safety`; `is_show_me` true for the 7 "show me" questions — tyres, horn, demister, lights, brakes check, washers, headlight/fog controls; false for the 11 "tell me" questions — brakes test, tyre pressures, head restraint, tyre tread, headlights use, ABS warning, direction indicators, brake lights, power steering, fog lights, oil/coolant/brake-fluid checks) and the 4 manoeuvres (`Parallel park`, `Bay park (reverse)`, `Forward bay park`, `Pull up on the right`) each with a 5–6 step `steps` jsonb array (`{ "title", "detail" }`) and 3 tips. The implementer writes the question/answer text from the official DVSA list (gov.uk "Driving test: cars — show me, tell me questions"); answers ≤ 2 sentences.

- [ ] **Step 7: Run the pipeline** — `npm run seed` (takes ~2–3 min for 120 OSRM calls). Expected: `wrote supabase/seed.sql`, ≥ 100 routes generated (some SKIPs are fine — a centre keeps whatever routes succeeded). Spot-check `supabase/seed.sql`: geometry arrays present, no `undefined`, jsonb quoting valid.

- [ ] **Step 8: USER ACTION + verify** — user runs `seed.sql` in Supabase SQL Editor. Verify in Supabase: `select count(*) from routes;` ≥ 100; `select count(*) from show_me_tell_me;` = 18.

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat: seed pipeline with OSRM road-snapped routes and generated seed.sql"`

---

### Task 6: Auth — session store, sign-in/up screens, root gate, magic link

**Files:**
- Create: `src/stores/sessionStore.ts`, `app/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` (placeholder for now), `app/(tabs)/progress.tsx`, `app/(tabs)/manoeuvres.tsx`, `app/(tabs)/quiz.tsx` (placeholders)
- Test: `src/stores/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: `supabase` from Task 4; `Button`, `colors` from Task 2.
- Produces:
```ts
// sessionStore.ts
export const useSession: UseBoundStore<StoreApi<{
  session: Session | null;
  initialized: boolean;
  init: () => Promise<void>;                       // getSession + onAuthStateChange subscription
  signIn: (email: string, password: string) => Promise<string | null>;   // null = ok, string = error msg
  signUp: (email: string, password: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}>>;
```
Placeholders for tabs render a centred screen title; the centres tab is replaced in Task 8.

- [ ] **Step 1: Write failing store tests**

`src/stores/__tests__/sessionStore.test.ts`:
```ts
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));
import { supabase } from "@/lib/supabase";
import { useSession } from "../sessionStore";

test("init loads session and marks initialized", async () => {
  await useSession.getState().init();
  expect(useSession.getState().initialized).toBe(true);
  expect(useSession.getState().session).toBeNull();
});

test("signIn returns null on success, message on failure", async () => {
  (supabase.auth.signInWithPassword as jest.Mock)
    .mockResolvedValueOnce({ data: { session: { user: {} } }, error: null })
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Invalid login credentials" } });
  expect(await useSession.getState().signIn("a@b.com", "pw")).toBeNull();
  expect(await useSession.getState().signIn("a@b.com", "bad")).toBe("Invalid login credentials");
});

test("sendMagicLink passes redirect", async () => {
  (supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null });
  await useSession.getState().sendMagicLink("a@b.com");
  expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "a@b.com",
    options: { emailRedirectTo: "routeready://auth-callback" },
  });
});
```
(Jest needs the `@/` alias: add to the `jest` block in `package.json`: `"moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" }`.)

- [ ] **Step 2: Run** — `npm test -- sessionStore` → FAIL.

- [ ] **Step 3: Implement `src/stores/sessionStore.ts`**

```ts
import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type SessionState = {
  session: Session | null;
  initialized: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  session: null,
  initialized: false,
  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, initialized: true });
    supabase.auth.onAuthStateChange((_event, session) => set({ session }));
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  },
  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  },
  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "routeready://auth-callback" },
    });
    return error ? error.message : null;
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
```

- [ ] **Step 4: Run** — `npm test -- sessionStore` → PASS.

- [ ] **Step 5: Root layout with font loading + auth gate**

`app/_layout.tsx`:
```tsx
import "../global.css";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { View } from "react-native";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/stores/sessionStore";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const { session, initialized, init } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { init(); }, [init]);

  // Magic-link deep link: routeready://auth-callback#access_token=…&refresh_token=…
  useEffect(() => {
    const handle = async ({ url }: { url: string }) => {
      const params = new URLSearchParams(url.split("#")[1] ?? "");
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
    };
    const sub = Linking.addEventListener("url", handle);
    Linking.getInitialURL().then((url) => url && handle({ url }));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/sign-in");
    if (session && inAuth) router.replace("/(tabs)");
  }, [session, initialized, segments, router]);

  if (!fontsLoaded || !initialized) return <View className="flex-1 bg-surface" />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F8FAFC" } }} />
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 6: Auth screens**

`app/(auth)/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`app/(auth)/sign-in.tsx`:
```tsx
import { useState } from "react";
import { Link } from "expo-router";
import { KeyboardAvoidingView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button } from "@/ui/Button";
import { useSession } from "@/stores/sessionStore";

export default function SignIn() {
  const { signIn, sendMagicLink } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-center gap-3 px-4">
        <View className="mb-2 items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-accent">
            <Ionicons name="car-sport" size={30} color="#fff" />
          </View>
          <Text className="text-[26px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>RouteReady</Text>
          <Text className="text-[13px] text-slate-500">Practise real DVSA test routes</Text>
        </View>
        <TextInput
          className="rounded-lg border border-slate-200 bg-card px-3 py-3 text-[14px]"
          placeholder="Email address" autoCapitalize="none" keyboardType="email-address"
          value={email} onChangeText={setEmail}
        />
        <TextInput
          className="rounded-lg border border-slate-200 bg-card px-3 py-3 text-[14px]"
          placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}
        />
        {error && <Text className="text-[12px] font-semibold text-danger">{error}</Text>}
        {notice && <Text className="text-[12px] font-semibold text-accent">{notice}</Text>}
        <Button title={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={async () => {
          setBusy(true); setError(null);
          const err = await signIn(email.trim(), password);
          if (err) setError(err);
          setBusy(false);
        }} />
        <Button variant="ghost" title="Email me a magic link" disabled={busy || !email} onPress={async () => {
          setError(null);
          const err = await sendMagicLink(email.trim());
          err ? setError(err) : setNotice("Check your email for the sign-in link.");
        }} />
        <Text className="text-center text-[12px] text-slate-500">
          New here? <Link href="/(auth)/sign-up" className="font-semibold text-accent">Create an account</Link>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

`app/(auth)/sign-up.tsx` — same layout: email, password, confirm-password inputs; validates `password === confirm` (inline error `"Passwords don't match"`) and length ≥ 8 (`"Password must be at least 8 characters"`); calls `signUp`; on success shows notice `"Account created — check your email to confirm, then sign in."`; link back to `/(auth)/sign-in`. Reuse the exact input/Button/error patterns from sign-in above.

- [ ] **Step 7: Tabs shell + placeholders**

`app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: "#059669",
      tabBarInactiveTintColor: "#94A3B8",
      tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Centres", tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="manoeuvres" options={{ title: "Manoeuvres", tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="quiz" options={{ title: "Quiz", tabBarIcon: ({ color, size }) => <Ionicons name="help-circle-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
```

Each placeholder (`progress.tsx`, `manoeuvres.tsx`, `quiz.tsx`, and for now `index.tsx`):
```tsx
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Progress() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center">
        <Text className="text-[15px] font-semibold text-slate-400">Coming in Phase 2</Text>
      </View>
    </SafeAreaView>
  );
}
```
(`index.tsx` placeholder text: `"Centres — Task 8"`.)

- [ ] **Step 8: Verify** — `npm test` all green; `npx tsc --noEmit` clean. Manual in Expo Go: app opens to sign-in; creating an account + signing in lands on tabs; kill/relaunch app stays signed in (SecureStore persistence); Supabase dashboard shows the user. **USER ACTION:** in Supabase Auth settings add `routeready://auth-callback` to the Redirect URLs allow-list (magic-link deep links land back in Expo Go via the `routeready` scheme only in dev builds; in Expo Go the link opens `exp://` — also add the `exp://…/--/auth-callback` URL printed by `npx expo start` if testing magic links in Expo Go).

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat: auth with session store, sign-in/up, root gate, magic-link deep linking"`

---

### Task 7: Data layer — cache-through repos, outbox, network store

**Files:**
- Create: `src/services/cache.ts`, `src/services/centresRepo.ts`, `src/services/routesRepo.ts`, `src/services/progressRepo.ts`, `src/services/favouritesRepo.ts`, `src/stores/networkStore.ts`
- Test: `src/services/__tests__/cache.test.ts`, `src/services/__tests__/repos.test.ts`

**Interfaces:**
- Consumes: `supabase` (Task 4), types from `src/types/db.ts`.
- Produces:
```ts
// cache.ts
export type Cached<T> = { data: T; stale: boolean };
export function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>>;
export function enqueue(key: "progress_outbox", item: unknown): Promise<void>;
export function drainQueue<T>(key: "progress_outbox", send: (item: T) => Promise<void>): Promise<number>; // returns flushed count
// centresRepo.ts
export function listCentres(): Promise<Cached<Centre[]>>;
// routesRepo.ts
export function listRoutesByCentre(centreId: string): Promise<Cached<Route[]>>;
export function getRoute(routeId: string): Promise<Cached<{ route: Route; hazards: Hazard[] }>>;
// progressRepo.ts
export function saveProgress(entry: Omit<ProgressEntry, "user_id">): Promise<void>; // adds user, outbox on failure
export function flushProgress(): Promise<number>;
// favouritesRepo.ts
export function listFavouriteRouteIds(): Promise<string[]>;
export function toggleFavourite(routeId: string): Promise<void>;
// networkStore.ts
export const useNetwork: /* zustand */ { online: boolean; init: () => void };  // init subscribes NetInfo; on reconnect calls flushProgress()
```

- [ ] **Step 1: Write failing cache tests**

`src/services/__tests__/cache.test.ts`:
```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachedFetch, drainQueue, enqueue } from "../cache";

beforeEach(() => AsyncStorage.clear());

test("success path returns fresh data and caches it", async () => {
  const r = await cachedFetch("k", async () => [1, 2]);
  expect(r).toEqual({ data: [1, 2], stale: false });
  expect(JSON.parse((await AsyncStorage.getItem("cache:k"))!)).toEqual([1, 2]);
});

test("failure path serves cached copy as stale", async () => {
  await cachedFetch("k", async () => ["cached"]);
  const r = await cachedFetch("k", async () => { throw new Error("net down"); });
  expect(r).toEqual({ data: ["cached"], stale: true });
});

test("failure with empty cache rethrows", async () => {
  await expect(cachedFetch("nope", async () => { throw new Error("net down"); })).rejects.toThrow("net down");
});

test("outbox enqueues and drains FIFO, keeping failures", async () => {
  await enqueue("progress_outbox", { a: 1 });
  await enqueue("progress_outbox", { a: 2 });
  const sent: unknown[] = [];
  const flushed = await drainQueue("progress_outbox", async (item) => { sent.push(item); });
  expect(flushed).toBe(2);
  expect(sent).toEqual([{ a: 1 }, { a: 2 }]);
  expect(await drainQueue("progress_outbox", async () => {})).toBe(0);
});
```
(`@react-native-async-storage/async-storage` ships an official jest mock; add to the `jest` block: `"setupFiles": ["./jest.setup.js"]` and create `jest.setup.js`: `jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));`)

- [ ] **Step 2: Run** — `npm test -- cache.test` → FAIL.

- [ ] **Step 3: Implement `src/services/cache.ts`**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Cached<T> = { data: T; stale: boolean };

export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
  try {
    const data = await fetcher();
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify(data));
    return { data, stale: false };
  } catch (e) {
    const raw = await AsyncStorage.getItem(`cache:${key}`);
    if (raw === null) throw e;
    return { data: JSON.parse(raw) as T, stale: true };
  }
}

export async function enqueue(key: "progress_outbox", item: unknown): Promise<void> {
  const raw = await AsyncStorage.getItem(`queue:${key}`);
  const q: unknown[] = raw ? JSON.parse(raw) : [];
  q.push(item);
  await AsyncStorage.setItem(`queue:${key}`, JSON.stringify(q));
}

export async function drainQueue<T>(key: "progress_outbox", send: (item: T) => Promise<void>): Promise<number> {
  const raw = await AsyncStorage.getItem(`queue:${key}`);
  const q: T[] = raw ? JSON.parse(raw) : [];
  const remaining: T[] = [];
  let flushed = 0;
  for (const item of q) {
    try { await send(item); flushed++; }
    catch { remaining.push(item); }
  }
  await AsyncStorage.setItem(`queue:${key}`, JSON.stringify(remaining));
  return flushed;
}
```

- [ ] **Step 4: Run** — `npm test -- cache.test` → PASS.

- [ ] **Step 5: Write failing repo tests**

`src/services/__tests__/repos.test.ts`:
```ts
const order = jest.fn();
const eq = jest.fn();
const single = jest.fn();
const insert = jest.fn();
const del = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order, eq: eq.mockReturnValue({ order, single }) })),
      insert,
      delete: del.mockReturnValue({ match: jest.fn().mockResolvedValue({ error: null }) }),
    })),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { listCentres } from "../centresRepo";
import { saveProgress, flushProgress } from "../progressRepo";

beforeEach(() => { jest.clearAllMocks(); return AsyncStorage.clear(); });

test("listCentres returns rows fresh", async () => {
  order.mockResolvedValue({ data: [{ id: "c1", name: "Mill Hill" }], error: null });
  const r = await listCentres();
  expect(r.stale).toBe(false);
  expect(r.data[0].name).toBe("Mill Hill");
});

test("listCentres serves stale cache when query fails", async () => {
  order.mockResolvedValueOnce({ data: [{ id: "c1", name: "Mill Hill" }], error: null });
  await listCentres();
  order.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  const r = await listCentres();
  expect(r.stale).toBe(true);
  expect(r.data[0].id).toBe("c1");
});

test("saveProgress falls back to outbox and flushProgress retries", async () => {
  insert.mockResolvedValueOnce({ error: { message: "offline" } });
  await saveProgress({ route_id: "r1", mock_test_score: 82, mistakes: ["speeding"], duration_seconds: 2400 });
  expect(JSON.parse((await AsyncStorage.getItem("queue:progress_outbox"))!)).toHaveLength(1);
  insert.mockResolvedValueOnce({ error: null });
  expect(await flushProgress()).toBe(1);
});
```

- [ ] **Step 6: Run** — `npm test -- repos.test` → FAIL.

- [ ] **Step 7: Implement repos**

`src/services/centresRepo.ts`:
```ts
import { supabase } from "@/lib/supabase";
import type { Centre } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

export function listCentres(): Promise<Cached<Centre[]>> {
  return cachedFetch("centres", async () => {
    const { data, error } = await supabase.from("test_centres").select("*").order("name");
    if (error) throw new Error(error.message);
    return data as Centre[];
  });
}
```

`src/services/routesRepo.ts`:
```ts
import { supabase } from "@/lib/supabase";
import type { Hazard, Route } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

export function listRoutesByCentre(centreId: string): Promise<Cached<Route[]>> {
  return cachedFetch(`routes:${centreId}`, async () => {
    const { data, error } = await supabase.from("routes").select("*").eq("centre_id", centreId).order("name");
    if (error) throw new Error(error.message);
    return data as Route[];
  });
}

export function getRoute(routeId: string): Promise<Cached<{ route: Route; hazards: Hazard[] }>> {
  return cachedFetch(`route:${routeId}`, async () => {
    const { data: route, error } = await supabase.from("routes").select("*").eq("id", routeId).single();
    if (error) throw new Error(error.message);
    const { data: hazards, error: e2 } = await supabase.from("hazards").select("*").eq("route_id", routeId).order("id");
    if (e2) throw new Error(e2.message);
    return { route: route as Route, hazards: (hazards ?? []) as Hazard[] };
  });
}
```

`src/services/progressRepo.ts`:
```ts
import { supabase } from "@/lib/supabase";
import type { ProgressEntry } from "@/types/db";
import { drainQueue, enqueue } from "./cache";

async function insertProgress(entry: ProgressEntry): Promise<void> {
  const { error } = await supabase.from("user_progress").insert(entry);
  if (error) throw new Error(error.message);
}

export async function saveProgress(entry: Omit<ProgressEntry, "user_id">): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const full: ProgressEntry = { ...entry, user_id: data.user!.id };
  try { await insertProgress(full); }
  catch { await enqueue("progress_outbox", full); }
}

export function flushProgress(): Promise<number> {
  return drainQueue<ProgressEntry>("progress_outbox", insertProgress);
}
```

`src/services/favouritesRepo.ts`:
```ts
import { supabase } from "@/lib/supabase";

export async function listFavouriteRouteIds(): Promise<string[]> {
  const { data, error } = await supabase.from("favourites").select("route_id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.route_id as string);
}

export async function toggleFavourite(routeId: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const existing = await listFavouriteRouteIds();
  if (existing.includes(routeId)) {
    const { error } = await supabase.from("favourites").delete().match({ route_id: routeId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("favourites").insert({ route_id: routeId, user_id: user.user!.id });
    if (error) throw new Error(error.message);
  }
}
```

`src/stores/networkStore.ts`:
```ts
import { create } from "zustand";
import NetInfo from "@react-native-community/netinfo";
import { flushProgress } from "@/services/progressRepo";

export const useNetwork = create<{ online: boolean; init: () => void }>((set, get) => ({
  online: true,
  init: () => {
    NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      const wasOffline = !get().online;
      set({ online });
      if (online && wasOffline) flushProgress().catch(() => {});
    });
  },
}));
```
Call `useNetwork.getState().init()` once from `app/_layout.tsx` inside the existing `useEffect(() => { init(); }, [init])` (add `useNetwork.getState().init();` line).

- [ ] **Step 8: Run** — `npm test` → all green; `npx tsc --noEmit` clean.

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat: cache-through repositories, progress outbox, network store"`

---

### Task 8: Centre directory screen

**Files:**
- Modify: `app/(tabs)/index.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `listCentres` (Task 7), `useNetwork`, `SegmentedControl`, `Card`, `Skeleton`, `OfflineBanner` (Task 2), `haversineM`/`LatLng` (Task 3), `expo-location` for last-known position.
- Produces: navigation to `/centre/[id]` on card tap.

- [ ] **Step 1: Implement `app/(tabs)/index.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listCentres } from "@/services/centresRepo";
import { useNetwork } from "@/stores/networkStore";
import { haversineM, LatLng } from "@/lib/geo";
import type { Centre } from "@/types/db";
import { Card } from "@/ui/Card";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const FILTERS = ["Nearest", "Pass rate", "Manual", "Auto"];

export default function Centres() {
  const router = useRouter();
  const online = useNetwork((s) => s.online);
  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await listCentres();
      setCentres(r.data);
      setStale(r.stale);
    } catch {
      setError("Couldn't load centres. Pull down to retry.");
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({});
      if (pos) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })();
  }, [load]);

  const distanceMi = useCallback(
    (c: Centre) => (me ? haversineM(me, { lat: c.lat, lng: c.lng }) / 1609.34 : null),
    [me]
  );

  const shown = useMemo(() => {
    let list = centres ?? [];
    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
    if (filter === 2) list = list.filter((c) => c.test_types.includes("manual"));
    if (filter === 3) list = list.filter((c) => c.test_types.includes("auto"));
    if (filter === 1) list = [...list].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0));
    if (filter === 0 && me) list = [...list].sort((a, b) => (distanceMi(a) ?? 1e9) - (distanceMi(b) ?? 1e9));
    return list;
  }, [centres, query, filter, me, distanceMi]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="gap-3 px-4 pb-2 pt-2">
        <Text className="text-[24px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>Test centres</Text>
        <View className="flex-row items-center gap-2 rounded-lg border border-slate-200 bg-card px-3 py-2.5">
          <Ionicons name="search" size={15} color={colors.ink3} />
          <TextInput className="flex-1 text-[14px]" placeholder="Search centres" value={query} onChangeText={setQuery} />
        </View>
        <SegmentedControl options={FILTERS} selectedIndex={filter} onChange={setFilter} />
      </View>
      <OfflineBanner visible={stale || !online} />
      {error && (
        <View className="mx-4 rounded-lg bg-danger/10 px-3 py-2">
          <Text className="text-[12px] font-semibold text-danger">{error}</Text>
        </View>
      )}
      {centres === null && !error ? (
        <View className="gap-3 px-4 pt-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={72} />)}
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          contentContainerClassName="gap-3 px-4 pb-6 pt-2"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item }) => {
            const mi = distanceMi(item);
            return (
              <Pressable onPress={() => router.push(`/centre/${item.id}`)}>
                <Card className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-[15px] font-semibold text-primary">{item.name}</Text>
                    <Text className="text-[11px] text-slate-500">
                      {item.region ?? ""}{mi !== null ? ` · ${mi.toFixed(1)} mi away` : ""}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={`text-[20px] font-semibold tracking-tight ${(item.pass_rate ?? 0) >= 45 ? "text-accent" : "text-warning"}`}>
                      {item.pass_rate?.toFixed(0) ?? "—"}%
                    </Text>
                    <Text className="text-[11px] text-slate-500">pass rate</Text>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm test` green. Manual in Expo Go: list loads from Supabase; search narrows; segments filter/sort; airplane mode → relaunch shows cached list + offline banner; pull-to-refresh works; tapping a card navigates (404 screen until Task 9 — expected).

- [ ] **Step 3: Commit** — `git add -A; git commit -m "feat: centre directory with search, filters, offline cache, skeletons"`

---

### Task 9: Centre detail screen

**Files:**
- Create: `app/centre/[id].tsx`

**Interfaces:**
- Consumes: `listCentres`, `listRoutesByCentre`, `listFavouriteRouteIds`, `toggleFavourite` (Task 7), `Card`, `DifficultyPips`, `Skeleton`, `Button` (Task 2), `react-native-gifted-charts` LineChart, `ReanimatedSwipeable` from `react-native-gesture-handler`.
- Produces: navigation to `/route/[id]` (tap) and `/route/[id]/practice` (swipe right "Start").

- [ ] **Step 1: Implement `app/centre/[id].tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LineChart } from "react-native-gifted-charts";
import * as Haptics from "expo-haptics";
import { listCentres } from "@/services/centresRepo";
import { listRoutesByCentre } from "@/services/routesRepo";
import { listFavouriteRouteIds, toggleFavourite } from "@/services/favouritesRepo";
import type { Centre, Route } from "@/types/db";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

export default function CentreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [centre, setCentre] = useState<Centre | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const c = await listCentres();
      setCentre(c.data.find((x) => x.id === id) ?? null);
      const r = await listRoutesByCentre(id);
      setRoutes(r.data);
      setFavs(await listFavouriteRouteIds().catch(() => []));
    })();
  }, [id]);

  const onFavourite = useCallback(async (routeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleFavourite(routeId).catch(() => {});
    setFavs(await listFavouriteRouteIds().catch(() => []));
  }, []);

  if (!centre) {
    return (
      <SafeAreaView className="flex-1 bg-surface"><View className="gap-3 p-4">
        <Skeleton h={28} w="60%" /><Skeleton h={90} /><Skeleton h={64} /><Skeleton h={64} />
      </View></SafeAreaView>
    );
  }

  const spark = (centre.pass_rate_history ?? []).map((v) => ({ value: v }));

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="flex-1 gap-3 px-4 pt-1">
        <Pressable onPress={() => router.back()} className="min-h-[44px] flex-row items-center gap-1">
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text className="text-[13px] font-semibold text-accent">Centres</Text>
        </Pressable>
        <Text className="text-[24px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>{centre.name}</Text>
        <Text className="text-[12px] text-slate-500">{centre.address} · {centre.test_types.join(" & ")}</Text>
        <Card className="flex-row items-end justify-between">
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pass rate</Text>
            <Text className="text-[28px] font-semibold tracking-tight text-primary">{centre.pass_rate?.toFixed(1)}%</Text>
            <Text className="text-[11px] text-slate-500">last 8 quarters</Text>
          </View>
          {spark.length > 1 && (
            <LineChart
              data={spark} width={130} height={48} curved thickness={2}
              color={colors.accent} startFillColor={colors.accent} endFillColor="#ffffff"
              startOpacity={0.12} endOpacity={0} areaChart hideDataPoints hideRules hideYAxisText
              yAxisThickness={0} xAxisThickness={0} initialSpacing={0} spacing={130 / Math.max(spark.length - 1, 1)}
              disableScroll
            />
          )}
        </Card>
        <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Routes — swipe right to start, left to favourite</Text>
        <FlatList
          data={routes ?? []}
          keyExtractor={(r) => r.id}
          contentContainerClassName="gap-3 pb-3"
          renderItem={({ item }) => (
            <ReanimatedSwipeable
              renderLeftActions={() => (
                <View className="mr-2 w-20 items-center justify-center rounded-xl bg-accent">
                  <Ionicons name="play" size={20} color="#fff" />
                </View>
              )}
              renderRightActions={() => (
                <View className="ml-2 w-20 items-center justify-center rounded-xl bg-warning">
                  <Ionicons name={favs.includes(item.id) ? "star" : "star-outline"} size={20} color="#fff" />
                </View>
              )}
              onSwipeableOpen={(direction) => {
                if (direction === "left") router.push(`/route/${item.id}/practice`);
                else onFavourite(item.id);
              }}
            >
              <Pressable onPress={() => router.push(`/route/${item.id}`)}>
                <Card className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-[14px] font-semibold text-primary">
                      {item.name}{favs.includes(item.id) ? "  ★" : ""}
                    </Text>
                    <Text className="text-[11px] text-slate-500">{item.estimated_minutes} min · {item.distance_km?.toFixed(1)} km</Text>
                  </View>
                  <DifficultyPips level={item.difficulty} />
                </Card>
              </Pressable>
            </ReanimatedSwipeable>
          )}
        />
        {routes && routes.length > 0 && (
          <View className="pb-3">
            <Button title="Start practice" haptic onPress={() => router.push(`/route/${routes[0].id}/practice`)} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
```
(Note: the star glyph `★` is a unicode text character used as a favourite marker, consistent with the mockups' amber star; it is not an emoji.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. Manual: sparkline renders; swipe right opens practice route (blank until Task 12); swipe left toggles star with haptic; favourite persists in Supabase `favourites` table.

- [ ] **Step 3: Commit** — `git add -A; git commit -m "feat: centre detail with sparkline, swipeable route cards, favourites"`

---

### Task 10: Route detail screen

**Files:**
- Create: `app/route/[id]/index.tsx`

**Interfaces:**
- Consumes: `getRoute` (Task 7), `react-native-maps` (`MapView`, `Polyline`, `Marker`), `Card`, `Button`, `DifficultyPips`.
- Produces: navigation to `/route/[id]/practice` and `/route/[id]/mock`.

- [ ] **Step 1: Implement `app/route/[id]/index.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import { getRoute } from "@/services/routesRepo";
import type { Hazard, Route } from "@/types/db";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const SEV: Record<Hazard["severity"], string> = { low: "text-slate-500", medium: "text-accent", high: "text-warning" };

export default function RouteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );
  const region = useMemo(() => {
    if (!coords.length) return undefined;
    const lats = coords.map((c) => c.latitude);
    const lngs = coords.map((c) => c.longitude);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.4 + 0.005,
      longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.4 + 0.005,
    };
  }, [coords]);

  if (!route) {
    return <SafeAreaView className="flex-1 bg-surface"><View className="gap-3 p-4"><Skeleton h={200} /><Skeleton h={70} /><Skeleton h={64} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="h-[230px] overflow-hidden">
        <MapView style={{ flex: 1 }} mapType="mutedStandard" initialRegion={region} pitchEnabled={false} rotateEnabled={false}>
          <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
          {hazards.map((h) => (
            <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} pinColor={colors.warning} />
          ))}
        </MapView>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
        <Text className="text-[20px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>{route.name}</Text>
        <Card className="flex-row">
          <View className="flex-1 items-center"><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Time</Text><Text className="text-[14px] font-semibold text-primary">{route.estimated_minutes} min</Text></View>
          <View className="flex-1 items-center border-x border-slate-100"><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Distance</Text><Text className="text-[14px] font-semibold text-primary">{route.distance_km?.toFixed(1)} km</Text></View>
          <View className="flex-1 items-center"><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Difficulty</Text><DifficultyPips level={route.difficulty} /></View>
        </Card>
        <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Hazards on this route</Text>
        {hazards.map((h) => (
          <Card key={h.id} className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[14px] font-semibold capitalize text-primary">{h.type}</Text>
              <Text className="text-[11px] text-slate-500">{h.description}</Text>
            </View>
            <Text className={`text-[11px] font-bold uppercase ${SEV[h.severity]}`}>{h.severity}</Text>
          </Card>
        ))}
        <View className="flex-row gap-3 pb-4 pt-1">
          <View className="flex-1"><Button title="Practice drive" haptic onPress={() => router.push(`/route/${id}/practice`)} /></View>
          <View className="flex-1"><Button title="Mock test" variant="dark" haptic onPress={() => router.push(`/route/${id}/mock`)} /></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. Manual in Expo Go: real Apple Maps in mutedStandard with the emerald road-following polyline and amber pins; stats and hazards match seed data. **This is the map-look checkpoint the user asked for — share a screenshot before proceeding.**

- [ ] **Step 3: Commit** — `git add -A; git commit -m "feat: route detail with map preview, stats, hazards"`

---

### Task 11: Voice instruction engine (pure, TDD)

**Files:**
- Create: `src/lib/instructions.ts`
- Test: `src/lib/__tests__/instructions.test.ts`

**Interfaces:**
- Consumes: `src/lib/geo.ts`.
- Produces:
```ts
export type Instruction = { idx: number; point: LatLng; text: string };
export function deriveInstructions(coords: LatLng[]): Instruction[];
// Trigger: returns the instruction to speak now (once), or null.
export function nextInstruction(pos: LatLng, instructions: Instruction[], spokenIdxs: Set<number>): Instruction | null;
export const TRIGGER_DISTANCE_M = 183; // ≈ 200 yards
```
Text format: `"In 200 yards, turn left"` / `"In 200 yards, turn right"` for 45–120° turns; `"In 200 yards, at the roundabout, take the next exit"` for ≥120°; final coordinate gets `"You have reached the end of the route"`.

- [ ] **Step 1: Write failing tests**

`src/lib/__tests__/instructions.test.ts`:
```ts
import { deriveInstructions, nextInstruction, TRIGGER_DISTANCE_M } from "../instructions";

// straight north, then 90° right turn east at idx 2
const elbow = [
  { lat: 51.5, lng: -0.1 }, { lat: 51.51, lng: -0.1 }, { lat: 51.52, lng: -0.1 },
  { lat: 51.52, lng: -0.09 }, { lat: 51.52, lng: -0.08 },
];

test("deriveInstructions emits right turn and end-of-route", () => {
  const ins = deriveInstructions(elbow);
  expect(ins[0]).toMatchObject({ idx: 2, text: "In 200 yards, turn right" });
  expect(ins[ins.length - 1].text).toMatch(/end of the route/);
});

test("nextInstruction fires within trigger distance, once", () => {
  const ins = deriveInstructions(elbow);
  const spoken = new Set<number>();
  const near = { lat: 51.5185, lng: -0.1 }; // ~165 m south of the turn
  const far = { lat: 51.51, lng: -0.1 };    // > TRIGGER_DISTANCE_M
  expect(nextInstruction(far, ins, spoken)).toBeNull();
  const fired = nextInstruction(near, ins, spoken);
  expect(fired?.idx).toBe(2);
  spoken.add(fired!.idx);
  expect(nextInstruction(near, ins, spoken)).toBeNull(); // not re-fired
});

test("TRIGGER_DISTANCE_M is about 200 yards", () => {
  expect(TRIGGER_DISTANCE_M).toBeGreaterThan(175);
  expect(TRIGGER_DISTANCE_M).toBeLessThan(190);
});
```

- [ ] **Step 2: Run** — `npm test -- instructions` → FAIL.

- [ ] **Step 3: Implement `src/lib/instructions.ts`**

```ts
import { bearingDeg, haversineM, LatLng, turnAngleDeg } from "./geo";

export type Instruction = { idx: number; point: LatLng; text: string };
export const TRIGGER_DISTANCE_M = 183; // ≈ 200 yards

export function deriveInstructions(coords: LatLng[]): Instruction[] {
  const out: Instruction[] = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const angle = turnAngleDeg(bearingDeg(coords[i - 1], coords[i]), bearingDeg(coords[i], coords[i + 1]));
    const abs = Math.abs(angle);
    if (abs < 45) continue;
    const text =
      abs >= 120
        ? "In 200 yards, at the roundabout, take the next exit"
        : `In 200 yards, turn ${angle > 0 ? "right" : "left"}`;
    out.push({ idx: i, point: coords[i], text });
  }
  out.push({ idx: coords.length - 1, point: coords[coords.length - 1], text: "You have reached the end of the route" });
  return out;
}

export function nextInstruction(pos: LatLng, instructions: Instruction[], spokenIdxs: Set<number>): Instruction | null {
  for (const ins of instructions) {
    if (spokenIdxs.has(ins.idx)) continue;
    if (haversineM(pos, ins.point) <= TRIGGER_DISTANCE_M) return ins;
  }
  return null;
}
```

- [ ] **Step 4: Run** — `npm test -- instructions` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: voice instruction derivation and proximity trigger"`

---

### Task 12: Practice mode screen

**Files:**
- Create: `app/route/[id]/practice.tsx`

**Interfaces:**
- Consumes: `getRoute`, `deriveInstructions`/`nextInstruction` (Task 11), `expo-location` watch, `expo-speech`, `@gorhom/bottom-sheet`, map pieces as in Task 10.
- Produces: standalone screen; no downstream consumers.

- [ ] **Step 1: Implement `app/route/[id]/practice.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { deriveInstructions, Instruction, nextInstruction } from "@/lib/instructions";
import type { Hazard, Route } from "@/types/db";
import { Button } from "@/ui/Button";
import { colors } from "@/ui/theme";

export default function Practice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [current, setCurrent] = useState<Instruction | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const spokenRef = useRef(new Set<number>());
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );
  const instructions = useMemo(
    () => (route ? deriveInstructions(route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))) : []),
    [route]
  );

  useEffect(() => {
    if (!instructions.length) return;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setPermissionDenied(true); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const ins = nextInstruction(p, instructions, spokenRef.current);
          if (ins) {
            spokenRef.current.add(ins.idx);
            setCurrent(ins);
            Speech.speak(ins.text, { language: "en-GB" });
          }
        }
      );
    })();
    return () => { sub?.remove(); Speech.stop(); };
  }, [instructions]);

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-8">
        <Text className="text-center text-[15px] font-semibold text-primary">Location access is needed to guide you along the route.</Text>
        <Text className="text-center text-[12px] text-slate-500">Enable it in Settings → Privacy → Location Services → Expo Go.</Text>
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        style={{ flex: 1 }} mapType="mutedStandard" showsUserLocation followsUserLocation
        initialRegion={coords[0] && { ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      >
        <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
        {hazards.map((h) => (
          <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} pinColor={colors.warning}
            onPress={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }} />
        ))}
      </MapView>

      <View className="absolute left-4 right-4 top-14 rounded-xl bg-card p-3 shadow-lg" style={{ shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12 }}>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-[10px] bg-primary">
            <Ionicons name="navigate" size={18} color="#fff" />
          </View>
          <Text className="flex-1 text-[13px] font-semibold text-primary">
            {current?.text ?? "Follow the green route — guidance starts as you approach the first turn"}
          </Text>
        </View>
      </View>

      <Pressable onPress={() => router.back()} className="absolute right-4 top-28 min-h-[44px] flex-row items-center gap-1.5 rounded-full bg-card px-3 py-2" style={{ shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 8 }}>
        <Ionicons name="close" size={14} color={colors.ink2} />
        <Text className="text-[11px] font-semibold text-primary">End practice</Text>
      </Pressable>

      <BottomSheet ref={sheetRef} index={-1} snapPoints={["25%", "50%", "90%"]} enablePanDownToClose handleIndicatorStyle={{ backgroundColor: "#CBD5E1" }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {selectedHazard && (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-semibold capitalize text-primary">{selectedHazard.type}</Text>
                <Text className={`text-[11px] font-bold uppercase ${selectedHazard.severity === "high" ? "text-warning" : "text-slate-500"}`}>{selectedHazard.severity}</Text>
              </View>
              <Text className="mt-1 text-[12px] leading-5 text-slate-600">{selectedHazard.description}</Text>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm test` green. Manual (device, ideally in a car park or on foot): blue dot follows you; approaching a turn speaks the instruction once in a British voice; hazard pin tap opens the sheet at 25% and drags to 50/90%; End practice returns.

- [ ] **Step 3: Commit** — `git add -A; git commit -m "feat: practice mode with voice guidance and hazard bottom sheet"`

---

### Task 13: Mock-test scoring engine (pure, TDD)

**Files:**
- Create: `src/lib/scoring/engine.ts`
- Test: `src/lib/scoring/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `src/lib/geo.ts`, types from `src/types/db.ts`.
- Produces:
```ts
export type GpsSample = { lat: number; lng: number; speedMps: number; t: number }; // t = epoch ms
export type Fault = { kind: "speeding" | "observation"; severity: "minor" | "serious"; detail: string; tag: string };
export type MockResult = {
  passed: boolean; score: number;               // score = max(0, 100 − 5·minors − 40·serious)
  minors: number; serious: number; faults: Fault[]; tags: string[]; durationSeconds: number;
};
export function detectSpeedingFaults(samples: GpsSample[], coords: LatLng[], profile: SpeedProfileSegment[]): Fault[];
export function detectObservationFaults(zoneEvents: { zone: ObservationZone; tapped: boolean }[]): Fault[];
export function aggregate(faults: Fault[], durationSeconds: number): MockResult;
export const SUSTAINED_MS = 5000;
export function limitAt(coords: LatLng[], profile: SpeedProfileSegment[], p: LatLng): number; // mph, default 30
```
Speeding rule (Global Constraints): over `limit × 1.1 + 2 mph`. Contiguous over-limit runs ≥ `SUSTAINED_MS` → one serious fault; shorter runs → one minor each. Tag: `"Speeding"`. Observation misses → minor with tag `"Roundabout observations"` (kind roundabout) or `"Junction observations"` (junction) or `"Pedestrian awareness"` (pedestrian).

- [ ] **Step 1: Write failing tests**

`src/lib/scoring/__tests__/engine.test.ts`:
```ts
import { aggregate, detectObservationFaults, detectSpeedingFaults, limitAt } from "../engine";
import type { GpsSample } from "../engine";

// straight north line, single 30 mph segment across all vertices
const coords = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));
const profile30 = [{ startIdx: 0, endIdx: 10, limitMph: 30 as const }];
const at = (i: number, speedMph: number, t: number): GpsSample =>
  ({ lat: 51.5 + i * 0.001, lng: -0.1, speedMps: speedMph / 2.23694, t });

test("limitAt matches segment, defaults to 30", () => {
  expect(limitAt(coords, profile30, { lat: 51.505, lng: -0.1 })).toBe(30);
  expect(limitAt(coords, [], { lat: 51.505, lng: -0.1 })).toBe(30);
});

test("brief speeding = minor, sustained = serious", () => {
  const brief = [at(0, 28, 0), at(1, 38, 1000), at(2, 38, 3000), at(3, 28, 4000)];
  expect(detectSpeedingFaults(brief, coords, profile30)).toEqual([
    expect.objectContaining({ kind: "speeding", severity: "minor", tag: "Speeding" }),
  ]);
  const sustained = [at(0, 38, 0), at(1, 38, 2000), at(2, 38, 4000), at(3, 38, 6000), at(4, 28, 7000)];
  expect(detectSpeedingFaults(sustained, coords, profile30)).toEqual([
    expect.objectContaining({ severity: "serious" }),
  ]);
});

test("threshold is limit ×1.1 + 2: 35 mph in a 30 is legal, 35.1 is not", () => {
  expect(detectSpeedingFaults([at(0, 35, 0), at(1, 35, 1000)], coords, profile30)).toHaveLength(0);
  expect(detectSpeedingFaults([at(0, 35.2, 0), at(1, 35.2, 1000), at(2, 28, 2000)], coords, profile30)).toHaveLength(1);
});

test("observation misses tagged by zone kind", () => {
  const faults = detectObservationFaults([
    { zone: { lat: 0, lng: 0, radiusM: 60, kind: "roundabout" }, tapped: false },
    { zone: { lat: 0, lng: 0, radiusM: 60, kind: "junction" }, tapped: true },
  ]);
  expect(faults).toEqual([expect.objectContaining({ severity: "minor", tag: "Roundabout observations" })]);
});

test("aggregate applies DVSA rule: 16 minors fail, any serious fails", () => {
  const minor = { kind: "speeding" as const, severity: "minor" as const, detail: "", tag: "Speeding" };
  const serious = { ...minor, severity: "serious" as const };
  expect(aggregate(Array(15).fill(minor), 100).passed).toBe(true);
  expect(aggregate(Array(16).fill(minor), 100).passed).toBe(false);
  expect(aggregate([serious], 100).passed).toBe(false);
  const r = aggregate([minor, minor, serious], 1234);
  expect(r).toMatchObject({ minors: 2, serious: 1, score: 50, durationSeconds: 1234 });
  expect(r.tags).toEqual(["Speeding"]);
});
```

- [ ] **Step 2: Run** — `npm test -- engine` → FAIL.

- [ ] **Step 3: Implement `src/lib/scoring/engine.ts`**

```ts
import { LatLng, mpsToMph, nearestVertex } from "../geo";
import type { ObservationZone, SpeedProfileSegment } from "@/types/db";

export type GpsSample = { lat: number; lng: number; speedMps: number; t: number };
export type Fault = { kind: "speeding" | "observation"; severity: "minor" | "serious"; detail: string; tag: string };
export type MockResult = {
  passed: boolean; score: number; minors: number; serious: number;
  faults: Fault[]; tags: string[]; durationSeconds: number;
};
export const SUSTAINED_MS = 5000;

export function limitAt(coords: LatLng[], profile: SpeedProfileSegment[], p: LatLng): number {
  if (!coords.length || !profile.length) return 30;
  const { idx } = nearestVertex(coords, p);
  return profile.find((s) => idx >= s.startIdx && idx <= s.endIdx)?.limitMph ?? 30;
}

export function detectSpeedingFaults(samples: GpsSample[], coords: LatLng[], profile: SpeedProfileSegment[]): Fault[] {
  const faults: Fault[] = [];
  let runStart: number | null = null;
  let runLimit = 30;
  const close = (endT: number) => {
    if (runStart === null) return;
    const severity = endT - runStart >= SUSTAINED_MS ? "serious" : "minor";
    faults.push({
      kind: "speeding", severity, tag: "Speeding",
      detail: `Over the ${runLimit} mph limit for ${Math.round((endT - runStart) / 1000)} s`,
    });
    runStart = null;
  };
  for (const s of samples) {
    const limit = limitAt(coords, profile, s);
    const over = mpsToMph(s.speedMps) > limit * 1.1 + 2;
    if (over && runStart === null) { runStart = s.t; runLimit = limit; }
    if (!over) close(s.t);
  }
  if (runStart !== null) close(samples[samples.length - 1].t);
  return faults;
}

const ZONE_TAGS: Record<ObservationZone["kind"], string> = {
  roundabout: "Roundabout observations",
  junction: "Junction observations",
  pedestrian: "Pedestrian awareness",
};

export function detectObservationFaults(zoneEvents: { zone: ObservationZone; tapped: boolean }[]): Fault[] {
  return zoneEvents
    .filter((e) => !e.tapped)
    .map((e) => ({
      kind: "observation" as const, severity: "minor" as const,
      detail: `Missed mirror check at ${e.zone.kind}`, tag: ZONE_TAGS[e.zone.kind],
    }));
}

export function aggregate(faults: Fault[], durationSeconds: number): MockResult {
  const minors = faults.filter((f) => f.severity === "minor").length;
  const serious = faults.filter((f) => f.severity === "serious").length;
  return {
    passed: serious === 0 && minors <= 15,
    score: Math.max(0, 100 - 5 * minors - 40 * serious),
    minors, serious, faults,
    tags: [...new Set(faults.map((f) => f.tag))],
    durationSeconds,
  };
}
```

- [ ] **Step 4: Run** — `npm test -- engine` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: mock-test scoring engine with DVSA fault model"`

---

### Task 14: Mock-test store (state machine, TDD)

**Files:**
- Create: `src/stores/mockTestStore.ts`
- Test: `src/stores/__tests__/mockTestStore.test.ts`

**Interfaces:**
- Consumes: scoring engine (Task 13), `isInZone` (Task 3), `Route` type.
- Produces:
```ts
export type MockPhase = "idle" | "running" | "finished";
export const useMockTest: /* zustand */ {
  phase: MockPhase;
  route: Route | null;
  startedAt: number;                    // epoch ms
  samples: GpsSample[];
  activeZoneIdx: number | null;         // index into route.observation_zones while inside one
  zoneOutcomes: { zoneIdx: number; tapped: boolean }[];
  result: MockResult | null;
  start: (route: Route, now?: number) => void;
  onSample: (s: GpsSample) => void;     // records sample; manages zone entry/exit
  tapMirrors: () => void;               // marks the active zone as tapped
  finish: (now?: number) => MockResult; // runs engine, sets result + phase
  reset: () => void;
};
```
Zone semantics: entering a zone sets `activeZoneIdx`; leaving it (or finishing) records `{ zoneIdx, tapped }` once per zone; `tapMirrors()` with no active zone is a no-op.

- [ ] **Step 1: Write failing tests**

`src/stores/__tests__/mockTestStore.test.ts`:
```ts
import { useMockTest } from "../mockTestStore";
import type { Route } from "@/types/db";

const route: Route = {
  id: "r1", centre_id: "c1", name: "Test route",
  geometry: { type: "LineString", coordinates: [[-0.1, 51.5], [-0.1, 51.51], [-0.1, 51.52]] },
  estimated_minutes: 30, distance_km: 5, difficulty: 2,
  speed_profile: [{ startIdx: 0, endIdx: 2, limitMph: 30 }],
  observation_zones: [{ lat: 51.51, lng: -0.1, radiusM: 60, kind: "roundabout" }],
};
const sample = (lat: number, mph: number, t: number) => ({ lat, lng: -0.1, speedMps: mph / 2.23694, t });

beforeEach(() => useMockTest.getState().reset());

test("zone entered + tapped → no observation fault", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.5, 28, 0));        // outside zone
  s.onSample(sample(51.51, 28, 5000));    // inside zone
  expect(useMockTest.getState().activeZoneIdx).toBe(0);
  useMockTest.getState().tapMirrors();
  s.onSample(sample(51.52, 28, 10000));   // left zone
  const r = useMockTest.getState().finish(10000);
  expect(r.faults.filter((f) => f.kind === "observation")).toHaveLength(0);
  expect(r.passed).toBe(true);
});

test("zone entered + not tapped → minor observation fault", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.51, 28, 1000));
  s.onSample(sample(51.52, 28, 8000));
  const r = useMockTest.getState().finish(8000);
  expect(r.faults).toEqual([expect.objectContaining({ kind: "observation", severity: "minor" })]);
});

test("finish computes duration and phase", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.5, 28, 0));
  const r = useMockTest.getState().finish(90_000);
  expect(r.durationSeconds).toBe(90);
  expect(useMockTest.getState().phase).toBe("finished");
});

test("tapMirrors outside a zone is a no-op", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.5, 28, 0));
  useMockTest.getState().tapMirrors();
  expect(useMockTest.getState().zoneOutcomes).toHaveLength(0);
});
```

- [ ] **Step 2: Run** — `npm test -- mockTestStore` → FAIL.

- [ ] **Step 3: Implement `src/stores/mockTestStore.ts`**

```ts
import { create } from "zustand";
import { isInZone } from "@/lib/geo";
import { aggregate, detectObservationFaults, detectSpeedingFaults, GpsSample, MockResult } from "@/lib/scoring/engine";
import type { Route } from "@/types/db";

type MockPhase = "idle" | "running" | "finished";

type MockState = {
  phase: MockPhase;
  route: Route | null;
  startedAt: number;
  samples: GpsSample[];
  activeZoneIdx: number | null;
  activeTapped: boolean;
  zoneOutcomes: { zoneIdx: number; tapped: boolean }[];
  result: MockResult | null;
  start: (route: Route, now?: number) => void;
  onSample: (s: GpsSample) => void;
  tapMirrors: () => void;
  finish: (now?: number) => MockResult;
  reset: () => void;
};

const initial = {
  phase: "idle" as MockPhase, route: null, startedAt: 0, samples: [],
  activeZoneIdx: null, activeTapped: false, zoneOutcomes: [], result: null,
};

export const useMockTest = create<MockState>((set, get) => ({
  ...initial,
  start: (route, now = Date.now()) => set({ ...initial, phase: "running", route, startedAt: now }),
  onSample: (s) => {
    const { route, samples, activeZoneIdx, activeTapped, zoneOutcomes } = get();
    if (!route || get().phase !== "running") return;
    const zones = route.observation_zones;
    const inside = zones.findIndex((z) => isInZone({ lat: s.lat, lng: s.lng }, z));
    let next: Partial<MockState> = { samples: [...samples, s] };
    if (inside !== -1 && activeZoneIdx === null && !zoneOutcomes.some((o) => o.zoneIdx === inside)) {
      next = { ...next, activeZoneIdx: inside, activeTapped: false };
    } else if (inside === -1 && activeZoneIdx !== null) {
      next = {
        ...next,
        zoneOutcomes: [...zoneOutcomes, { zoneIdx: activeZoneIdx, tapped: activeTapped }],
        activeZoneIdx: null, activeTapped: false,
      };
    }
    set(next);
  },
  tapMirrors: () => {
    if (get().activeZoneIdx !== null) set({ activeTapped: true });
  },
  finish: (now = Date.now()) => {
    const { route, samples, startedAt, activeZoneIdx, activeTapped, zoneOutcomes } = get();
    const outcomes = activeZoneIdx !== null
      ? [...zoneOutcomes, { zoneIdx: activeZoneIdx, tapped: activeTapped }]
      : zoneOutcomes;
    const coords = (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
    const faults = [
      ...detectSpeedingFaults(samples, coords, route?.speed_profile ?? []),
      ...detectObservationFaults(outcomes.map((o) => ({ zone: route!.observation_zones[o.zoneIdx], tapped: o.tapped }))),
    ];
    const result = aggregate(faults, Math.round((now - startedAt) / 1000));
    set({ phase: "finished", result, zoneOutcomes: outcomes, activeZoneIdx: null });
    return result;
  },
  reset: () => set({ ...initial }),
}));
```

- [ ] **Step 4: Run** — `npm test -- mockTestStore` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: mock test state machine with observation zone tracking"`

---

### Task 15: Mock test screen

**Files:**
- Create: `app/route/[id]/mock.tsx`

**Interfaces:**
- Consumes: `useMockTest` (Task 14), `getRoute`, `expo-location` watch, `expo-haptics`.
- Produces: navigates to `/route/[id]/result` after `finish()`.

- [ ] **Step 1: Implement `app/route/[id]/mock.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { useMockTest } from "@/stores/mockTestStore";
import { colors } from "@/ui/theme";

export default function Mock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { phase, route, startedAt, activeZoneIdx, start, onSample, tapMirrors, finish } = useMockTest();
  const [clock, setClock] = useState("0:00");

  useEffect(() => {
    getRoute(id).then((r) => start(r.data.route)).catch(() => {});
  }, [id, start]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      setClock(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (phase !== "running") return;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
        (pos) => onSample({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          speedMps: Math.max(0, pos.coords.speed ?? 0), t: pos.timestamp,
        })
      );
    })();
    return () => sub?.remove();
  }, [phase, onSample]);

  useEffect(() => {
    if (activeZoneIdx !== null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeZoneIdx]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );

  return (
    <View className="flex-1">
      <MapView style={{ flex: 1 }} mapType="mutedStandard" showsUserLocation followsUserLocation
        initialRegion={coords[0] && { ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
        <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
      </MapView>

      <View className="absolute left-4 right-4 top-14 flex-row items-center justify-between rounded-xl bg-card px-4 py-2.5" style={{ shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12 }}>
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-danger" />
          <Text className="text-[13px] font-semibold text-primary">Mock test</Text>
        </View>
        <Text className="text-[14px] font-semibold text-primary" style={{ fontVariant: ["tabular-nums"] }}>{clock}</Text>
      </View>

      {activeZoneIdx !== null && (
        <Text className="absolute bottom-52 self-center rounded-full bg-card/90 px-4 py-1.5 text-[11px] font-semibold text-slate-600">
          Observation zone — check your mirrors
        </Text>
      )}

      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); tapMirrors(); }}
        className={`absolute bottom-28 h-[74px] w-[74px] items-center justify-center self-center rounded-full ${activeZoneIdx !== null ? "bg-accent" : "bg-slate-300"}`}
        style={activeZoneIdx !== null ? { shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 16 } : undefined}
      >
        <Ionicons name="eye-outline" size={22} color="#fff" />
        <Text className="text-[11px] font-bold text-white">Mirrors</Text>
      </Pressable>

      <Pressable
        onPress={() => { finish(); router.replace(`/route/${id}/result`); }}
        className="absolute bottom-10 self-center min-h-[44px] flex-row items-center rounded-full bg-primary px-6 py-2.5"
      >
        <Text className="text-[13px] font-semibold text-white">Finish test</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm test` green. Manual: timer ticks; entering a seeded zone lights the Mirrors button green with a light haptic; Finish navigates to result (blank until Task 16).

- [ ] **Step 3: Commit** — `git add -A; git commit -m "feat: silent mock test screen with mirrors observation button"`

---

### Task 16: Result screen

**Files:**
- Create: `app/route/[id]/result.tsx`

**Interfaces:**
- Consumes: `useMockTest` result (Task 14), `saveProgress` (Task 7), Reanimated entering animations, `expo-haptics`.
- Produces: saves `ProgressEntry`; "Done" resets the store and pops to the route detail.

- [ ] **Step 1: Implement `app/route/[id]/result.tsx`**

```tsx
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { saveProgress } from "@/services/progressRepo";
import { useMockTest } from "@/stores/mockTestStore";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { result, reset } = useMockTest();

  useEffect(() => {
    if (!result) return;
    Haptics.notificationAsync(
      result.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    );
    saveProgress({
      route_id: id, mock_test_score: result.score,
      mistakes: result.tags, duration_seconds: result.durationSeconds,
    }).catch(() => {});
  }, [result, id]);

  if (!result) return null;
  const mins = Math.floor(result.durationSeconds / 60);
  const secs = result.durationSeconds % 60;

  return (
    <SafeAreaView className="flex-1 bg-primary">
      <ScrollView contentContainerClassName="items-center gap-3 px-4 pb-8 pt-6">
        <Animated.View
          entering={ZoomIn.springify().delay(150)}
          className={`h-28 w-28 items-center justify-center rounded-full border-[5px] ${result.passed ? "border-accent" : "border-danger"}`}
        >
          <Text className={`text-[13px] font-bold tracking-[0.18em] ${result.passed ? "text-emerald-400" : "text-red-400"}`}>
            {result.passed ? "PASS" : "FAIL"}
          </Text>
          <Text className="text-[11px] text-slate-400">{result.minors} minors</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(350)} className="items-center">
          <Text className="text-[21px] font-semibold tracking-tight text-surface" style={{ fontFamily: "Inter_600SemiBold" }}>
            {result.passed ? "You'd have passed" : "Not this time"}
          </Text>
          <Text className="text-[12px] text-slate-400">
            {result.minors} minor{result.minors === 1 ? "" : "s"} · {result.serious} serious · {mins} min {secs} s · score {result.score}
          </Text>
        </Animated.View>
        {result.faults.map((f, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(450 + i * 90)} className="w-full">
            <Card className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-semibold text-primary">{f.tag}</Text>
                <Text className="text-[11px] text-slate-500">{f.detail}</Text>
              </View>
              <Text className={`text-[10px] font-bold uppercase ${f.severity === "serious" ? "text-danger" : "text-warning"}`}>
                {f.severity}
              </Text>
            </Card>
          </Animated.View>
        ))}
        {result.faults.length === 0 && (
          <Animated.View entering={FadeInDown.delay(450)} className="w-full">
            <Card><Text className="text-center text-[13px] font-semibold text-accent">A clean drive — no faults recorded</Text></Card>
          </Animated.View>
        )}
        <View className="mt-2 w-full">
          <Button title="Done" onPress={() => { reset(); router.dismissTo(`/route/${id}`); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm test` green. Manual: pass/fail ring zooms in with the right haptic; cards stagger in; row appears in Supabase `user_progress` (or in the outbox when offline, flushing on reconnect); Done returns to route detail with store reset.

- [ ] **Step 3: Commit** — `git add -A; git commit -m "feat: animated mock test result screen with progress save"`

---

### Task 17: Phase-1 wrap — full verification + user review checkpoint

**Files:**
- Modify: none expected (fixes only if verification fails)

- [ ] **Step 1: Full automated verification**

```powershell
npm test            # all suites green
npx tsc --noEmit    # clean
npx expo-doctor     # no failures
```

- [ ] **Step 2: Manual QA sweep in Expo Go (device)** — walk this checklist:
1. Fresh install → sign-up → confirmation email → sign-in → lands on Centres.
2. Kill + relaunch → still signed in.
3. Centres: search, all four segments, pull-to-refresh, airplane-mode relaunch shows cache + offline banner.
4. Centre detail: sparkline, swipe right = practice, swipe left = favourite (persists after relaunch).
5. Route detail: muted Apple Map, emerald polyline follows real roads, amber pins, stats correct.
6. Practice: voice speaks en-GB near a turn (walk a route segment or simulate location), hazard sheet snaps 25/50/90, End practice cleans up (no voice after leaving).
7. Mock: timer, Mirrors button activates in zone with haptic, Finish → animated result → row in `user_progress`.
8. Sign out (add a temporary long-press on the Centres title if no UI exists — or verify via Supabase session revoke) and confirm gate returns to sign-in.
- [ ] **Step 3: Commit any fixes** — `git add -A; git commit -m "fix: phase 1 QA fixes"` (only if changes were needed).

- [ ] **Step 4: STOP — user review checkpoint.** Phase 1 is the agreed review point: the user tries the app in Expo Go (especially the real map look on route detail/practice) before Phase 2 (manoeuvre trainer, dashboard, quiz) is planned.

---

## Self-Review Notes (completed during plan writing)

- **Spec coverage:** foundation (T1–2), schema/client (T4), seed pipeline incl. Show Me/Tell Me + manoeuvre seed data (T5), auth gate + magic link (T6), offline cache/outbox/banner (T7), centre directory (T8), centre detail + favourites/swipes (T9), route detail (T10), practice + voice + hazard sheet (T11–12), mock scoring + zones + result + save (T13–16), QA (T17). Phase 2 features (manoeuvre trainer UI, dashboard, quiz UI) intentionally out of scope; their seed data ships now so Phase 2 is UI-only.
- **Spec amendments carried into the spec file:** client-side instruction derivation; `pass_rate_history` column.
- **Known deliberate simplifications:** hazard/observation-zone placement is heuristic (turn-angle based) — acceptable for MVP, curated later; `nearestVertex` is vertex-based not segment-projected (OSRM geometry is dense enough at 5 m GPS intervals); shared-element route-card transition deferred to Phase 2 polish (native stack transitions only in Phase 1).







