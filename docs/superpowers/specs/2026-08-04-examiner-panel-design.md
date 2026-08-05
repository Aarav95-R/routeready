# Examiner Panel and Shared Nav Map — Design Spec

**Date:** 2026-08-04
**Status:** Approved 2026-08-04. Design artifact: https://claude.ai/code/artifact/a16a0dcf-2fb1-4816-9b77-8dd58473ea5f
**Feature:** Give the mock test the practice screen's map, and let whoever is in the passenger seat mark the drive against DVSA's own fault categories.

## Goal

Two things, in one piece of work because both land in `app/route/[id]/mock.tsx`:

1. **The map.** The mock test is still on Apple Maps (`react-native-maps`) with a flat emerald polyline and the system blue dot. It gets the practice screen's map — Mapbox, Waze palette, wide roads, three-layer puck, manual heading-up camera, two-source rotation, snapping, and the route going grey behind you.
2. **The examiner panel.** A sheet the passenger uses to mark the drive, feeding the result.

The map work forces an extraction: all of that machinery currently lives inside `practice.tsx`, which is 709 lines. Copying it would leave two 1,400-line screens drifting apart, where every future map fix gets made twice and silently gets made once.

## 1. Terminology, and what DVSA actually says

The app currently says `"minor" | "serious"`. Learners say minors and majors, so the UI and the code both move to that.

| App | DVSA | Effect |
|---|---|---|
| **minor** | Driving fault | 15 allowed; 16 or more fails |
| **major** | Serious *or* dangerous fault | One fails the test outright |
| **credit** | No equivalent — this app's own idea | Practice score only, never the verdict |

DVSA's definitions, verbatim:

- **Driving fault** — "one which in itself is not potentially dangerous"
- **Serious** — "potentially dangerous or entails a breach of the law"
- **Dangerous** — "involving actual danger to the examiner, candidate, the general public, or property"

Serious and dangerous both fail on the spot. Asking someone to tell them apart at 30 mph buys nothing, so the panel collapses them into one **major**.

