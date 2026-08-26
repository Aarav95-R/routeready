# Route Lifecycle and Map Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver live start detection, explicit start and finish confirmation, stable off-route recovery with forward rejoin rebasing, and the approved professional map treatment in both Practice and Mock Test.

**Architecture:** A pure `routeLifecycle` reducer qualifies GPS fixes and owns temporal start, departure, rejoin, and finish transitions. The screens retain native effects but consume the same reducer contract; navigation receives an explicit monotonic rebase helper, and shared UI components render the approved start/finish sheets and compact drive chrome.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript, Expo Location, Expo Router, `@rnmapbox/maps`, Reanimated, NativeWind, Zustand, Jest Expo, Testing Library React Native.

**Spec:** `docs/superpowers/specs/2026-08-26-route-lifecycle-map-redesign-design.md`

## Global Constraints

- Accept lifecycle fixes only when coordinates, timestamp, and accuracy are finite; age is at most 5 seconds; accuracy is at most 25 metres; and the fix is not a duplicate.
- Detect start within 30 metres at no more than 5 mph using three accepted fixes spanning at least 3 seconds; require explicit `Begin route` and revalidate within 45 metres.
- Enter off-route beyond 45 metres using three accepted fixes spanning at least 3 seconds; rejoin within 25 metres using two accepted fixes.
- Detect finish only at 90% or greater route progress, within 30 metres, at no more than 5 mph, using two accepted fixes spanning at least 3 seconds.
- Never automatically start, finish, persist, or navigate.
- Route progress, trail index, and rejoin index are monotonic and never rewind.
- Do not mount or unmount Mapbox shape sources during a live drive; update them with real or empty geometry.
- Do not add dependencies or redesign unrelated screens.
- Preserve Mapbox attribution, reduced-motion support, and usable 320-point layouts.

---

## File Structure

- Create `src/lib/routeLifecycle.ts`: pure lifecycle types, GPS qualification, reducer transitions, and stable effect descriptions.
- Create `src/lib/__tests__/routeLifecycle.test.ts`: deterministic state-machine coverage for every lifecycle threshold and idempotency rule.
- Modify `src/lib/navigation.ts`: add a monotonic route-cursor rebase helper.
- Modify `src/lib/__tests__/navigation.test.ts`: lock large forward rejoin and no-rewind behaviour.
- Modify `src/lib/offRoute.ts`: add temporal confirmation to existing fix-count hysteresis.
- Modify `src/lib/__tests__/offRoute.test.ts`: prove three fixes must span three seconds.
- Create `src/ui/RouteStartPrompt.tsx`: focused start confirmation sheet.
- Create `src/ui/RouteFinishPrompt.tsx`: focused finish confirmation sheet.
- Create `src/ui/DriveChrome.tsx`: shared anchored guidance deck, status strip, and stable bottom rail.
- Create `src/ui/__tests__/routePrompts.test.tsx`: prompt action and accessibility tests.
- Modify `src/ui/NavMap.tsx`: approved route/driven/recovery visual treatment while retaining permanent sources.
- Modify `src/ui/mapStyle.ts`: precision-daylight colour and layer tokens.
- Modify `src/test/locationMock.ts`: configurable timestamp, accuracy, heading, watcher failure, and permission helpers.
- Modify `app/route/[id]/practice.tsx`: connect live preview watch, shared lifecycle, recovery rebase, prompts, and location failure UI.
- Modify `src/ui/__tests__/practiceScreen.test.tsx`: full Practice loop replay and failure scenarios.
- Modify `app/route/[id]/mock.tsx`: connect the same lifecycle, quality-gated scoring, latched finish, open-deviation flush, and explicit result navigation.
- Modify `src/ui/__tests__/mockScreen.test.tsx`: full Mock loop replay and unassessable/no-data assertions.

---

### Task 1: Pure Route Lifecycle

**Files:**
- Create: `src/lib/routeLifecycle.ts`
- Create: `src/lib/__tests__/routeLifecycle.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `haversineM`, route progress supplied by the screen, and route distance supplied by `navSnap`.
- Produces: `createRouteLifecycle`, `routeLifecycleReducer`, `qualifyLocationFix`, `RouteLifecycleState`, `RouteLifecycleEvent`, and `RouteLifecycleEffect`.

- [ ] **Step 1: Write failing qualification and start tests**

```ts
const fix = (timestamp: number, overrides = {}): RouteFix => ({
  lat: 51.75, lng: -0.34, timestamp, accuracyM: 5, speedMph: 0,
  routeDistanceM: 0, startDistanceM: 10, finishDistanceM: 10,
  routeProgress: 0, trailIdx: 0, ...overrides,
});

