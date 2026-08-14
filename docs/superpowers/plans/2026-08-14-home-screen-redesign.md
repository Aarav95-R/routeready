# Home Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `app/(tabs)/index.tsx` as two cards — a diagnosis that names one fault and offers one action, over a record card that supplies the evidence.

**Architecture:** All decision-making is pure and lives in `src/lib/homeView.ts`, which gains `nextStep` (a five-shape discriminated union), `averageScore` and `durationWords`. Two new presentational components, `NextStepCard` and `RecordCard`, render those results. The screen holds no rules — it fetches, computes, and composes, matching how `centresView.ts` serves the centres screen. `listMyProgress` gains a nested select so history rows can name their route and centre.

**Tech Stack:** Expo Router, React Native, NativeWind (Tailwind), Reanimated, react-native-svg, Supabase, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-14-home-screen-redesign.md`

## Global Constraints

- **The screen holds no logic.** Every rule lives in `src/lib/homeView.ts` and is tested there directly. `app/(tabs)/index.tsx` may only fetch, call pure functions, and compose components.
- **The bars count tests, never occurrences.** `aggregate` dedupes `tags` per test, so a fault appears at most once per row. Every string must read `marked in 4 of your 5 mock tests`, never `7 faults`.
- **No verdict anywhere.** `user_progress` stores no pass/fail and it is not derivable — a failed test is capped at 55 and a pass with nine driving faults is also 55. No `Pass`/`Fail` chip, no `Passed n of m` stat.
- **No severity anywhere.** `mistakes` is a flat `string[]`. No `Serious`, no `2 driving faults`.
- **The sparkline gets no gridlines and no axis.** `ScoreSparkline`'s header comment forbids implying a scale it does not draw. Both ends stay named in words underneath.
- **Copy is sentence case, no emoji, and names things the user recognises.** Match the existing voice in `finding()`.
- **Colours come from `src/ui/theme.ts`**, whose values must stay twinned with `tailwind.config.js`.
- **Run tests with `npx jest <path>`.** Full suite is `npm test`.
- **Commit after every task.** Never use `git commit -a` — this branch carries unrelated staged deletions; always `git add` explicit paths.

## One correction to the spec

The spec says history rows format duration with `formatElapsed` from `lib/resultView.ts`. That function returns `41:00` and takes **milliseconds** — it is the mock test's running clock, and on a history row it reads as a time of day. Task 1 adds `durationWords(seconds)` returning `41 min` instead. `formatElapsed` is not touched.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/homeView.ts` | All Home arithmetic and decisions. Gains `NextStep`, `nextStep`, `averageScore`, `durationWords`. |
| `src/types/db.ts` | Gains `ProgressEntryWithRoute`. `ProgressEntry` untouched so inserts cannot be handed a joined row. |
| `src/services/progressRepo.ts` | `listMyProgress` selects the nested route and centre. |
| `src/ui/theme.ts` + `tailwind.config.js` | Gain the muted runner green. |
| `src/ui/FaultBars.tsx` | Gains `lead` — row 0 emerald, rows below muted. |
| `src/ui/NextStepCard.tsx` | Renders one `NextStep`. Owns the copy for all five shapes. |
| `src/ui/RecordCard.tsx` | Score, chart-or-line, stat row, recent tests. |
| `app/(tabs)/index.tsx` | Fetch, compute, compose. No rules. |

---

### Task 1: The decisions, as pure functions

**Files:**
- Modify: `src/lib/homeView.ts` (append after `faultCounts`)
- Test: `src/lib/__tests__/homeView.test.ts` (append)
- Test: `src/lib/scoring/__tests__/engine.test.ts` (append one test)

**Interfaces:**
- Consumes: `ScoreSummary`, `FaultCount`, both already exported from `homeView.ts`.
- Produces:
  - `type NextStep` — union of `{kind:"first"}`, `{kind:"baseline"; tags: string[]}`, `{kind:"clean"}`, `{kind:"tied"; tags: string[]}`, `{kind:"fault"; tag: string; count: number; of: number; runners: FaultCount[]}`
  - `nextStep(summary: ScoreSummary, faults: FaultCount[]): NextStep`
  - `averageScore(summary: ScoreSummary): number | null`
  - `durationWords(seconds: number): string`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/homeView.test.ts`:

```ts
describe("what to do next", () => {
  const summaryOf = (...rows: ProgressEntry[]) => scoreSummary(rows);

  test("no tests at all asks for a first one", () => {
    expect(nextStep(summaryOf(), [])).toEqual({ kind: "first" });
  });

  // One test is a day, not a habit. Because `tags` is deduped per test, a lone
  // test tagged only "Speeding" strictly beats a runner-up that does not
  // exist — without this floor, one data point would diagnose a habit.
  test("one test asks for a second, and lists what that test cost", () => {
    const rows = [at("2026-08-11T10:00:00Z", 55, ["Speeding"])];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "baseline", tags: ["Speeding"],
    });
  });

  test("a single clean test still asks for a second, with nothing to list", () => {
    const rows = [at("2026-08-11T10:00:00Z", 100)];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "baseline", tags: [],
    });
  });

  // result.tsx already renders "A clean drive — no faults recorded", so two of
  // them is reachable. Without this branch the card is built from faults[0] of
  // an empty array.
  test("tests with no faults on any of them have nothing to diagnose", () => {
    const rows = [at("2026-08-01T10:00:00Z", 100), at("2026-08-11T10:00:00Z", 95)];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({ kind: "clean" });
  });

  test("a fault leads only when it strictly beats the runner-up", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 60, ["Junction observations", "Speeding"]),
      at("2026-08-05T10:00:00Z", 65, ["Junction observations"]),
      at("2026-08-11T10:00:00Z", 70, ["Junction observations"]),
    ];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "fault",
      tag: "Junction observations",
      count: 3,
      of: 3,
      runners: [{ tag: "Speeding", count: 1 }],
    });
  });

  test("a tie at the top names every tag level with it", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 60, ["Junction observations", "Use of mirrors"]),
      at("2026-08-11T10:00:00Z", 65, ["Junction observations", "Use of mirrors", "Speeding"]),
    ];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "tied", tags: ["Junction observations", "Use of mirrors"],
    });
  });
});