**No category is inherently a minor or a major.** Every category on the test report can be marked at any of the three levels; the incident decides, not the heading. This is why every row carries both a MIN and a MAJ button. Sources: [Understanding your driving test result](https://www.gov.uk/guidance/understanding-your-driving-test-result/car-driving-test), [DT1 Annex 6](https://www.gov.uk/guidance/guidance-for-driving-examiners-carrying-out-driving-tests-dt1/annex-6-guide-to-assessment-and-marking), [DL25](https://assets.publishing.service.gov.uk/media/62a7437cd3bf7f03667c667a/dl25-driving-test-report.pdf).

### Code rename

`Fault.severity` becomes `"minor" | "major"`. `MockResult.serious` becomes `majors`. The existing automatic speeding and observation faults keep their behaviour — a sustained speeding fault is still the more severe kind, now called a major.

## 2. The categories

DVSA's own names, not an invented set: a learner is emailed these exact words after a real test, and a mock using different ones cannot be compared to it. Grouped by when they can be marked.

### `driving` — markable at any moment (16)

`control`, `moveOff`, `mirrors`, `signals`, `junctions`, `judgement`, `positioning`, `clearance`, `followingDistance`, `speed`, `progress`, `signsAndSignals`, `pedestrianCrossings`, `normalStops`, `awarenessPlanning`, `ancillaryControls`

### `manoeuvres` — only when one is asked for (4)

`reversePark`, `forwardPark`, `pullUpOnRight`, `controlledStop`

### `beforeDriving` — marked while stationary (3)

`eyesight`, `precautions`, `vehicleChecks`

Each category carries a display label, plus short `minorExample` and `majorExample` strings shown in the panel so the passenger knows where the line falls (e.g. mirrors: "Missed check where nothing was coming" / "Changing direction or braking hard into someone unseen").

Excluded on purpose: uncoupling and recoupling (lorry and trailer tests only) and fuel-efficient driving (DVSA records it but it does not count towards the result).

## 3. The panel

A `@gorhom/bottom-sheet` over the map, matching the hazard sheet already used in `practice.tsx`.

**Collapsed** (default) — one bar, so the map stays readable:
- Running tally: `3 min · 1 maj · +4`, each in its own colour
- The last mark, with an **Undo** button beside it

**Expanded** — covers the map, which is fine because whoever holds the phone is not driving:
- Grouped list, one row per category
- Each row: label, then three buttons — `MIN` (amber), `MAJ` (red), `+` (emerald)
- `manoeuvres` and `beforeDriving` groups are collapsed by default; most drives have no manoeuvre

### Interaction rules

- **Three labelled buttons, not a long-press.** An earlier draft escalated a minor to a major by holding. That is one slip from failing someone's test on a gesture nothing advertises.
- Every mark fires a haptic — light for a minor, heavy for a major, success for a credit — so it registers without looking down.
- **Undo removes the last mark**, whatever it was, and is always reachable from the collapsed bar. Mis-taps in a moving car are certain.
- Rows are at least 44 pt tall. This is tapped at speed by someone who should mostly be watching the road.

### Repeated minors

From the examiner guidance: a candidate "who habitually commits a driving fault in one aspect of driving throughout the test cannot be regarded as competent to pass the test. The repeated fault can then be assessed as potentially dangerous."

At the **third** minor on one category, that row turns amber and the collapsed bar shows `Mirrors ×3 — an examiner would likely call this serious`.

**It warns, it does not decide.** DVSA gives no number; "habitually" is the examiner's judgement. Auto-escalating would silently fail someone on an invented threshold. The count and the warning are shown; pressing MAJ stays the passenger's call.

## 4. Marks

```ts
type Mark = {
  category: ExaminerCategoryId;
  level: "minor" | "major" | "credit";
  t: number;                  // ms since epoch
  at: LatLng | null;          // last known fix, null if none yet
};
```

Time and position cost nothing to record and let the result screen say "Mirrors — minor, 4:12" instead of just "Mirrors". They also make a future map replay possible without another data change.

## 5. Scoring

Pass or fail stays exactly the DVSA rule. Credits move the practice score only.

```
passed = majors === 0 && minors <= 15
score  = 100 − 5×minors − 40×majors + min(credits, 10)
score  = passed ? score : min(score, 55)
```

The cap matters: without it a failed test with several credits could show a number that looks like a comfortable pass. If credits could turn a fail into a pass, the app would tell someone they were ready for a test they would fail — the one thing it exists to prevent.

`aggregate()` gains a `credits` count and returns it on `MockResult`, so the result screen can show a **What went well** section. A learner reading three faults and nothing else has no idea what to keep doing.

**Credits are not persisted.** `ProgressEntry` stores fault tags and a score; credits would need a new column. They appear on the result screen and feed the score for the session; a past test reopened later shows faults only. Doing it properly is a separate job.

## 6. The map

### Extraction

New `src/ui/NavMap.tsx` takes everything map-shaped out of `practice.tsx`: the Mapbox view, the ~60 base-layer overrides, manual camera with follow and recenter, snapping, the rotation model, the route line with its progress split, the puck, and start/finish markers.

Each screen keeps its own chrome. Practice keeps its instruction banner, voice prompts, step advancement and phase machine; mock keeps its clock, observation zones, mirrors button, scoring and finish flow.

**The extraction is a pure move.** No behaviour changes in the same commit — the practice screen has not yet been confirmed working on a device, and mixing a refactor with a behaviour change would make a pre-existing bug indistinguishable from one the extraction caused.

Per-fix decision logic moves to `src/lib/navmap.ts` as a pure function so it can be tested without mocking Mapbox. This is what the last review asked for, and having a second consumer is what settles its shape.

### Positions: score on raw, draw on snapped

Snapping moves the reported position onto the route line. That is what stops the puck drifting through gardens, and it is also what could place a driver inside an observation zone they never entered.

So: **`NavMap` displays the snapped position; `onSample` keeps receiving the untouched GPS fix.** Observation zones and speeding faults are judged on what the phone measured. The display can never invent a fault or hide one, and this change cannot alter anyone's score.

### Mock-specific map behaviour

- Camera follows heading-up and pitched, as practice does. A mock test has no turn instructions, so zoom sits at one fixed navigation level rather than tightening into manoeuvres.
- The route shows progress: grey behind, emerald ahead.
- **Observation zones are drawn on the map** — amber translucent circles. They are the thing being scored and currently only a toast mentions them.
- The mirrors button moves down. The puck sits at 62% of screen height and the button is currently centred near there; on a pitched map they would overlap.

## 7. Files

| File | Change |
|---|---|
| `src/lib/examiner.ts` | new — categories, groups, examples, mark-to-fault conversion, repeated-minor warning |
| `src/lib/navmap.ts` | new — the per-fix decision logic as a pure function |
| `src/lib/scoring/engine.ts` | severity rename; `credits`; the fail cap |
| `src/stores/mockTestStore.ts` | marks, undo, last mark, per-category counts |
| `src/ui/NavMap.tsx` | new — the shared map |
| `src/ui/ExaminerSheet.tsx` | new — collapsed bar and expanded list |
| `app/route/[id]/practice.tsx` | uses `NavMap`; drops to roughly 400 lines |
| `app/route/[id]/mock.tsx` | `NavMap` plus the sheet; keeps clock, zones, mirrors, finish |
| `app/route/[id]/result.tsx` | "What went well"; faults show time; minor/major wording |

## 8. Testing

- `src/lib/examiner.ts` and `src/lib/navmap.ts` are pure and unit-tested first.
- The scoring changes need cases for: credits capped at 10, the 55 cap on a failed test, credits never changing `passed`, and the rename not altering existing pass/fail outcomes.
- `mockTestStore` needs cases for undo (including undo with no marks), per-category counts, and the repeated-minor threshold.
- `ExaminerSheet` gets a render test in the `@testing-library/react-native` style already used for `NavPuck`.
- `NavMap` itself is not unit-testable; the extraction is verified by the existing suite staying green and by `tsc`.
- Everything visual is verified on-device against the Hemel Hempstead (TEST) route.

## 9. Out of scope

- Persisting credits — needs a schema change.
- The full DL25 as a post-test review screen.
- `app/route/[id]/index.tsx`, the route preview, which is also still on Apple Maps.
- Any change to how often the mock test samples GPS, so recorded tests stay comparable.

## 10. Known follow-ups after implementation

Implemented 2026-08-04/05 across 16 commits (`d962a57`..`e6b5147`). Two things in this spec were not delivered as written, and are worth knowing before reading the code:

- **§3's collapsible groups were lost.** `manoeuvres` and `beforeDriving` were meant to start collapsed; all 23 rows always render. Lost at planning time, so no review had anything to compare against. Costs about seven rows of extra scrolling.
- **The warning wording says "major", not "serious".** §3 fixed the string as "an examiner would likely call this serious" — deliberately the examiner's word rather than the app's. Changed for app-wide consistency without being flagged.

The final review found and fixed one defect worth recording because it is the failure this app exists to prevent: **denying location permission produced a fabricated PASS with score 100.** The screen returned silently, the clock ran, Finish worked, and `aggregate([], d, 0)` reported a pass. There is now a `permissionDenied` screen and a zero-sample guard.

Deferred, in rough priority order:

1. **No screen has any test coverage.** `mock.tsx`, `practice.tsx` and `NavMap.tsx` are verified by reading alone — and five of the seven issues the final review raised lived in them. The 143 green tests say nothing about screen wiring. Adding `@rnmapbox/maps` test mocks would change that.
2. **The zero-sample guard only triggers at exactly zero samples.** A single stray indoor fix still yields 100 and a pass.
3. **`mock.tsx` duplicates `practice.tsx`** — the heading callback verbatim, the `routeLL`/`isLoop` memos, the camera ref bank, the navFix commit block and `recenter`. A `useNavCompass` hook was deliberately deferred; it should happen before the next map change, not after.
4. **Seed-versus-`fitBounds` race.** If the one-off position seed lands before `onDidFinishLoadingMap`, the route may never be framed until the driver has moved five metres.
5. **The warning pill can exceed its 44 pt budget** at 320 pt screen width or with large Dynamic Type, reaching ~55 pt. Visual only — `pointerEvents="none"`.
6. **`resultView.ts` reconstructs `marksToFaults`'s filter** with no enforced link beyond a comment and two integration tests. A cross-reference comment on `marksToFaults` itself would be two lines and zero risk.
7. **`NavMap`'s `preview` prop overloads three behaviours** — draw one whole line, fit bounds on load, and gestures do not release follow. `mock.tsx` passes it a fourth meaning ("no fix yet").
8. Smaller: `prevPosRef` is write-only; `HEADING_ALPHA`'s value is unpinned by tests; the `0`/`100` score bounds are unnamed literals; the `st!` assertions in `practice.tsx` rest on two predicates duplicated forty lines apart.

**Nothing here has been seen on a device.** Check in this order: deny location permission and confirm you get the denial screen rather than a pass; the collapsed sheet against the home indicator; the controls row against the puck **on a 667 pt screen** — tall phones hide that one; the warning pill at three repeated minors; and camera smoothness at low speed, where `CAM_ANIM_MS` is tuned for a fix cadence this screen does not deliver.
