# Examiner Panel and Shared Nav Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the mock test the practice screen's map, and let whoever is in the passenger seat mark the drive against DVSA's own fault categories, feeding the result.

**Architecture:** Two pure modules carry the new logic — `src/lib/examiner.ts` (DVSA categories, mark-to-fault conversion, repeated-minor warning) and `src/lib/navmap.ts` (the per-fix decision logic lifted out of the practice screen). The map itself becomes `src/ui/NavMap.tsx`, shared by both screens, with each screen keeping only its own chrome. The scoring engine renames `serious` to `major` throughout and gains credits.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript, `@rnmapbox/maps` ^10.3.5, `@gorhom/bottom-sheet` ^5.2.14, `react-native-svg` 15.12.1, zustand, `expo-location`, Jest (`jest-expo`) + `@testing-library/react-native`, NativeWind.

**Spec:** `docs/superpowers/specs/2026-08-04-examiner-panel-design.md`

## Global Constraints

- **No new dependencies.** Everything needed is installed.
- **Path alias:** `@/` resolves to `src/`.
- **Commands:** `npm test`; single file `npx jest <path>`; `npx tsc --noEmit` must be clean before every commit; `npm run check:map-style` after touching map layers.
- **No emoji anywhere.** British English in user-facing strings.
- **Comment style:** sparse, explaining *why* not *what*. Match the surrounding code.
- **`Hazard.severity` in `src/types/db.ts` is `"low" | "medium" | "high"` and is UNRELATED to fault severity.** Do not rename it. The same applies to `SEV` in `app/route/[id]/index.tsx:14` and the hazard sheet in `practice.tsx:700`.
- **Pass/fail is the DVSA rule and credits must never affect it:** `passed = majors === 0 && minors <= 15`.
- **The device is unavailable.** No task may claim on-device verification. Say so explicitly in the report.
- Starting state: **97 tests passing, 15 suites**, `tsc` clean, HEAD `37329af`.

---

### Task 1: Rename serious to major

**Files:**
- Modify: `src/lib/scoring/engine.ts:5,7,24,57-62`
- Modify: `src/lib/scoring/__tests__/engine.test.ts:15-46`
- Modify: `app/route/[id]/result.tsx:49,59-60`
- Modify: `src/stores/__tests__/mockTestStore.test.ts:35`

**Interfaces:**
- Consumes: nothing.
- Produces: `Fault.severity: "minor" | "major"`; `MockResult.majors: number` (replacing `serious`). Every later task depends on these names.

Mechanical rename with no behaviour change. A sustained speeding fault is still the more severe kind — it is called a major now.

- [ ] **Step 1: Update the tests first**

In `src/lib/scoring/__tests__/engine.test.ts`, replace every `"serious"` severity literal with `"major"`, rename the local `const serious` to `major`, and update the two test names and the `toMatchObject`:

```ts
test("brief speeding = minor, sustained = major", () => {
```
```ts
    expect.objectContaining({ severity: "major" }),
```
```ts
test("aggregate applies DVSA rule: 16 minors fail, any major fails", () => {
  const minor = { kind: "speeding" as const, severity: "minor" as const, detail: "", tag: "Speeding" };
  const major = { ...minor, severity: "major" as const };
```
```ts
  expect(aggregate([major], 100).passed).toBe(false);
  const r = aggregate([minor, minor, major], 1234);
  expect(r).toMatchObject({ minors: 2, majors: 1, score: 50, durationSeconds: 1234 });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/scoring`
Expected: FAIL — TypeScript rejects `"major"` as a severity, and `majors` does not exist on `MockResult`.

- [ ] **Step 3: Rename in the engine**

In `src/lib/scoring/engine.ts`:

```ts
export type Fault = { kind: "speeding" | "observation"; severity: "minor" | "major"; detail: string; tag: string };
export type MockResult = {
  passed: boolean; score: number; minors: number; majors: number;
  faults: Fault[]; tags: string[]; durationSeconds: number;
};
```

Line 24 becomes:

```ts
    const severity = endT - runStart >= SUSTAINED_MS ? "major" : "minor";
```

and `aggregate`:

```ts
export function aggregate(faults: Fault[], durationSeconds: number): MockResult {
  const minors = faults.filter((f) => f.severity === "minor").length;
  const majors = faults.filter((f) => f.severity === "major").length;
  return {
    passed: majors === 0 && minors <= 15,
    score: Math.max(0, 100 - 5 * minors - 40 * majors),
    minors, majors, faults,
    tags: [...new Set(faults.map((f) => f.tag))],
    durationSeconds,
  };
}
```

- [ ] **Step 4: Update the result screen**

`app/route/[id]/result.tsx` line 49:

```tsx
            {result.minors} minor{result.minors === 1 ? "" : "s"} · {result.majors} major{result.majors === 1 ? "" : "s"} · {mins} min {secs} s · score {result.score}
```

lines 59-60:

```tsx
              <Text className={`text-[10px] font-bold uppercase ${f.severity === "major" ? "text-danger" : "text-warning"}`}>
                {f.severity}
```

- [ ] **Step 5: Update the store test**

`src/stores/__tests__/mockTestStore.test.ts:35` needs no change — it asserts `severity: "minor"`, which is unchanged. Confirm by reading it; do not edit if it already passes.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` then `npm test`
Expected: tsc clean, 97 passing. Confirm no `"serious"` remains: `grep -rn '"serious"' src app` returns nothing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: call the severe fault level major, as learners do"
```

---