test("three qualified start fixes spanning three seconds show a prompt without starting", () => {
  let state = createRouteLifecycle();
  state = feed(state, fix(1_000));
  state = feed(state, fix(2_500));
  state = feed(state, fix(4_000));
  expect(state.phase).toBe("start-prompt");
  expect(state.startedAt).toBeNull();
});
```

- [ ] **Step 2: Run the new suite and confirm RED**

Run: `npx jest src/lib/__tests__/routeLifecycle.test.ts --runInBand`

Expected: FAIL because `@/lib/routeLifecycle` does not exist.

- [ ] **Step 3: Implement fix qualification and start transitions**

```ts
export const MAX_FIX_AGE_MS = 5_000;
export const MAX_ACCURACY_M = 25;
export const MAX_STOPPED_SPEED_MPH = 5;

export function qualifyLocationFix(state: RouteLifecycleState, fix: RouteFix, receivedAt: number): boolean;
export function routeLifecycleReducer(state: RouteLifecycleState, event: RouteLifecycleEvent): RouteLifecycleState;
```

Store candidate timestamps rather than relying on render-time timers. `BEGIN_REQUESTED` succeeds only from `start-prompt` with a fresh fix inside 45 metres and emits one `started` effect ID.

- [ ] **Step 4: Add failing off-route, rejoin, finish, suppression, and error tests**

Cover isolated spikes, temporal departure qualification, self-rejoin, finish below 90%, latched finish time, explicit end, repeated end, `KEEP_DRIVING`, finish-zone exit/re-entry, permission failure, watcher failure, and no-fix timeout.

- [ ] **Step 5: Run the expanded suite and confirm the new cases fail for missing transitions**

Run: `npx jest src/lib/__tests__/routeLifecycle.test.ts --runInBand`

- [ ] **Step 6: Implement the remaining reducer transitions and stable effects**

```ts
export type RouteLifecycleEffect =
  | { id: string; type: "started"; at: number }
  | { id: string; type: "departed"; departedIdx: number }
  | { id: string; type: "request-recovery"; requestId: string }
  | { id: string; type: "rejoined"; rejoinIdx: number }
  | { id: string; type: "finish-ready"; at: number }
  | { id: string; type: "completed"; at: number }
  | { id: string; type: "location-unavailable"; reason: string };
```

Effects are appended only on transitions and acknowledged by ID after screen execution.

- [ ] **Step 7: Run the lifecycle suite and existing navigation/off-route suites**

Run: `npx jest src/lib/__tests__/routeLifecycle.test.ts src/lib/__tests__/navigation.test.ts src/lib/__tests__/offRoute.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/routeLifecycle.ts src/lib/__tests__/routeLifecycle.test.ts
git commit -m "feat: add shared route lifecycle reducer"
```

### Task 2: Temporal Off-Route Detection and Monotonic Rebase

**Files:**
- Modify: `src/lib/offRoute.ts`
- Modify: `src/lib/__tests__/offRoute.test.ts`
- Modify: `src/lib/navigation.ts`
- Modify: `src/lib/__tests__/navigation.test.ts`

**Interfaces:**
- Consumes: existing `OffRouteState`, `Rejoin`, route cumulative distances, and current nav indices.
- Produces: timestamp-aware `stepOffRoute` and `rebaseRouteCursor`.

- [ ] **Step 1: Write failing time-span and large-rejoin tests**

```ts
test("three far fixes inside one second do not declare departure", () => {
  const state = stepMany([0, 400, 800], 60);
  expect(state.phase).toBe("straying");
});