test("the average is the mean of every scored attempt, rounded", () => {
  const rows = [
    at("2026-08-01T10:00:00Z", 55), at("2026-08-05T10:00:00Z", 70),
    at("2026-08-11T10:00:00Z", 88),
  ];
  expect(averageScore(scoreSummary(rows))).toBe(71);
  expect(averageScore(scoreSummary([]))).toBeNull();
});

// A practice drive writes a row with no score. scoreSummary already drops
// those, so the average must never see them.
test("the average ignores unscored rows", () => {
  const rows = [at("2026-08-01T10:00:00Z", null), at("2026-08-11T10:00:00Z", 80)];
  expect(averageScore(scoreSummary(rows))).toBe(80);
});

test("a duration reads as minutes, and never as none", () => {
  expect(durationWords(2460)).toBe("41 min");
  expect(durationWords(90)).toBe("2 min");
  expect(durationWords(20)).toBe("1 min");
  expect(durationWords(0)).toBe("1 min");
});
```

Update the import at the top of the file to:

```ts
import {
  averageScore, durationWords, faultCounts, finding, firstName, greeting,
  nextStep, scoreSummary,
} from "../homeView";
```

Then append to `src/lib/scoring/__tests__/engine.test.ts`, which pins the invariant the lead card's copy rests on:

```ts
// The home screen says "marked in 4 of your 5 mock tests". That is only true
// because a fault marked three times in one drive reaches user_progress once
// — faultCounts counts every entry in `mistakes` it is handed, so the dedupe
// has to happen here, on the way in.
test("a fault marked repeatedly in one drive is tagged once", () => {
  const speeding = {
    kind: "speeding" as const, severity: "minor" as const,
    detail: "Over the 30 mph limit for 3 s", tag: "Speeding",
  };
  const result = aggregate([speeding, speeding, speeding], 2400);

  expect(result.tags).toEqual(["Speeding"]);
  // The faults themselves are not collapsed — three of them still cost 15.
  expect(result.minors).toBe(3);
  expect(result.score).toBe(85);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/homeView.test.ts`
Expected: FAIL — `nextStep is not a function`, `averageScore is not a function`, `durationWords is not a function`.

Run: `npx jest src/lib/scoring/__tests__/engine.test.ts`
Expected: **PASS immediately.** This one is a characterisation test, not a red-green cycle — `aggregate` already dedupes, and the test exists so that a future change there breaks the home screen's copy loudly instead of silently. If it fails, stop: the copy in Task 4 is not true and the plan needs revisiting.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/homeView.ts`:

```ts
/**
 * The one thing worth doing next, and the evidence for it.
 *
 * Five shapes rather than one, because the honest answer changes with how much
 * there is to go on. `finding()` above does the smaller version of this job in
 * a single sentence; this is the version the lead card is built from.
 */
export type NextStep =
  | { kind: "first" }
  | { kind: "baseline"; tags: string[] }
  | { kind: "clean" }
  | { kind: "tied"; tags: string[] }
  | { kind: "fault"; tag: string; count: number; of: number; runners: FaultCount[] };

/**
 * `faults` is whatever `faultCounts` returned — already sorted descending with
 * ties broken alphabetically, so the runner-up is simply `faults[1]`.
 *
 * The order of these branches is the rule. A fault may lead only when there
 * are at least two tests *and* it strictly beats the runner-up. The two-test
 * floor is not decoration: `aggregate` dedupes `tags` per test, so a single
 * test tagged only "Speeding" produces one count of 1, which strictly beats a
 * runner-up that does not exist. Without the floor, one test would diagnose a
 * habit.
 */
export function nextStep(summary: ScoreSummary, faults: FaultCount[]): NextStep {
  if (summary.count === 0) return { kind: "first" };
  if (summary.count === 1) return { kind: "baseline", tags: faults.map((f) => f.tag) };
  if (faults.length === 0) return { kind: "clean" };

  const lead = faults[0];
  if (lead.count > (faults[1]?.count ?? 0)) {
    return {
      kind: "fault",
      tag: lead.tag,
      count: lead.count,
      of: summary.count,
      runners: faults.slice(1),
    };
  }
  return { kind: "tied", tags: faults.filter((f) => f.count === lead.count).map((f) => f.tag) };
}

/** The mean of every scored attempt. Null when there are none to average. */
export function averageScore(summary: ScoreSummary): number | null {
  if (summary.count === 0) return null;
  return Math.round(summary.attempts.reduce((sum, a) => sum + a.score, 0) / summary.count);
}

/**
 * "41 min" — how long a drive took, on a history row.
 *
 * Not `formatElapsed` from resultView: that returns "41:00" and takes
 * milliseconds, because it is the running clock during a mock test. A clock
 * beside a date reads as a time of day. Floored at one minute so a drive
 * abandoned after twenty seconds does not report "0 min".
 */
export function durationWords(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/homeView.test.ts src/lib/scoring/__tests__/engine.test.ts`
Expected: PASS, every test in both files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/homeView.ts src/lib/__tests__/homeView.test.ts src/lib/scoring/__tests__/engine.test.ts
git commit -m "feat: decide what Home should tell you to do next"
```

---

### Task 2: History rows learn their route and centre

**Files:**
- Modify: `src/types/db.ts` (append after `ProgressEntry`)
- Modify: `src/services/progressRepo.ts:29-38`
- Test: `src/services/__tests__/progressRepo.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `type ProgressEntryWithRoute = ProgressEntry & { routes: { name: string; centre_id: string; centres: { name: string } | null } | null }`
  - `listMyProgress(): Promise<Cached<ProgressEntryWithRoute[]>>`

A new test file rather than an addition to `repos.test.ts`: that file's supabase mock builds a fresh `select` spy on every `from()` call, so the select string cannot be inspected from outside it.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/progressRepo.test.ts`:

```ts
const mockOrder = jest.fn();
const mockSelect = jest.fn(() => ({ order: mockOrder }));
jest.mock("@/lib/supabase", () => ({
  supabase: { from: jest.fn(() => ({ select: mockSelect })) },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { listMyProgress } from "../progressRepo";

beforeEach(() => { jest.clearAllMocks(); return AsyncStorage.clear(); });

// One query, one round trip. The home screen names the route on every history
// row and must not fetch per row to do it.
test("progress rows arrive with their route and centre attached", async () => {
  mockOrder.mockResolvedValue({
    data: [{
      user_id: "u1", route_id: "r1", completed_at: "2026-08-12T10:00:00Z",
      mock_test_score: 88, mistakes: [], duration_seconds: 2460,
      routes: { name: "Route 3", centre_id: "c1", centres: { name: "Mill Hill (London)" } },
    }],
    error: null,
  });

  const r = await listMyProgress();

  expect(mockSelect).toHaveBeenCalledWith("*, routes(name, centre_id, centres(name))");
  expect(r.data[0].routes?.name).toBe("Route 3");
  expect(r.data[0].routes?.centres?.name).toBe("Mill Hill (London)");
});

// A route deleted after the test was taken. The score is still the user's and
// must survive its route going missing.
test("a row whose route is gone still carries its score", async () => {
  mockOrder.mockResolvedValue({
    data: [{
      user_id: "u1", route_id: "r1", completed_at: "2026-08-12T10:00:00Z",
      mock_test_score: 88, mistakes: [], duration_seconds: 2460, routes: null,
    }],
    error: null,
  });

  const r = await listMyProgress();

  expect(r.data[0].mock_test_score).toBe(88);
  expect(r.data[0].routes).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/progressRepo.test.ts`
Expected: FAIL — `expect(mockSelect).toHaveBeenCalledWith("*, routes(...)")` receives `"*"`.

- [ ] **Step 3: Write the implementation**

In `src/types/db.ts`, append after `ProgressEntry`:

```ts
/**
 * A progress row with its route and that route's centre joined on, which is
 * what the home screen's history rows are built from.
 *
 * Deliberately a separate type rather than optional fields on `ProgressEntry`:
 * `insertProgress` takes a `ProgressEntry` and must never be handed a row
 * carrying joined columns that do not exist on the table.
 *
 * `routes` is null for a row whose route has since been deleted.
 */
export type ProgressEntryWithRoute = ProgressEntry & {
  routes: { name: string; centre_id: string; centres: { name: string } | null } | null;
};
```

In `src/services/progressRepo.ts`, change the import on line 2 to:

```ts
import type { ProgressEntry, ProgressEntryWithRoute } from "@/types/db";
```

and replace `listMyProgress` (lines 29-38) with:

```ts
export function listMyProgress(): Promise<Cached<ProgressEntryWithRoute[]>> {
  return cachedFetch("progress:mine", async () => {
    const { data, error } = await supabase
      .from("user_progress")
      .select("*, routes(name, centre_id, centres(name))")
      .order("completed_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProgressEntryWithRoute[];
  });
}
```

Leave the doc comment above it in place and add one line to it: `Rows arrive with their route and centre joined on, so the history list can name a drive without a query per row.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/services/__tests__/progressRepo.test.ts src/services/__tests__/repos.test.ts`
Expected: PASS. `repos.test.ts` must still pass — it exercises `saveProgress` and `flushProgress`, which are untouched.

- [ ] **Step 5: Commit**

```bash
git add src/types/db.ts src/services/progressRepo.ts src/services/__tests__/progressRepo.test.ts
git commit -m "feat: join route and centre onto progress rows"
```

---

### Task 3: The leading fault outranks the others

**Files:**
- Modify: `src/ui/theme.ts`, `tailwind.config.js`
- Modify: `src/ui/FaultBars.tsx`
- Test: `src/ui/__tests__/faultBars.test.tsx` (create)

**Interfaces:**
- Consumes: `FaultCount` from `homeView.ts`.
- Produces: `<FaultBars faults={...} lead?: boolean />`. `lead` defaults to `false`, so existing callers are unaffected.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/faultBars.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { FaultBars } from "../FaultBars";
import { colors } from "../theme";

const faults = [
  { tag: "Junction observations", count: 4 },
  { tag: "Use of mirrors", count: 3 },
];

const fillColour = (tag: string) => {
  const style = screen.getByTestId(`fault-fill-${tag}`).props.style as
    | Record<string, unknown>
    | Record<string, unknown>[];
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
  return flat.backgroundColor;
};

// The tally version: every row is the same green, because nothing on it is the
// subject.
test("without a lead every bar carries the accent", () => {
  render(<FaultBars faults={faults} />);
  expect(fillColour("Junction observations")).toBe(colors.accent);
  expect(fillColour("Use of mirrors")).toBe(colors.accent);
});

// With a lead the card has a subject, and the rows below it are context.
test("with a lead only the first bar carries the accent", () => {
  render(<FaultBars faults={faults} lead />);
  expect(fillColour("Junction observations")).toBe(colors.accent);
  expect(fillColour("Use of mirrors")).toBe(colors.faultRunner);
});

// Colour is never the only encoding — someone who cannot tell the two greens
// apart still has the number.
test("every row keeps its count whether it leads or not", () => {
  render(<FaultBars faults={faults} lead />);
  expect(screen.getByText("4")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/faultBars.test.tsx`
Expected: FAIL — `colors.faultRunner` is undefined, and the second test's expectation does not match.

- [ ] **Step 3: Write the implementation**

In `src/ui/theme.ts`, add inside the `colors` object after `line`:

```ts
  /**
   * A fault bar that is not the leading one. The same green with the life
   * taken out of it, not a new hue — see FaultBars for why that distinction
   * matters.
   */
  faultRunner: "#A7C4B6",
```

In `tailwind.config.js`, add to the `colors` block after `danger` to keep the two halves of the palette twinned:

```js
        "fault-runner": "#A7C4B6",
```

In `src/ui/FaultBars.tsx`, replace the `Bar` doc comment with:

```tsx
/**
 * One row per fault kind, longest first.
 *
 * Rows below the leader are drawn in a muted green rather than the accent.
 * This is a de-emphasis, not a second encoding: the earlier version of this
 * component painted every row identically to keep it from competing with the
 * centre identity hues a card away — the same green must not mean "Goodmayes"
 * in one row and "Speeding" in the next. Desaturating the runners introduces
 * no new hue and no new meaning; it says *less* about rows two and three.
 *
 * Colour is never the only encoding. The count stays at the end of every row,
 * the leading tag is repeated verbatim as the card's headline above, and the
 * runners' labels drop to `ink3` alongside their bars.
 *
 * The length is the magnitude; a second encoding in colour would only add a
 * way to be wrong.
 */
function Bar({ fault, widest, index, dim }: {
  fault: FaultCount; widest: number; index: number; dim: boolean;
}) {
```

Inside `Bar`, change the tag `Text` and the fill `Animated.View`:

```tsx
    <View className="flex-row items-center gap-3 py-[9px]">
      <Text
        className="w-[144px] text-[16.5px] text-slate-600"
        style={dim ? { color: colors.ink3 } : undefined}
        numberOfLines={1}
      >
        {fault.tag}
      </Text>
      <View className="h-3 flex-1 overflow-hidden rounded-full bg-[#EDEBE4]">
        <Animated.View
          testID={`fault-fill-${fault.tag}`}
          className="h-full rounded-full"
          style={[
            {
              width: `${Math.max(share, 0.06) * 100}%`,
              backgroundColor: dim ? colors.faultRunner : colors.accent,
              transformOrigin: "left",
            },
            style,
          ]}
        />
      </View>
      <Text className="w-6 text-right text-[15.5px] font-semibold text-slate-500">{fault.count}</Text>
    </View>
```

Replace the exported component:

```tsx
export function FaultBars({ faults, lead = false }: { faults: FaultCount[]; lead?: boolean }) {
  if (faults.length === 0) return null;
  const widest = faults[0].count;
  return (
    <View testID="fault-bars" className="mt-2.5">
      {faults.map((fault, i) => (
        <Bar key={fault.tag} fault={fault} widest={widest} index={i} dim={lead && i > 0} />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/__tests__/faultBars.test.tsx`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.ts tailwind.config.js src/ui/FaultBars.tsx src/ui/__tests__/faultBars.test.tsx
git commit -m "feat: rank the fault bars so the card has a subject"
```

---

### Task 4: The lead card

**Files:**
- Create: `src/ui/NextStepCard.tsx`
- Test: `src/ui/__tests__/nextStepCard.test.tsx`

**Interfaces:**
- Consumes: `NextStep` from Task 1, `FaultBars` with `lead` from Task 3.
- Produces: `<NextStepCard step={NextStep} onAction={() => void} />`

This component owns all five shapes' copy. It takes `onAction` rather than a router so it can be tested without mocking navigation.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/nextStepCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { NextStep } from "@/lib/homeView";
import { NextStepCard } from "../NextStepCard";

const show = (step: NextStep, onAction = jest.fn()) => {
  render(<NextStepCard step={step} onAction={onAction} />);
  return onAction;
};

test("a new account is asked for a first test, and sent where one starts", () => {
  const onAction = show({ kind: "first" });
  expect(screen.getByText("Your first mock test")).toBeTruthy();
  fireEvent.press(screen.getByText("Find a test centre near me"));
  expect(onAction).toHaveBeenCalled();
});

test("one test is asked for a second, and names what that test cost", () => {
  show({ kind: "baseline", tags: ["Speeding", "Use of mirrors"] });
  expect(screen.getByText("Take a second mock test")).toBeTruthy();
  expect(screen.getByText("Speeding")).toBeTruthy();
  expect(screen.getByText("Use of mirrors")).toBeTruthy();
  // Unranked. One test cannot rank anything.
  expect(screen.queryByTestId("fault-bars")).toBeNull();
});

test("a clean record says so rather than inventing a weakness", () => {
  show({ kind: "clean" });
  expect(screen.getByText("Nothing is costing you yet")).toBeTruthy();
  expect(screen.queryByTestId("fault-bars")).toBeNull();
});

test("a tie names both faults and asks for the tiebreaker", () => {
  show({ kind: "tied", tags: ["Junction observations", "Use of mirrors"] });
  expect(screen.getByText("Two faults are level")).toBeTruthy();
  expect(screen.getByText(/Junction observations and Use of mirrors/)).toBeTruthy();
});

test("a clear leader is named, and the sentence beneath counts tests", () => {
  show({
    kind: "fault", tag: "Junction observations", count: 4, of: 5,
    runners: [{ tag: "Use of mirrors", count: 3 }],
  });
  expect(screen.getByTestId("diagnosis")).toHaveTextContent("Junction observations");
  expect(screen.getByText(/Marked in 4 of your 5 mock tests/)).toBeTruthy();
  expect(screen.getByTestId("fault-bars")).toBeTruthy();
});

// The count is of tests containing the fault, because aggregate dedupes tags
// per test. Saying "4 faults" would be a different and untrue claim.
test("the sentence never claims a number of faults", () => {
  show({
    kind: "fault", tag: "Junction observations", count: 4, of: 5,
    runners: [],
  });
  expect(screen.queryByText(/4 faults/)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/nextStepCard.test.tsx`
Expected: FAIL — cannot resolve `../NextStepCard`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/NextStepCard.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";
import type { FaultCount, NextStep } from "@/lib/homeView";
import { FaultBars } from "@/ui/FaultBars";

/** Matches the cap in app/(tabs)/index.tsx, so display type cannot balloon. */
const DISPLAY_SCALE = 1.1;

/** "a and b", "a, b and c" — a list of tags read aloud rather than punctuated. */
function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type Copy = {
  title: string;
  claim: string;
  because: string;
  action: string;
  bars?: FaultCount[];
  tags?: string[];
};

/**
 * The five shapes, as words.
 *
 * Kept as one function returning a plain object so the copy for every state
 * sits in one place and can be read against the others. The card below draws
 * whichever of `bars` and `tags` came back.
 */
function copyFor(step: NextStep): Copy {
  switch (step.kind) {
    case "first":
      return {
        title: "Start here",
        claim: "Your first mock test",
        because:
          "Drive a real examiner route at your centre and get marked the way the DL25 marks you. It sets the baseline everything after it is measured against.",
        action: "Find a test centre near me",
      };
    case "baseline":
      return {
        title: "Work on this next",
        claim: "Take a second mock test",
        because:
          "One test shows what went wrong that day. Two show what keeps going wrong — and that's the thing worth practising.",
        action: "Start a mock test",
        tags: step.tags,
      };
    case "clean":
      return {
        title: "Work on this next",
        claim: "Nothing is costing you yet",
        because:
          "No faults recorded across your mock tests. Keep going — a fault has to show up before it can be worked on.",
        action: "Start a mock test",
      };
    case "tied":
      return {
        title: "Work on this next",
        claim: step.tags.length === 2 ? "Two faults are level" : "Nothing stands out yet",
        because: `${andList(step.tags)} are marked in the same number of tests. Another test breaks the tie.`,
        action: "Start a mock test",
      };
    case "fault":
      return {
        title: "Work on this next",
        claim: step.tag,
        // Tests, not faults: aggregate dedupes tags per test, so this can only
        // ever be how many tests the fault turned up in.
        because: `Marked in ${step.count} of your ${step.of} mock tests — more than any other fault.`,
        action: "Start a mock test",
        bars: [{ tag: step.tag, count: step.count }, ...step.runners],
      };
  }
}

/**
 * The one thing worth doing next, and the case for it.
 *
 * Takes a decision rather than making one — every rule that chooses between
 * these five shapes lives in `nextStep`, so this file is only ever wrong about
 * words.
 */
export function NextStepCard({ step, onAction }: { step: NextStep; onAction: () => void }) {
  const copy = copyFor(step);

  return (
    <View
      className="mx-5 rounded-[20px] bg-card p-5"
      style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}
    >
      <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18.5px] font-semibold tracking-tight text-primary">
        {copy.title}
      </Text>
      <Text
        testID="diagnosis"
        maxFontSizeMultiplier={DISPLAY_SCALE}
        className="mt-2 text-[27px] leading-[32px] font-semibold tracking-tight text-primary"
      >
        {copy.claim}
      </Text>
      <Text className="mt-2 text-[16.5px] leading-[24px] text-slate-600">{copy.because}</Text>

      {copy.bars && <FaultBars faults={copy.bars} lead />}

      {copy.tags && copy.tags.length > 0 && (
        <View testID="baseline-tags" className="mt-3.5">
          {copy.tags.map((tag) => (
            <View key={tag} className="border-t border-slate-200 py-2.5">
              <Text className="text-[16.5px] text-slate-600">{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        className="mt-5 items-center rounded-[19px] bg-accent py-[17px] active:opacity-80"
      >
        <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18px] font-semibold text-white">
          {copy.action}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/__tests__/nextStepCard.test.tsx`
Expected: PASS, six tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/NextStepCard.tsx src/ui/__tests__/nextStepCard.test.tsx
git commit -m "feat: add the lead card that names one thing to work on"
```

---

### Task 5: The record card

**Files:**
- Create: `src/ui/RecordCard.tsx`
- Test: `src/ui/__tests__/recordCard.test.tsx`

**Interfaces:**
- Consumes: `ScoreSummary`, `averageScore`, `durationWords` from Task 1; `ProgressEntryWithRoute` from Task 2; the existing `ScoreSparkline`.
- Produces: `<RecordCard summary={ScoreSummary} rows={ProgressEntryWithRoute[]} width={number} failed={boolean} />`

`rows` is the full unsorted set; the card takes the three most recent scored ones itself. `width` is the sparkline width the screen computes, as today.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/recordCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { scoreSummary } from "@/lib/homeView";
import type { ProgressEntryWithRoute } from "@/types/db";
import { RecordCard } from "../RecordCard";

const at = (
  iso: string, score: number | null, route: ProgressEntryWithRoute["routes"] = {
    name: "Route 3", centre_id: "c1", centres: { name: "Mill Hill (London)" },
  }
): ProgressEntryWithRoute => ({
  user_id: "u1", route_id: "r1", completed_at: iso,
  mock_test_score: score, mistakes: [], duration_seconds: 2460, routes: route,
});

const show = (rows: ProgressEntryWithRoute[], failed = false) =>
  render(<RecordCard summary={scoreSummary(rows)} rows={rows} width={310} failed={failed} />);

test("the latest score leads, against the scale it is out of", () => {
  show([at("2026-08-01T10:00:00Z", 80), at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByTestId("latest-score")).toHaveTextContent("88");
  expect(screen.getByText("/100")).toBeTruthy();
});

test("the change on the last test is a mark, not a sentence", () => {
  show([at("2026-08-01T10:00:00Z", 80), at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByTestId("delta")).toHaveTextContent("8");
  expect(screen.queryByText(/on your last/)).toBeNull();
});

// A lone point is centred by sparkPoints, which is correct behaviour and an
// incorrect picture.
test("one score draws no line, and says so", () => {
  show([at("2026-08-12T10:00:00Z", 55)]);
  expect(screen.queryByTestId("spark")).toBeNull();
  expect(screen.getByText(/One score draws no line/)).toBeTruthy();
  expect(screen.queryByTestId("stat-row")).toBeNull();
});

test("two scores draw the line, and name both its ends", () => {
  show([at("2026-07-14T10:00:00Z", 55), at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByTestId("spark")).toBeTruthy();
  expect(screen.getByText(/^55 on /)).toBeTruthy();
  expect(screen.getByText(/^88 on /)).toBeTruthy();
});

test("the stat row carries best and average, and not the count", () => {
  show([
    at("2026-07-14T10:00:00Z", 55), at("2026-08-01T10:00:00Z", 70),
    at("2026-08-12T10:00:00Z", 88),
  ]);
  expect(screen.getByTestId("stat-best")).toHaveTextContent("88");
  expect(screen.getByTestId("stat-average")).toHaveTextContent("71");
  // The header already said it. Twice in one card is once too many.
  expect(screen.getByText("3 mock tests")).toBeTruthy();
  expect(screen.queryByTestId("stat-tests")).toBeNull();
});

test("history rows name the drive and how long it took", () => {
  show([at("2026-08-12T10:00:00Z", 88)]);
  expect(screen.getByText("Route 3 · Mill Hill (London)")).toBeTruthy();
  expect(screen.getByText("41 min")).toBeTruthy();
});

// A route deleted after the test was taken must not blank the row.
test("a row whose route is gone still shows its score", () => {
  show([at("2026-08-12T10:00:00Z", 88, null)]);
  expect(screen.getByTestId("history-score-0")).toHaveTextContent("88");
  expect(screen.queryByText(/·/)).toBeNull();
});

test("only the three most recent drives are listed", () => {
  show([
    at("2026-07-01T10:00:00Z", 40), at("2026-07-14T10:00:00Z", 55),
    at("2026-08-01T10:00:00Z", 70), at("2026-08-12T10:00:00Z", 88),
  ]);
  expect(screen.getByTestId("history-score-0")).toHaveTextContent("88");
  expect(screen.getByTestId("history-score-2")).toHaveTextContent("55");
  expect(screen.queryByTestId("history-score-3")).toBeNull();
});

test("no tests at all says what the card will become", () => {
  show([]);
  expect(screen.getByText(/Your first score lands here/)).toBeTruthy();
  expect(screen.queryByTestId("latest-score")).toBeNull();
});

// No cache and no network — a different sentence from a genuinely new account.
test("a failed load says why it is empty", () => {
  show([], true);
  expect(screen.getByText(/back online/)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/recordCard.test.tsx`
Expected: FAIL — cannot resolve `../RecordCard`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/RecordCard.tsx`:

```tsx
import { Text, View } from "react-native";
import { averageScore, durationWords } from "@/lib/homeView";
import type { ScoreSummary } from "@/lib/homeView";
import type { ProgressEntryWithRoute } from "@/types/db";
import { ScoreSparkline } from "@/ui/ScoreSparkline";

const DISPLAY_SCALE = 1.1;
const HISTORY_ROWS = 3;

/** "2 Jul" — the ends of the sparkline, in words, since it draws no axis. */
function shortDate(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The drives this card lists: scored, most recent first, capped. */
function history(rows: ProgressEntryWithRoute[]): ProgressEntryWithRoute[] {
  return rows
    .filter((r) => typeof r.mock_test_score === "number")
    .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""))
    .slice(0, HISTORY_ROWS);
}

function Stat({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</Text>
      <Text
        testID={id}
        maxFontSizeMultiplier={DISPLAY_SCALE}
        className="mt-0.5 text-[22px] font-semibold tracking-tight text-primary"
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The record, as evidence for the card above it.
 *
 * Four registers in one container rather than four cards: score, shape, stats,
 * history. Everything here is already computed by `scoreSummary` or is one
 * line of arithmetic on it — the card fetches nothing and decides nothing.
 *
 * No verdict is shown anywhere, and none can be: `user_progress` stores no
 * pass/fail, and it is not derivable from the score, because `aggregate` caps
 * a failed test at 55 and a pass with nine driving faults is also 55.
 */
export function RecordCard({
  summary, rows, width, failed,
}: {
  summary: ScoreSummary;
  rows: ProgressEntryWithRoute[];
  width: number;
  failed: boolean;
}) {
  const drives = history(rows);
  const firstAt = shortDate(summary.attempts[0]?.at ?? null);
  const lastAt = shortDate(summary.lastAt);
  const average = averageScore(summary);
  // A lone point is centred by sparkPoints — correct behaviour, wrong picture.
  const hasShape = summary.count > 1;

  return (
    <View
      className="mx-5 mt-4 rounded-[20px] bg-card p-5"
      style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}
    >
      <View className="flex-row items-baseline">
        <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18.5px] font-semibold tracking-tight text-primary">
          Your record
        </Text>
        {summary.count > 0 && (
          <Text className="ml-auto text-[13px] text-slate-500">
            {summary.count === 1 ? "1 mock test" : `${summary.count} mock tests`}
          </Text>
        )}
      </View>

      {summary.count === 0 ? (
        <Text className="mt-2.5 text-[17px] leading-[24px] text-slate-600">
          {failed
            ? "Your scores will appear here once you're back online."
            : "Nothing recorded yet. Your first score lands here, and the faults you pick up become the thing this screen tells you to work on."}
        </Text>
      ) : (
        <>
          <View className="mt-2.5 flex-row items-end gap-3">
            <Text
              testID="latest-score"
              maxFontSizeMultiplier={DISPLAY_SCALE}
              className="text-[62px] font-bold leading-[62px] tracking-tighter text-primary"
            >
              {summary.latest}
            </Text>
            <Text className="pb-2 text-[21px] font-semibold text-slate-500">/100</Text>
            <View className="flex-1" />
            {summary.delta !== null && summary.delta !== 0 && (
              <Text
                testID="delta"
                maxFontSizeMultiplier={DISPLAY_SCALE}
                className="mb-3 rounded-lg bg-[#ECFDF5] px-2.5 py-1 text-[15px] font-bold text-accent-pressed"
              >
                {summary.delta > 0 ? `▲ ${summary.delta}` : `▼ ${-summary.delta}`}
              </Text>
            )}
          </View>

          {hasShape ? (
            <>
              <View className="mt-4">
                <ScoreSparkline attempts={summary.attempts} width={width} height={74} />
              </View>
              {/* The sparkline draws no axis, so both ends are named here. */}
              <View className="mt-2 flex-row justify-between">
                <Text className="text-[13px] text-slate-500">
                  {firstAt ? `${summary.attempts[0].score} on ${firstAt}` : `${summary.attempts[0].score} to start`}
                </Text>
                <Text className="text-[13px] text-slate-500">
                  {lastAt ? `${summary.latest} on ${lastAt}` : `${summary.latest} latest`}
                </Text>
              </View>

              <View className="mt-4 h-px bg-slate-200" />
              <View testID="stat-row" className="mt-4 flex-row">
                <Stat id="stat-best" label="Best" value={String(summary.best)} />
                <View className="w-px bg-slate-200" />
                <View className="w-4" />
                <Stat id="stat-average" label="Average" value={String(average)} />
              </View>
            </>
          ) : (
            <Text className="mt-3 text-[14.5px] leading-[21px] text-slate-500">
              One score draws no line. Your second test starts the shape.
            </Text>
          )}

          <View className="mt-5 h-px bg-slate-200" />
          <Text className="mt-4 text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">
            Recent tests
          </Text>
          {drives.map((drive, i) => (
            <View
              key={drive.id ?? `${drive.completed_at}-${i}`}
              className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-slate-200" : ""}`}
            >
              <View className="flex-1">
                <Text className="text-[16.5px] font-semibold text-primary">
                  {shortDate(Date.parse(drive.completed_at ?? "")) ?? "Not yet synced"}
                </Text>
                {drive.routes && (
                  <Text className="mt-0.5 text-[14px] text-slate-500" numberOfLines={1}>
                    {drive.routes.centres
                      ? `${drive.routes.name} · ${drive.routes.centres.name}`
                      : drive.routes.name}
                  </Text>
                )}
              </View>
              <Text
                testID={`history-score-${i}`}
                maxFontSizeMultiplier={DISPLAY_SCALE}
                className="text-[22px] font-semibold tracking-tight text-primary"
              >
                {drive.mock_test_score}
              </Text>
              <Text className="w-16 text-right text-[14px] text-slate-500">
                {durationWords(drive.duration_seconds)}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
```

`shortDate` returns null for an unparseable date, which is why the history row falls back to `Not yet synced` — a row queued offline has no `completed_at` until it flushes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/__tests__/recordCard.test.tsx`
Expected: PASS, ten tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/RecordCard.tsx src/ui/__tests__/recordCard.test.tsx
git commit -m "feat: add the record card that backs the diagnosis"
```

---

### Task 6: Rebuild the screen around the two cards

**Files:**
- Modify: `app/(tabs)/index.tsx` (full rewrite)
- Test: `src/ui/__tests__/homeScreen.test.tsx` (rewrite)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: the Home route. No exports besides the default component.

Three tests in the existing file assert behaviour this redesign deliberately removes and are replaced rather than kept: `the latest score leads, with the change on it beside` (the sentence is now a mark), `a new account is told what the panel will become` (different copy and a different card), and `the starter button is gone once there is a score` (there is now always an action). The greeting, name, settings and failed-load tests survive unchanged in substance.

- [ ] **Step 1: Write the failing test**

Replace the whole of `src/ui/__tests__/homeScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("@/services/progressRepo", () => ({ listMyProgress: jest.fn() }));

// eslint-disable-next-line import/first
import { listMyProgress } from "@/services/progressRepo";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";
// eslint-disable-next-line import/first
import type { ProgressEntryWithRoute } from "@/types/db";
// eslint-disable-next-line import/first
import Home from "../../../app/(tabs)/index";

const mockProgress = listMyProgress as jest.MockedFunction<typeof listMyProgress>;

const at = (iso: string, score: number | null, mistakes: string[] = []): ProgressEntryWithRoute => ({
  user_id: "u1", route_id: "r1", completed_at: iso,
  mock_test_score: score, mistakes, duration_seconds: 2460,
  routes: { name: "Route 3", centre_id: "c1", centres: { name: "Mill Hill (London)" } },
});

const signedInAs = (full_name?: string) =>
  useSession.setState({
    session: { user: { id: "u1", email: "a@b.com", user_metadata: full_name ? { full_name } : {} } } as never,
    initialized: true,
  });

/** Recent enough that "it's been a fortnight" never wins over what is asserted. */
const recent = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

const rowsAre = (...rows: ProgressEntryWithRoute[]) =>
  mockProgress.mockResolvedValue({ data: rows, stale: false });

beforeEach(() => {
  mockPush.mockClear();
  signedInAs("Sumeet Raheja");
  rowsAre();
});

test("greets you by your first name alone", async () => {
  render(<Home />);
  expect(await screen.findByText(/Good (morning|afternoon|evening), Sumeet$/)).toBeTruthy();
});

// Every account made before sign-up asked for a name has none, and a greeting
// ending in a comma is worse than no name at all.
test("an account with no name is greeted by the hour only", async () => {
  signedInAs();
  render(<Home />);
  expect(await screen.findByText(/^Good (morning|afternoon|evening)$/)).toBeTruthy();
});

test("the finding under your name is computed from the same rows", async () => {
  rowsAre(at(recent(9), 60), at(recent(1), 78));
  render(<Home />);
  expect(await screen.findByText("That's your best yet.")).toBeTruthy();
});

test("a new account is asked for a first test, and sent where one starts", async () => {
  render(<Home />);
  expect(await screen.findByText("Your first mock test")).toBeTruthy();
  fireEvent.press(screen.getByText("Find a test centre near me"));
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

test("the recurring fault leads, with the record beneath it", async () => {
  rowsAre(
    at(recent(20), 60, ["Junction observations", "Speeding"]),
    at(recent(9), 65, ["Junction observations"]),
    at(recent(1), 78, ["Junction observations"]),
  );
  render(<Home />);

  expect(await screen.findByTestId("diagnosis")).toHaveTextContent("Junction observations");
  expect(screen.getByText(/Marked in 3 of your 3 mock tests/)).toBeTruthy();
  expect(screen.getByTestId("latest-score")).toHaveTextContent("78");
});

test("one test is asked for a second rather than diagnosed", async () => {
  rowsAre(at(recent(1), 55, ["Speeding"]));
  render(<Home />);
  expect(await screen.findByText("Take a second mock test")).toBeTruthy();
  expect(screen.queryByTestId("fault-bars")).toBeNull();
});

test("a clean record is told so, not given an invented weakness", async () => {
  rowsAre(at(recent(9), 100), at(recent(1), 95));
  render(<Home />);
  expect(await screen.findByText("Nothing is costing you yet")).toBeTruthy();
});

// Home is not a read-only screen after your first score. This is the
// regression the redesign fixes.
test("there is always somewhere to go", async () => {
  rowsAre(at(recent(9), 60, ["Speeding"]), at(recent(1), 78, ["Speeding"]));
  render(<Home />);
  fireEvent.press(await screen.findByText("Start a mock test"));
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

// No cache and no network. The greeting is the part of this screen that must
// never depend on a fetch — and the button never needed one either.
test("a failed load still greets you, and still offers the way in", async () => {
  mockProgress.mockRejectedValue(new Error("offline"));
  render(<Home />);

  expect(await screen.findByText(/Good (morning|afternoon|evening), Sumeet$/)).toBeTruthy();
  await waitFor(() => expect(screen.getByText(/back online/)).toBeTruthy());
  fireEvent.press(screen.getByText("Find a test centre near me"));
  expect(mockPush).toHaveBeenCalledWith("/centres");
});

test("the gear opens the account screen", async () => {
  render(<Home />);
  fireEvent.press(await screen.findByLabelText("Settings"));
  expect(mockPush).toHaveBeenCalledWith("/settings");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/ui/__tests__/homeScreen.test.tsx`
Expected: FAIL — `Unable to find an element with text: Your first mock test`, and the diagnosis test cannot find `diagnosis`.

- [ ] **Step 3: Write the implementation**

Replace the whole of `app/(tabs)/index.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { faultCounts, finding, firstName, greeting, nextStep, scoreSummary } from "@/lib/homeView";
import { listMyProgress } from "@/services/progressRepo";
import { selectFullName, useSession } from "@/stores/sessionStore";
import type { ProgressEntryWithRoute } from "@/types/db";
import { NextStepCard } from "@/ui/NextStepCard";
import { RecordCard } from "@/ui/RecordCard";
import { Skeleton } from "@/ui/Skeleton";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";

/**
 * The design was drawn at a fixed size, and iOS will happily render it 130%
 * larger if the phone's text size is turned up — which is how a screen that
 * matches the mockup on one device looks blown up on another. Display type is
 * capped; body copy is left free to scale, because that is what the setting is
 * actually for.
 */
const DISPLAY_SCALE = 1.1;

/**
 * The first screen: what to do next, and the record that argues for it.
 *
 * It opens on a claim rather than a number. The fault bars that used to sit at
 * the bottom as a tally are now the evidence inside the card above, which is
 * the whole of this screen's design — everything the app knows about your
 * weaknesses was already computed here and previously went unsaid.
 *
 * Every rule lives in `homeView`. This file fetches, computes and composes;
 * it decides nothing. Everything comes from one query — `listMyProgress`
 * returns every row this user has, cached, with each row's route and centre
 * joined on, so the screen draws offline and never needs a second round trip.
 */
export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const fullName = useSession(selectFullName);

  const [rows, setRows] = useState<ProgressEntryWithRoute[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listMyProgress();
      setRows(r.data);
    } catch {
      // No cache and no network. The greeting still works, and so does the
      // action — it navigates within the app and never needed the network.
      setFailed(true);
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const name = firstName(fullName);
  const hello = name ? `${greeting(now)}, ${name}` : greeting(now);

  const summary = scoreSummary(rows ?? []);
  const faults = faultCounts(rows ?? []);
  const line = finding(summary, now);
  const step = nextStep(summary, faults);

  // Screen width less the card's own margins (20 each side) and padding (20
  // each side). Kept in one place because the sparkline has to be told its
  // width and would otherwise drift from the card holding it.
  const sparkWidth = Math.max(120, width - 40 - 40);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Nothing is drawn behind the welcome. A band around it would turn the
            one personal line on the screen into a banner. */}
        <Animated.View entering={enterFrom(0)} className="flex-row items-start gap-3 px-6 pb-6 pt-2">
          <View className="flex-1">
            <Text
              maxFontSizeMultiplier={DISPLAY_SCALE}
              className="text-[30px] leading-[35px] font-semibold tracking-tight text-primary"
              style={{ fontFamily: "Inter_600SemiBold" }}
            >
              {hello}
            </Text>
            {rows === null
              ? <View className="mt-2.5"><Skeleton h={18} w="70%" /></View>
              : (
                <Text
                  maxFontSizeMultiplier={DISPLAY_SCALE}
                  className="mt-2 text-[18px] leading-[25px] font-semibold text-accent-pressed"
                >
                  {line}
                </Text>
              )}
          </View>
          <Pressable
            testID="settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => router.push("/settings")}
            className="mt-1 h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-card active:opacity-70"
          >
            <Ionicons name="settings-outline" size={24} color={colors.primary} />
          </Pressable>
        </Animated.View>

        {rows === null ? (
          <View className="mx-5 gap-4">
            <Skeleton h={240} w="100%" />
            <Skeleton h={300} w="100%" />
          </View>
        ) : (
          <>
            <Animated.View entering={enterFrom(1)}>
              <NextStepCard step={step} onAction={() => router.push("/centres")} />
            </Animated.View>
            <Animated.View entering={enterFrom(2)}>
              <RecordCard summary={summary} rows={rows} width={sparkWidth} failed={failed} />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/ui/__tests__/homeScreen.test.tsx`
Expected: PASS, ten tests.

- [ ] **Step 5: Run the whole suite and lint**

Run: `npm test`
Expected: PASS. Nothing outside Home consumes `listMyProgress`, `FaultBars` or `homeView`, but the widened return type touches the module graph — if any other suite fails, it is a real break, not a flake.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/index.tsx" src/ui/__tests__/homeScreen.test.tsx
git commit -m "feat: rebuild Home around one thing to work on next"
```

---

## Verification

After Task 6, confirm against the spec's state table by running the app (`npm start`) and checking each state on a device or simulator. The states that cannot be reached by seeding alone — the failed load with no cache, and the offline cache path — are covered by the screen tests above; the rest are worth seeing:

| State | How to reach it |
|---|---|
| No tests | A fresh account. Expect `Your first mock test`, a working button, and no scrolling. |
| One test | One completed mock. Expect `Take a second mock test`, no chart, no stat row. |
| Clear leader | Three mocks sharing a fault. Expect the fault named, ranked bars, and the screen scrolling to the stat row. |
| Tie | Two mocks each tagged with the same two faults. Expect `Two faults are level`. |

Check on device that the fold lands at or near the hairline below the chart, as the spec predicts (~706pt of 707pt on a 6.1" screen). A fold landing mid-stat-row instead means the type is rendering larger than designed and `DISPLAY_SCALE` is not doing its job.

## Deferred, per the spec — do not build these

- Pass/fail chips and a `Passed n of m` stat. Needs a migration adding `minors` and `majors` to `user_progress`.
- `Practise junctions at Mill Hill`. Needs routes tagged by what they exercise.
- A Progress screen, and therefore the `All 5 tests` link. Not rendered in this build.
- Any notion of "your centre". Every action routes to `/centres`.