### Task 2: Credits and the fail cap

**Files:**
- Modify: `src/lib/scoring/engine.ts` (`MockResult`, `aggregate`)
- Modify: `src/lib/scoring/__tests__/engine.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `majors` / `"minor" | "major"`.
- Produces: `aggregate(faults: Fault[], durationSeconds: number, credits?: number): MockResult`, and `MockResult.credits: number`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/scoring/__tests__/engine.test.ts`:

```ts
const mkMinor = { kind: "speeding" as const, severity: "minor" as const, detail: "", tag: "Speeding" };
const mkMajor = { ...mkMinor, severity: "major" as const };

test("credits lift a passing score but are capped at ten", () => {
  expect(aggregate([], 60, 0).score).toBe(100);
  expect(aggregate([mkMinor, mkMinor], 60, 4).score).toBe(94); // 100 - 10 + 4
  expect(aggregate([mkMinor, mkMinor], 60, 40).score).toBe(100); // 100 - 10 + 10, clamped by the 100 ceiling
  expect(aggregate([mkMinor, mkMinor, mkMinor, mkMinor], 60, 40).score).toBe(90); // 100 - 20 + 10
});

test("credits never change the verdict", () => {
  expect(aggregate([mkMajor], 60, 10).passed).toBe(false);
  const sixteen = Array.from({ length: 16 }, () => mkMinor);
  expect(aggregate(sixteen, 60, 10).passed).toBe(false);
});

test("a failed test can never show a pass-looking score", () => {
  // One major, no other faults, ten credits: 100 - 40 + 10 = 70 before the cap.
  expect(aggregate([mkMajor], 60, 10).score).toBe(55);
  const sixteen = Array.from({ length: 16 }, () => mkMinor);
  expect(aggregate(sixteen, 60, 10).score).toBeLessThanOrEqual(55);
});

test("credits default to zero so existing callers are unaffected", () => {
  expect(aggregate([mkMinor], 60).score).toBe(95);
  expect(aggregate([mkMinor], 60).credits).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/scoring`
Expected: FAIL — `aggregate` takes two arguments, and `credits` is not on `MockResult`.

- [ ] **Step 3: Implement**

In `src/lib/scoring/engine.ts`, add `credits: number` to `MockResult` and replace `aggregate`:

```ts
// Credits are this app's own idea — DVSA records faults only. They are worth a
// few points of encouragement on the practice score and nothing at all on the
// verdict, because telling someone they passed when they would not have is the
// one failure this app cannot afford.
export const MAX_CREDIT_POINTS = 10;
const FAILED_SCORE_CEILING = 55;

export function aggregate(faults: Fault[], durationSeconds: number, credits = 0): MockResult {
  const minors = faults.filter((f) => f.severity === "minor").length;
  const majors = faults.filter((f) => f.severity === "major").length;
  const passed = majors === 0 && minors <= 15;

  const raw = 100 - 5 * minors - 40 * majors + Math.min(credits, MAX_CREDIT_POINTS);
  const bounded = Math.max(0, Math.min(100, raw));

  return {
    passed,
    // A failed test must not read like a comfortable pass, however many
    // credits were banked.
    score: passed ? bounded : Math.min(bounded, FAILED_SCORE_CEILING),
    minors, majors, credits, faults,
    tags: [...new Set(faults.map((f) => f.tag))],
    durationSeconds,
  };
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx jest src/lib/scoring`, then `npx tsc --noEmit`, then `npm test`.
Expected: all passing.

```bash
git add -A
git commit -m "feat: credits lift the practice score without buying a pass"
```

---

### Task 3: DVSA categories

**Files:**
- Create: `src/lib/examiner.ts`
- Test: `src/lib/__tests__/examiner.test.ts`

**Interfaces:**
- Consumes: `Fault` from `@/lib/scoring/engine`.
- Produces:
  - `type ExaminerGroup = "driving" | "manoeuvres" | "beforeDriving"`
  - `type MarkLevel = "minor" | "major" | "credit"`
  - `type ExaminerCategory = { id: string; label: string; group: ExaminerGroup; minorExample: string; majorExample: string }`
  - `EXAMINER_CATEGORIES: readonly ExaminerCategory[]`
  - `type Mark = { category: string; level: MarkLevel; t: number; at: LatLng | null }`
  - `marksToFaults(marks: Mark[]): Fault[]`
  - `creditCount(marks: Mark[]): number`
  - `minorCountsByCategory(marks: Mark[]): Record<string, number>`
  - `HABITUAL_MINOR_THRESHOLD = 3`
  - `habitualWarnings(marks: Mark[]): { category: string; label: string; count: number }[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/examiner.test.ts`:

```ts
import {
  creditCount, EXAMINER_CATEGORIES, HABITUAL_MINOR_THRESHOLD, habitualWarnings,
  marksToFaults, minorCountsByCategory, type Mark,
} from "../examiner";

const mk = (category: string, level: Mark["level"], t = 0): Mark =>
  ({ category, level, t, at: null });

test("the categories are DVSA's, grouped by when they can be marked", () => {
  const byGroup = (g: string) => EXAMINER_CATEGORIES.filter((c) => c.group === g);
  expect(byGroup("driving")).toHaveLength(16);
  expect(byGroup("manoeuvres")).toHaveLength(4);
  expect(byGroup("beforeDriving")).toHaveLength(3);
});

test("category ids are unique and every one is fully described", () => {
  const ids = EXAMINER_CATEGORIES.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const c of EXAMINER_CATEGORIES) {
    expect(c.label.length).toBeGreaterThan(0);
    // Both examples exist because no category is inherently one level or the
    // other — the panel has to show where the line falls for each.
    expect(c.minorExample.length).toBeGreaterThan(0);
    expect(c.majorExample.length).toBeGreaterThan(0);
  }
});

test("the categories DVSA excludes from a car test are absent", () => {
  const ids = EXAMINER_CATEGORIES.map((c) => c.id);
  expect(ids).not.toContain("uncoupling");
  expect(ids).not.toContain("ecoDriving");
});

test("marksToFaults converts fault marks and drops credits", () => {
  const faults = marksToFaults([
    mk("mirrors", "minor"), mk("junctions", "major"), mk("control", "credit"),
  ]);
  expect(faults).toHaveLength(2);
  expect(faults[0]).toMatchObject({ kind: "examiner", severity: "minor", tag: "Use of mirrors" });
  expect(faults[1]).toMatchObject({ kind: "examiner", severity: "major", tag: "Junctions" });
});

test("marksToFaults ignores an unknown category rather than crashing", () => {
  expect(marksToFaults([mk("nonsense", "minor")])).toEqual([]);
});

test("creditCount counts only credits", () => {
  expect(creditCount([mk("a", "credit"), mk("b", "credit"), mk("c", "minor")])).toBe(2);
});

test("minorCountsByCategory counts minors per category, ignoring majors and credits", () => {
  const counts = minorCountsByCategory([
    mk("mirrors", "minor"), mk("mirrors", "minor"), mk("mirrors", "credit"),
    mk("mirrors", "major"), mk("speed", "minor"),
  ]);
  expect(counts).toEqual({ mirrors: 2, speed: 1 });
});

test("habitualWarnings fires at the threshold, not before", () => {
  const two = [mk("mirrors", "minor"), mk("mirrors", "minor")];
  expect(habitualWarnings(two)).toEqual([]);

  const three = [...two, mk("mirrors", "minor")];
  expect(habitualWarnings(three)).toEqual([
    { category: "mirrors", label: "Use of mirrors", count: 3 },
  ]);
});

test("HABITUAL_MINOR_THRESHOLD is a warning, well under the fifteen-minor limit", () => {
  // DVSA gives no number for "habitually" — this warns, it never auto-escalates.
  expect(HABITUAL_MINOR_THRESHOLD).toBeGreaterThan(1);
  expect(HABITUAL_MINOR_THRESHOLD).toBeLessThan(15);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/examiner.test.ts`
Expected: FAIL — cannot find module `../examiner`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/examiner.ts`:

```ts
import type { LatLng } from "./geo";
import type { Fault } from "./scoring/engine";

export type ExaminerGroup = "driving" | "manoeuvres" | "beforeDriving";
export type MarkLevel = "minor" | "major" | "credit";

export type ExaminerCategory = {
  id: string;
  label: string;
  group: ExaminerGroup;
  minorExample: string;
  majorExample: string;
};

// DVSA's own category names, off the DL25 test report. A learner is emailed
// these exact words after a real test, so a mock using anything else cannot be
// compared with it.
//
// No category is inherently a minor or a major: the same row can be marked as a
// driving fault, serious, or dangerous depending on the incident. That is why
// every category carries both examples, and why the panel shows MIN and MAJ on
// every row.
export const EXAMINER_CATEGORIES: readonly ExaminerCategory[] = [
  { id: "control", label: "Control", group: "driving", minorExample: "Stalling, jerky gear change, coasting", majorExample: "Stall that blocks a junction; losing control" },
  { id: "moveOff", label: "Move off", group: "driving", minorExample: "Slightly late blind spot check", majorExample: "Pulling out into traffic; no observation at all" },
  { id: "mirrors", label: "Use of mirrors", group: "driving", minorExample: "Missed check where nothing was coming", majorExample: "Changing direction or braking hard into someone unseen" },
  { id: "signals", label: "Signals", group: "driving", minorExample: "Late, or left flashing after the turn", majorExample: "A signal that misleads someone into moving" },
  { id: "junctions", label: "Junctions", group: "driving", minorExample: "Approaching a touch fast; slightly wide", majorExample: "Emerging into a gap that forces someone to brake" },
  { id: "judgement", label: "Judgement", group: "driving", minorExample: "Hesitant on an overtake", majorExample: "Overtaking into oncoming traffic; cutting in" },
  { id: "positioning", label: "Positioning", group: "driving", minorExample: "Drifting within the lane", majorExample: "Wrong side of the road; wrong roundabout lane into conflict" },
  { id: "clearance", label: "Clearance to obstructions", group: "driving", minorExample: "Passing a parked car a bit close", majorExample: "Close enough that a door or pedestrian would be hit" },
  { id: "followingDistance", label: "Following distance", group: "driving", minorExample: "Briefly closer than two seconds", majorExample: "Tailgating; no room to stop" },
  { id: "speed", label: "Use of speed", group: "driving", minorExample: "A few mph over, briefly", majorExample: "Well over the limit — a breach of the law is serious by definition" },
  { id: "progress", label: "Progress", group: "driving", minorExample: "Over-cautious; a bit slow for the road", majorExample: "Stopping dead where it endangers others; refusing every gap" },
  { id: "signsAndSignals", label: "Response to signs and signals", group: "driving", minorExample: "Late reaction to a sign", majorExample: "Through a red light; ignoring a give way" },
  { id: "pedestrianCrossings", label: "Pedestrian crossings", group: "driving", minorExample: "Approaching too fast at a clear crossing", majorExample: "Failing to give way to someone on the crossing" },
  { id: "normalStops", label: "Position and normal stops", group: "driving", minorExample: "Stopping slightly awkwardly", majorExample: "Stopping somewhere that blocks or endangers" },
  { id: "awarenessPlanning", label: "Awareness and planning", group: "driving", minorExample: "Late to spot a developing hazard", majorExample: "Missing a cyclist or pedestrian entirely" },
  { id: "ancillaryControls", label: "Ancillary controls", group: "driving", minorExample: "Fumbling for the wipers", majorExample: "Losing control while reaching for something" },

  { id: "reversePark", label: "Reverse park", group: "manoeuvres", minorExample: "Ending up a little out of position", majorExample: "Reversing into the road without looking" },
  { id: "forwardPark", label: "Forward park", group: "manoeuvres", minorExample: "Poor accuracy in the bay", majorExample: "Leaving the bay without all-round observation" },
  { id: "pullUpOnRight", label: "Pull up on the right", group: "manoeuvres", minorExample: "Untidy positioning at the kerb", majorExample: "Crossing into traffic without checking" },
  { id: "controlledStop", label: "Controlled stop", group: "manoeuvres", minorExample: "Slow to react to the signal", majorExample: "Locking the wheels; losing control under braking" },

  { id: "eyesight", label: "Eyesight check", group: "beforeDriving", minorExample: "Needed a second attempt", majorExample: "Could not read the plate — a real test ends here" },
  { id: "precautions", label: "Precautions", group: "beforeDriving", minorExample: "Mirror or seat not quite set", majorExample: "Starting in gear; door not secure" },
  { id: "vehicleChecks", label: "Vehicle checks", group: "beforeDriving", minorExample: "One show-me tell-me answer wrong", majorExample: "Losing control while demonstrating one on the move" },
];