test("rebase moves every cursor forward and never rewinds", () => {
  expect(rebaseRouteCursor({ trailIdx: 20, progressFloorIdx: 20, stepIdx: 3 }, 180, steps, coords))
    .toMatchObject({ trailIdx: 180, progressFloorIdx: 180 });
});
```

- [ ] **Step 2: Run both suites and confirm RED**

Run: `npx jest src/lib/__tests__/offRoute.test.ts src/lib/__tests__/navigation.test.ts --runInBand`

- [ ] **Step 3: Add timestamps to off-route candidates and implement cursor rebasing**

```ts
export type RouteCursor = { trailIdx: number; progressFloorIdx: number; stepIdx: number };
export function rebaseRouteCursor(cursor: RouteCursor, rejoinIdx: number, steps: NavStep[], coords: LatLng[]): RouteCursor;
```

The returned trail and floor index are `max(old floor, rejoinIdx)`. Select the first remaining manoeuvre at or beyond the rebased route position, clear passed announcement IDs in screen state, and recompute remaining distance from the rebased cursor.

- [ ] **Step 4: Run both suites and confirm GREEN**

Run: `npx jest src/lib/__tests__/offRoute.test.ts src/lib/__tests__/navigation.test.ts --runInBand`

- [ ] **Step 5: Commit**

```bash
git add src/lib/offRoute.ts src/lib/__tests__/offRoute.test.ts src/lib/navigation.ts src/lib/__tests__/navigation.test.ts
git commit -m "fix: rebase navigation after forward rejoin"
```

### Task 3: Shared Prompts and Precision-Daylight Chrome

**Files:**
- Create: `src/ui/RouteStartPrompt.tsx`
- Create: `src/ui/RouteFinishPrompt.tsx`
- Create: `src/ui/DriveChrome.tsx`
- Create: `src/ui/__tests__/routePrompts.test.tsx`
- Modify: `src/ui/NavMap.tsx`
- Modify: `src/ui/mapStyle.ts`

**Interfaces:**
- Consumes: lifecycle phase, manoeuvre text, distance, speed, mode, recovery status, and callbacks.
- Produces: reusable prompt/chrome components; no navigation or persistence side effects.

- [ ] **Step 1: Write failing prompt interaction tests**

```tsx
test("finish prompt keeps driving or ends only through its buttons", () => {
  const keepDriving = jest.fn();
  const end = jest.fn();
  const view = render(<RouteFinishPrompt visible onKeepDriving={keepDriving} onEnd={end} />);
  fireEvent.press(view.getByRole("button", { name: "Keep driving" }));
  fireEvent.press(view.getByRole("button", { name: "End route" }));
  expect(keepDriving).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the prompt suite and confirm RED**

Run: `npx jest src/ui/__tests__/routePrompts.test.tsx --runInBand`

- [ ] **Step 3: Implement prompts and shared drive chrome**

Use one charcoal guidance deck, a stable full-width bottom rail, 8px-or-smaller radii, existing icon library, and accessibility roles/labels. Start copy is `Ready to begin?`, `Begin route`, and `Wait here`; finish copy is `Route complete`, `End route`, and `Keep driving`.

- [ ] **Step 4: Update map tokens and permanent layer styling**

Keep route-ahead emerald, driven route grey, return line amber, and dim the planned route to 35% only during confirmed recovery. Preserve source/layer mounting, attribution, puck, camera pitch, and recenter behaviour.

- [ ] **Step 5: Run prompt and navigation-map tests**

Run: `npx jest src/ui/__tests__/routePrompts.test.tsx src/lib/__tests__/navmap.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/RouteStartPrompt.tsx src/ui/RouteFinishPrompt.tsx src/ui/DriveChrome.tsx src/ui/__tests__/routePrompts.test.tsx src/ui/NavMap.tsx src/ui/mapStyle.ts
git commit -m "feat: add route prompts and precision map chrome"
```

### Task 4: Practice Lifecycle Integration

**Files:**
- Modify: `src/test/locationMock.ts`
- Modify: `app/route/[id]/practice.tsx`
- Modify: `src/ui/__tests__/practiceScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1 reducer/effects, Task 2 cursor rebase, and Task 3 components.
- Produces: Practice route lifecycle with live preview watching and explicit completion.

- [ ] **Step 1: Extend the location replay fixture**

```ts
export type EmitFixOptions = { speedMps?: number; timestamp?: number; accuracyM?: number; heading?: number | null };
export const emitFix = (lat: number, lng: number, options: EmitFixOptions = {}) =>
  watchers.position?.({
    coords: coords(lat, lng, options.speedMps ?? 0, options.heading ?? null, options.accuracyM ?? 5),
    timestamp: options.timestamp ?? Date.now(),
  });
export const failPositionWatch = (message: string) =>
  watchers.positionError?.(message);
```

Update existing call sites mechanically to pass `{ speedMps, timestamp }`.

- [ ] **Step 2: Replace automatic-completion tests with failing prompt tests and add a full loop replay**

Assert live preview arrival, explicit begin, single-spike silence, one sustained departure, failed recovery fallback, large forward rejoin, false finish below 90%, explicit end, `Keep driving` suppression, permission/watch failure, and exactly one completion.

- [ ] **Step 3: Run the Practice suite and confirm RED**

Run: `npx jest src/ui/__tests__/practiceScreen.test.tsx --runInBand`

- [ ] **Step 4: Connect Practice to the reducer and one-shot effect executor**

Start the position watch in preview after permission, dispatch accepted raw fixes, keep the clock stopped until `started`, guard recovery responses by request ID, call `rebaseRouteCursor` on qualified rejoin, and render the shared prompts/chrome. Replace the immediate `finished` transition with `finish-prompt`; only `completed` shows the completion view.

- [ ] **Step 5: Add recoverable location-unavailable actions**

Retry restarts permission/watch setup, Settings uses the existing Expo Linking pattern, and leave uses `router.back()`. Do not update progress while unavailable.

- [ ] **Step 6: Run Practice and pure suites**

Run: `npx jest src/ui/__tests__/practiceScreen.test.tsx src/lib/__tests__/routeLifecycle.test.ts src/lib/__tests__/navigation.test.ts src/lib/__tests__/offRoute.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/test/locationMock.ts app/route/[id]/practice.tsx src/ui/__tests__/practiceScreen.test.tsx
git commit -m "feat: integrate confirmed lifecycle into practice routes"
```

### Task 5: Mock Test Lifecycle Integration

**Files:**
- Modify: `app/route/[id]/mock.tsx`
- Modify: `src/ui/__tests__/mockScreen.test.tsx`
- Modify: `src/lib/scoring/engine.ts`
- Modify: `src/lib/scoring/__tests__/engine.test.ts`
- Modify: `src/stores/mockTestStore.ts`
- Modify: `src/stores/__tests__/mockTestStore.test.ts`
- Modify: `app/route/[id]/result.tsx`

**Interfaces:**
- Consumes: the shared lifecycle, rebase helper, components, and extended location replay fixture.
- Produces: quality-gated Mock scoring and explicit, idempotent result completion.

- [ ] **Step 1: Replace the automatic-result expectation with failing explicit-finish tests**

Assert that finish qualification leaves routing and persistence untouched until `End route`; `Keep driving` resumes; `End route` uses the candidate timestamp; repeated taps/fixes navigate once; and an active deviation is flushed before finish.

- [ ] **Step 2: Add failing poor-fix and no-data tests**

Inaccurate/stale/duplicate fixes must not call `onSample`. Ending without assessable samples must produce the repository's unassessable result representation rather than a clean pass.

- [ ] **Step 3: Run the Mock suite and confirm RED**

Run: `npx jest src/ui/__tests__/mockScreen.test.tsx --runInBand`

- [ ] **Step 4: Add an explicit assessability result without changing scoring**

Add `assessable: boolean` to `MockResult`. `aggregate` continues to calculate fault totals and score; `finish` sets `assessable` from the presence of accepted samples. The result screen renders `Test not assessed` and omits pass/fail and clean-drive claims when false. Existing assessed results remain unchanged.

- [ ] **Step 5: Integrate Mock with the shared lifecycle**

Dispatch every location object through qualification before scoring, drive recovery and rebase from lifecycle effects, latch the candidate finish time, flush any open deviation, then call the store's finish and router replacement once from the explicit completion effect.

- [ ] **Step 6: Render shared chrome and recoverable location failure UI**

Keep examiner mark controls available in active Mock Test state without overlapping the fixed guidance deck, recovery strip, attribution, or bottom rail.

- [ ] **Step 7: Run both screen suites and pure lifecycle suites**

Run: `npx jest src/ui/__tests__/practiceScreen.test.tsx src/ui/__tests__/mockScreen.test.tsx src/lib/__tests__/routeLifecycle.test.ts src/lib/__tests__/navigation.test.ts src/lib/__tests__/offRoute.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/route/[id]/mock.tsx app/route/[id]/result.tsx src/ui/__tests__/mockScreen.test.tsx src/lib/scoring/engine.ts src/lib/scoring/__tests__/engine.test.ts src/stores/mockTestStore.ts src/stores/__tests__/mockTestStore.test.ts
git commit -m "feat: integrate confirmed lifecycle into mock tests"
```

### Task 6: Full Verification and Native Test Track

**Files:**
- Modify: `docs/superpowers/specs/2026-08-26-route-lifecycle-map-redesign-design.md` only if verified implementation details differ without changing approved behaviour.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: release-ready automated evidence and a documented native verification boundary.

- [ ] **Step 1: Run focused deterministic replay suites**

Run: `npx jest src/lib/__tests__/routeLifecycle.test.ts src/lib/__tests__/navigation.test.ts src/lib/__tests__/offRoute.test.ts src/ui/__tests__/routePrompts.test.tsx src/ui/__tests__/practiceScreen.test.tsx src/ui/__tests__/mockScreen.test.tsx --runInBand`

- [ ] **Step 2: Run the full Jest suite**

Run: `npm test -- --runInBand`

- [ ] **Step 3: Run static verification**

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run check:map-style`

- [ ] **Step 4: Start the development server**

Run: `npx expo start --dev-client`

Record the reachable Expo URL. Do not claim native camera, speech, haptic, or GPS simulation verification unless a development build is connected.

- [ ] **Step 5: Inspect the final diff and repository state**

Run: `git diff --check`

Run: `git status --short`

Confirm no prototype scratch files, generated caches, credentials, unrelated edits, or native build products are staged.

- [ ] **Step 6: Commit verification corrections only when Step 1-5 required a source change**

Stage each corrected file by its exact path as reported by `git status --short`, review `git diff --cached`, and commit with `test: complete route lifecycle replay coverage`. When verification requires no correction, leave the implementation commits unchanged.