export type Mark = {
  category: string;
  level: MarkLevel;
  t: number;
  at: LatLng | null;
};

const byId = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c]));

// A mark from an unknown category is dropped rather than thrown: a stale mark
// should never be able to take down the result screen at the end of a drive.
export function marksToFaults(marks: Mark[]): Fault[] {
  return marks.flatMap((m) => {
    if (m.level === "credit") return [];
    const category = byId.get(m.category);
    if (!category) return [];
    return [{
      kind: "examiner" as const,
      severity: m.level,
      tag: category.label,
      detail: m.level === "major" ? category.majorExample : category.minorExample,
    }];
  });
}

export function creditCount(marks: Mark[]): number {
  return marks.filter((m) => m.level === "credit").length;
}

export function minorCountsByCategory(marks: Mark[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of marks) {
    if (m.level !== "minor") continue;
    counts[m.category] = (counts[m.category] ?? 0) + 1;
  }
  return counts;
}

// DVSA: a candidate "who habitually commits a driving fault in one aspect of
// driving throughout the test cannot be regarded as competent to pass. The
// repeated fault can then be assessed as potentially dangerous."
//
// No number is given, because "habitually" is the examiner's judgement. So this
// warns and never escalates on its own — silently failing someone against an
// invented threshold would be worse than saying nothing.
export const HABITUAL_MINOR_THRESHOLD = 3;

export function habitualWarnings(marks: Mark[]): { category: string; label: string; count: number }[] {
  return Object.entries(minorCountsByCategory(marks))
    .filter(([, count]) => count >= HABITUAL_MINOR_THRESHOLD)
    .map(([category, count]) => ({ category, label: byId.get(category)?.label ?? category, count }));
}
```

- [ ] **Step 4: Widen the Fault kind**

`marksToFaults` produces `kind: "examiner"`, which `Fault` does not yet allow. In `src/lib/scoring/engine.ts`:

```ts
export type Fault = { kind: "speeding" | "observation" | "examiner"; severity: "minor" | "major"; detail: string; tag: string };
```

- [ ] **Step 5: Verify and commit**

Run: `npx jest src/lib/__tests__/examiner.test.ts`, then `npx tsc --noEmit`, then `npm test`.
Expected: all passing.

```bash
git add -A
git commit -m "feat: DVSA fault categories and examiner marks"
```

---

### Task 4: Marks in the mock test store

**Files:**
- Modify: `src/stores/mockTestStore.ts`
- Test: `src/stores/__tests__/mockTestStore.test.ts` (append)

**Interfaces:**
- Consumes: `Mark`, `marksToFaults`, `creditCount`, `habitualWarnings`, `minorCountsByCategory` from `@/lib/examiner`; `aggregate` (3-arg) from Task 2.
- Produces on the store: `marks: Mark[]`, `addMark(category: string, level: MarkLevel, at?: LatLng | null, now?: number): void`, `undoMark(): void`, plus `finish()` folding examiner marks into the result.

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/__tests__/mockTestStore.test.ts`:

```ts
import { HABITUAL_MINOR_THRESHOLD } from "@/lib/examiner";

test("addMark records the mark with its time and place", () => {
  const s = useMockTest.getState();
  s.reset();
  s.addMark("mirrors", "minor", { lat: 51.5, lng: -0.1 }, 1000);
  expect(useMockTest.getState().marks).toEqual([
    { category: "mirrors", level: "minor", t: 1000, at: { lat: 51.5, lng: -0.1 } },
  ]);
});

test("undoMark removes the last mark, and does nothing when there are none", () => {
  const s = useMockTest.getState();
  s.reset();
  expect(() => s.undoMark()).not.toThrow();
  s.addMark("mirrors", "minor", null, 1);
  s.addMark("speed", "major", null, 2);
  useMockTest.getState().undoMark();
  expect(useMockTest.getState().marks.map((m) => m.category)).toEqual(["mirrors"]);
});

test("examiner marks reach the result as faults and credits", () => {
  const s = useMockTest.getState();
  s.reset();
  s.start(route, 0);
  useMockTest.getState().addMark("mirrors", "minor", null, 1);
  useMockTest.getState().addMark("junctions", "major", null, 2);
  useMockTest.getState().addMark("control", "credit", null, 3);
  const r = useMockTest.getState().finish(60_000);
  expect(r.minors).toBeGreaterThanOrEqual(1);
  expect(r.majors).toBe(1);
  expect(r.credits).toBe(1);
  expect(r.passed).toBe(false); // one major fails, credit notwithstanding
  expect(r.tags).toContain("Use of mirrors");
});

test("reset clears marks", () => {
  const s = useMockTest.getState();
  s.reset();
  s.addMark("mirrors", "minor", null, 1);
  useMockTest.getState().reset();
  expect(useMockTest.getState().marks).toEqual([]);
});

test("repeated minors on one category surface as a warning", () => {
  const s = useMockTest.getState();
  s.reset();
  for (let i = 0; i < HABITUAL_MINOR_THRESHOLD; i++) {
    useMockTest.getState().addMark("mirrors", "minor", null, i);
  }
  expect(useMockTest.getState().warnings()).toEqual([
    { category: "mirrors", label: "Use of mirrors", count: HABITUAL_MINOR_THRESHOLD },
  ]);
});
```

Read the existing top of that test file first — it already defines a `route` fixture. Reuse it rather than declaring another.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/stores/__tests__/mockTestStore.test.ts`
Expected: FAIL — `addMark` is not a function.

- [ ] **Step 3: Implement**

In `src/stores/mockTestStore.ts`, add to the imports:

```ts
import { creditCount, habitualWarnings, marksToFaults, type Mark, type MarkLevel } from "@/lib/examiner";
import type { LatLng } from "@/lib/geo";
```

Add `marks: Mark[]` to `MockState` and to `initial` (`marks: []`), plus these members on the type:

```ts
  addMark: (category: string, level: MarkLevel, at?: LatLng | null, now?: number) => void;
  undoMark: () => void;
  warnings: () => { category: string; label: string; count: number }[];
```

Implement them on the store:

```ts
  addMark: (category, level, at = null, now = Date.now()) =>
    set({ marks: [...get().marks, { category, level, t: now, at }] }),

  // Mis-taps in a moving car are certain, and a stray major would otherwise
  // fail the test silently.
  undoMark: () => set({ marks: get().marks.slice(0, -1) }),

  warnings: () => habitualWarnings(get().marks),
```

In `finish`, fold the examiner marks in alongside the automatic ones:

```ts
    const marks = get().marks;
    const faults = [
      ...detectSpeedingFaults(samples, coords, route?.speed_profile ?? []),
      ...detectObservationFaults(outcomes.map((o) => ({ zone: route!.observation_zones[o.zoneIdx], tapped: o.tapped }))),
      ...marksToFaults(marks),
    ];
    const result = aggregate(faults, Math.round((now - startedAt) / 1000), creditCount(marks));
```

- [ ] **Step 4: Verify and commit**

Run: `npx jest src/stores`, then `npx tsc --noEmit`, then `npm test`.

```bash
git add -A
git commit -m "feat: examiner marks in the mock test store"
```

---

### Task 5: The examiner sheet

**Files:**
- Create: `src/ui/ExaminerSheet.tsx`
- Test: `src/ui/__tests__/examinerSheet.test.tsx`

**Interfaces:**
- Consumes: `EXAMINER_CATEGORIES`, `MarkLevel`, `HABITUAL_MINOR_THRESHOLD` from `@/lib/examiner`; `colors` from `@/ui/theme`.
- Produces: `ExaminerSheet(props)` where

```ts
type Props = {
  minors: number;
  majors: number;
  credits: number;
  lastMark: { label: string; level: MarkLevel } | null;
  minorCounts: Record<string, number>;
  warnings: { category: string; label: string; count: number }[];
  onMark: (category: string, level: MarkLevel) => void;
  onUndo: () => void;
};
```

The component is presentational — it holds no marks of its own. That keeps it testable and keeps the store the single source of truth.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/examinerSheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ExaminerSheet } from "../ExaminerSheet";
import { EXAMINER_CATEGORIES } from "@/lib/examiner";

const base = {
  minors: 0, majors: 0, credits: 0, lastMark: null,
  minorCounts: {}, warnings: [],
  onMark: jest.fn(), onUndo: jest.fn(),
};

test("the collapsed bar shows the running tally", () => {
  render(<ExaminerSheet {...base} minors={3} majors={1} credits={4} />);
  expect(screen.getByTestId("tally-minors")).toHaveTextContent("3 min");
  expect(screen.getByTestId("tally-majors")).toHaveTextContent("1 maj");
  expect(screen.getByTestId("tally-credits")).toHaveTextContent("+4");
});

test("every category gets a minor, a major and a credit button", () => {
  render(<ExaminerSheet {...base} />);
  for (const c of EXAMINER_CATEGORIES) {
    expect(screen.getByTestId(`mark-${c.id}-minor`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-major`)).toBeTruthy();
    expect(screen.getByTestId(`mark-${c.id}-credit`)).toBeTruthy();
  }
});

test("pressing a button reports the category and level", () => {
  const onMark = jest.fn();
  render(<ExaminerSheet {...base} onMark={onMark} />);
  fireEvent.press(screen.getByTestId("mark-mirrors-major"));
  expect(onMark).toHaveBeenCalledWith("mirrors", "major");
});

test("undo is offered only once something has been marked", () => {
  const onUndo = jest.fn();
  const { rerender } = render(<ExaminerSheet {...base} />);
  expect(screen.queryByTestId("undo")).toBeNull();

  rerender(<ExaminerSheet {...base} lastMark={{ label: "Use of mirrors", level: "minor" }} onUndo={onUndo} />);
  fireEvent.press(screen.getByTestId("undo"));
  expect(onUndo).toHaveBeenCalledTimes(1);
});

test("a repeated minor is called out on the row and in the bar", () => {
  render(
    <ExaminerSheet
      {...base}
      minorCounts={{ mirrors: 3 }}
      warnings={[{ category: "mirrors", label: "Use of mirrors", count: 3 }]}
    />
  );
  expect(screen.getByTestId("warning-mirrors")).toBeTruthy();
  expect(screen.getByTestId("warning-bar")).toHaveTextContent("Use of mirrors");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/ui/__tests__/examinerSheet.test.tsx`
Expected: FAIL — cannot find module `../ExaminerSheet`.

- [ ] **Step 3: Implement**

Create `src/ui/ExaminerSheet.tsx`. Structure it as a plain `View` tree — the caller wraps it in the bottom sheet, which keeps this component renderable in tests without mocking `@gorhom/bottom-sheet`.

Requirements the test pins, plus the ones it cannot:

- A collapsed bar with `testID` `tally-minors`, `tally-majors`, `tally-credits`.
- When `lastMark` is set, show its label and level plus a pressable with `testID="undo"`.
- When `warnings` is non-empty, a `testID="warning-bar"` containing the first warning's label.
- Rows grouped by `group`, in the order `driving`, `manoeuvres`, `beforeDriving`, with a group heading per section.
- Each row: the label, its `minorExample` in small muted text, and three pressables with `testID` `mark-<id>-minor|major|credit`, labelled `MIN`, `MAJ`, `+`.
- Rows whose `minorCounts[id] >= HABITUAL_MINOR_THRESHOLD` render an amber `testID={`warning-${id}`}` badge showing the count.
- Buttons are at minimum 44 pt tall — this is tapped in a moving car.
- Amber for minor (`#B45309` on `#FEF3C7`), red for major (`#B91C1C` on `#FEE2E2`), emerald for credit (`colors.accent` on `#ECFDF5`).
- No emoji.

- [ ] **Step 4: Verify and commit**

Run: `npx jest src/ui/__tests__/examinerSheet.test.tsx`, then `npx tsc --noEmit`, then `npm test`.

```bash
git add -A
git commit -m "feat: examiner marking sheet"
```

---

### Task 6: Extract the per-fix decision logic

**Files:**
- Create: `src/lib/navmap.ts`
- Test: `src/lib/__tests__/navmap.test.ts`
- Modify: `app/route/[id]/practice.tsx` — `onPosition` calls the new function instead of inlining the logic

**Interfaces:**
- Consumes: `snapToPath`, `smoothHeading`, `turnAngleDeg`, `iconRotationDeg`, `LatLng` from `@/lib/geo`; `travelBearing`, `navZoom`, `NAV_ZOOM_MID` from `@/lib/navigation`.
- Produces:

```ts
export type NavFixInput = {
  raw: LatLng;
  mph: number;
  gpsCourse: number | null;
  coords: LatLng[];
  trailIdx: number;
  mapBearing: number;
  compass: number;
  bearingSeeded: boolean;
  zoom: number;
  distanceToManeuverM: number | null;  // null when the screen has no steps
};

export type NavFixResult = {
  pos: LatLng;
  onRoute: boolean;
  trailIdx: number;
  mapBearing: number;
  iconRotation: number;
  zoom: number;
};

export function navFix(input: NavFixInput): NavFixResult;
```

This is the logic the last code review asked to extract: it lives in an untested screen today, and two of the bugs that survived every gate lived here. Pulling it into a pure function is what makes it testable without mocking Mapbox.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/navmap.test.ts`:

```ts
import { navFix, type NavFixInput } from "../navmap";
import { NAV_ZOOM_MID } from "../navigation";

// A north-bound line, 11 vertices about 111 m apart.
const line = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));

const base: NavFixInput = {
  raw: { lat: 51.5055, lng: -0.10005 },
  mph: 20,
  gpsCourse: null,
  coords: line,
  trailIdx: 5,
  mapBearing: 0,
  compass: 0,
  bearingSeeded: true,
  zoom: NAV_ZOOM_MID,
  distanceToManeuverM: 300,
};

test("an on-route fix is snapped onto the line", () => {
  const r = navFix(base);
  expect(r.onRoute).toBe(true);
  expect(r.pos.lng).toBeCloseTo(-0.1, 5);
});

test("a fix well off the route is left where it is", () => {
  const r = navFix({ ...base, raw: { lat: 51.5055, lng: -0.102 } });
  expect(r.onRoute).toBe(false);
  expect(r.pos.lng).toBeCloseTo(-0.102, 5);
});

test("the trail index never rewinds", () => {
  const r = navFix({ ...base, raw: { lat: 51.5005, lng: -0.1 }, trailIdx: 7 });
  expect(r.trailIdx).toBeGreaterThanOrEqual(7);
});

test("standing still holds the map bearing", () => {
  // The rule the whole rotation model rests on: no travel, no map rotation.
  const r = navFix({ ...base, mph: 0, mapBearing: 137 });
  expect(r.mapBearing).toBe(137);
});

test("moving eases the map bearing towards the road", () => {
  const r = navFix({ ...base, mapBearing: 90 });
  // The line runs due north, so the bearing should move down from 90 towards 0.
  expect(r.mapBearing).toBeLessThan(90);
  expect(r.mapBearing).toBeGreaterThan(0);
});

test("the first fix of a leg snaps the bearing rather than easing", () => {
  const r = navFix({ ...base, bearingSeeded: false, mapBearing: 90 });
  expect(r.mapBearing).toBeCloseTo(0, 0);
});

test("icon rotation is the compass measured against the map", () => {
  const r = navFix({ ...base, mapBearing: 100, compass: 190, mph: 0 });
  expect(r.iconRotation).toBe(90);
});

test("zoom passes through navZoom, and holds when there is no manoeuvre", () => {
  expect(navFix({ ...base, distanceToManeuverM: 80 }).zoom).toBeGreaterThan(NAV_ZOOM_MID);
  expect(navFix({ ...base, distanceToManeuverM: null, zoom: NAV_ZOOM_MID }).zoom).toBe(NAV_ZOOM_MID);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/navmap.test.ts`
Expected: FAIL — cannot find module `../navmap`.

- [ ] **Step 3: Implement**

Create `src/lib/navmap.ts`. Move the constants and the logic currently inside `onPosition` in `practice.tsx` (the snap block, the map-bearing block, the icon rotation, and the zoom line) into it verbatim — this is a move, not a rewrite:

```ts
import { iconRotationDeg, LatLng, smoothHeading, snapToPath, turnAngleDeg } from "./geo";
import { navZoom, trailIndex, travelBearing } from "./navigation";
```

```ts
export const SNAP_MAX_M = 40;          // beyond this we assume you've left the route
export const SNAP_WINDOW = 30;         // vertices searched either side of the current index
export const HEADING_ALPHA = 0.15;     // map bearing: heavy filter, it should feel settled
export const HEADING_DEADBAND_DEG = 3;
```

`navFix` then, in order: snap; decide `pos` and `onRoute`; compute the travel bearing and either seed or ease `mapBearing`; take `trailIdx` from the snap when on-route and from `trailIndex` otherwise; compute `iconRotation`; compute `zoom` via `navZoom(distanceToManeuverM, zoom)` when the distance is non-null and pass `zoom` straight through when it is null.

- [ ] **Step 4: Rewire practice.tsx**

In `onPosition`, replace the inlined snap, bearing, icon and zoom blocks with a single `navFix` call, threading its results into the existing refs and state (`mapBearingRef`, `compassRef`, `zoomRef`, `trailRef`, `setPos`, `setIconRotation`). Delete the constants that moved. Keep everything else — the fallback branch, the no-steps branch, voice prompts, step advancement — exactly as it is.

- [ ] **Step 5: Verify and commit**

Run: `npx jest src/lib/__tests__/navmap.test.ts`, then `npx tsc --noEmit`, then `npm test`.
Expected: all passing, no change in behaviour.

```bash
git add -A
git commit -m "refactor: extract the per-fix nav decision into a pure function"
```

---

### Task 7: Extract NavMap

**Files:**
- Create: `src/ui/NavMap.tsx`
- Modify: `app/route/[id]/practice.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6 and earlier.
- Produces:

```ts
export type NavMapHandle = { recenter: () => void; fitBounds: () => void };

export type NavMapProps = {
  routeLL: LatLng[];              // the full active polyline
  trailIdx: number;               // split point: grey behind, emerald ahead
  pos: LatLng | null;             // already-snapped position
  iconRotation: number;
  mapBearing: number;
  zoom: number;
  follow: boolean;
  onFollowChange: (following: boolean) => void;
  showStartFinish?: boolean;      // default true
  observationZones?: ObservationZone[];   // drawn as amber discs; default none
  children?: React.ReactNode;     // extra map overlays, e.g. hazard pins
};
```

`ObservationZone` comes from `@/types/db`. `LatLng` comes from `@/lib/geo`. Draw the zones with a `ShapeSource` of GeoJSON `Point`s plus a `CircleLayer`, radius interpolated by zoom from each zone's `radiusM`; amber `#D97706` at low opacity with a dashed edge, matching the design artifact.

**This task is a pure move. No behaviour may change.** The practice screen has not been confirmed on a device; mixing a refactor with a behaviour change would make a pre-existing bug indistinguishable from one this caused.

- [ ] **Step 1: Create NavMap by moving code**

Move into `src/ui/NavMap.tsx`, unchanged: the `MapView` element and its props, the memoised `baseLayers` block, the `Camera` element and `pushCamera`, the padding maths, the touch and `onCameraChanged` follow detection, the route `ShapeSource`/`LineLayer` pairs including the travelled/ahead split, the start and finish `MarkerView`s, and the `NavPuck` marker.

Expose `recenter` and `fitBounds` through `useImperativeHandle` on a `forwardRef`.

- [ ] **Step 2: Make practice.tsx use it**

Replace the whole `<MapView>…</MapView>` block in `practice.tsx` with `<NavMap ref={mapRef} … >` passing the hazard `PointAnnotation`s as children. `recenter` calls `mapRef.current?.recenter()`; `fitPreview` calls `mapRef.current?.fitBounds()`.

- [ ] **Step 3: Verify the move changed nothing**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run check:map-style`.
Expected: tsc clean, all tests passing, style check OK.

Then confirm by inspection that no constant, colour, width, or threshold differs from the previous commit:

Run: `git diff HEAD~1 -- src/ui/NavMap.tsx "app/route/[id]/practice.tsx" | grep -E '^[+-].*(0x|#[0-9A-Fa-f]{6}|[0-9]+\.[0-9]+|lineWidth|Alpha|_MS|_M\b)' | sort`
Read the output: every `+` line should have a matching `-` line with the same value. Report anything that does not.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: extract the shared nav map, no behaviour change"
```

---

### Task 8: The mock test screen

**Files:**
- Modify: `app/route/[id]/mock.tsx` (substantial rewrite of the map half)

**Interfaces:**
- Consumes: `NavMap` (Task 7), `navFix` (Task 6), `ExaminerSheet` (Task 5), the store's `addMark`/`undoMark`/`warnings`/`marks` (Task 4).
- Produces: nothing.

- [ ] **Step 1: Replace Apple Maps with NavMap**

Drop the `react-native-maps` import. Add the position/heading watching that `practice.tsx` uses — `watchPositionAsync` with `Accuracy.BestForNavigation` and `watchHeadingAsync` — and feed each fix through `navFix`, holding `mapBearingRef`, `compassRef`, `zoomRef`, `trailRef` and `iconRotation` exactly as `practice.tsx` does.

A mock test has no turn steps, so pass `distanceToManeuverM: null` to `navFix`; the zoom then holds at `NAV_ZOOM_MID` throughout.

- [ ] **Step 2: Keep scoring on raw GPS**

`onSample` must continue to receive the **untouched** fix:

```ts
        (loc) => {
          const c = loc.coords;
          // Scoring sees the raw fix, never the snapped one. Snapping assumes
          // you are on the route, and a mock test is exactly where someone
          // might not be — it could otherwise credit an observation zone the
          // driver never entered.
          onSample({ lat: c.latitude, lng: c.longitude, speedMps: Math.max(0, c.speed ?? 0), t: loc.timestamp });
          // ...then navFix for the display
        }
```

Keep `distanceInterval: 5` as it is today, so recorded tests stay comparable with earlier ones.

- [ ] **Step 3: Draw the observation zones**

Pass `observationZones={route?.observation_zones ?? []}` to `NavMap`.

- [ ] **Step 4: Add the sheet**

Wrap `ExaminerSheet` in a `BottomSheet` with `snapPoints={["12%", "85%"]}` and `index={0}`, matching the hazard sheet already in `practice.tsx`. Wire:

```tsx
<ExaminerSheet
  minors={minors} majors={majors} credits={credits}
  lastMark={lastMark} minorCounts={minorCounts} warnings={warnings()}
  onMark={(category, level) => {
    Haptics.impactAsync(level === "major" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    addMark(category, level, posRef.current);
  }}
  onUndo={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); undoMark(); }}
/>
```

Derive `minors`, `majors`, `credits`, `lastMark` and `minorCounts` from the store's `marks` with `useMemo`.

- [ ] **Step 5: Move the mirrors button clear of the puck**

The puck sits at 62% of screen height and the mirrors button is centred near there. Move the button to `bottom: 150` so it clears both the puck and the collapsed sheet, and check the finish button and zone toast still have room.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run check:map-style`.

State in the report that on-device verification was NOT performed.

```bash
git add -A
git commit -m "feat: mock test gets the shared nav map and the examiner sheet"
```

---

### Task 9: The result screen

**Files:**
- Modify: `app/route/[id]/result.tsx`

**Interfaces:**
- Consumes: `MockResult.credits`, `MockResult.majors` (Tasks 1 and 2); `Mark` from the store.
- Produces: nothing.

- [ ] **Step 1: Add "What went well"**

Above the fault list, when `result.credits > 0`, render a section listing the credited category labels with a count each. Derive them from the store's `marks` filtered to `level === "credit"`, grouped by category. Heading: `What went well`.

- [ ] **Step 2: Show when each fault happened**

Examiner faults carry a time. Where a fault has one, append it to the detail line as `m:ss` from the start of the test. Faults without a time (speeding, observation) are unchanged.

Note: `Fault` does not carry the timestamp today. Rather than widen `Fault`, read the marks from the store and match them to examiner faults by tag and order. If that proves awkward, report it as a concern rather than widening `Fault` — that decision belongs to the human.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit`, then `npm test`.

```bash
git add -A
git commit -m "feat: result screen shows credits and when faults happened"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| 1 — terminology, minor/major rename, code rename | 1 |
| 2 — DVSA categories, groups, examples, exclusions | 3 |
| 3 — panel layout, three buttons, undo, haptics, repeated-minor warning | 3, 5, 8 |
| 4 — marks carry time and place | 3, 4 |
| 5 — credits, cap, fail ceiling, What went well, no persistence | 2, 4, 9 |
| 6 — NavMap extraction, navmap.ts, score-on-raw, mock map behaviour | 6, 7, 8 |
| 8 — testing | every task; NavMap covered by tsc and the suite staying green |
| 9 — out of scope: credit persistence, full DL25, route preview screen, sample rate | not implemented, by design |
