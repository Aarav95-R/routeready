# Route Lifecycle and Map Redesign - Design Spec

**Date:** 2026-08-26
**Status:** Approved visual direction and interaction model on 2026-08-26; written implementation contract awaiting final review.
**Prototype:** [Interactive route lifecycle and map redesign](../../design/2026-08-26-route-lifecycle-map-redesign.html)

## Goal

Make Practice and Mock Test drives behave like one dependable navigation product:

- detect arrival at the route start from live location updates and ask the learner to begin;
- never start timing or scoring without an explicit confirmation;
- detect a genuine closed-loop finish and ask the learner to end;
- never complete or navigate away without an explicit confirmation;
- identify sustained off-route travel, guide the learner back, and resume route progress from the correct forward position;
- present this state through a quieter, more professional map interface.

This work strengthens the existing Expo, Mapbox, Reanimated, Zustand, and Jest implementation. It does not replace the navigation stack.

## Current Gaps

1. The route preview reads only the last known position. It cannot react when a learner enters the start zone while the preview remains open.
2. Practice and Mock Test duplicate lifecycle logic and can diverge in their thresholds, prompts, and side effects.
3. Practice immediately displays completion after detecting the finish; Mock Test immediately ends and navigates to results. Neither provides the approved finish confirmation.
4. A large forward rejoin can find a later route vertex, but normal snapping continues around the old trail index. The learner may remain in recovery even after reaching the route.
5. Mock Test records a deviation only after rejoin, so ending while still off route can lose the event.
6. Map controls are individually useful but visually fragmented across several floating surfaces.

## Product Rules

### Qualified location fixes

A fix may advance lifecycle, rerouting, rejoin, progress, timing, or scoring only when all of these are true:

- latitude, longitude, timestamp, and accuracy are finite;
- the timestamp is no more than 5 seconds old when received;
- it is not a duplicate of the preceding accepted fix;
- horizontal accuracy is 25 metres or better.

A poor fix may update the visible puck when Mapbox can render it, but it must not change route state. The app must not infer progress from a stale last-known fix.

### Start detection

The preview starts a foreground location watch. It enters `start-candidate` only when the learner is:

- within 30 metres of the route start;
- travelling at 5 mph or less;
- represented by three accepted fixes spanning at least 3 seconds.

Once confirmed, the app shows the start prompt. Timing and scoring remain stopped. `Begin route` validates that a fresh accepted fix remains within 45 metres, then starts the drive. `Wait here` collapses the prompt but keeps live detection active.

The app never auto-starts. Starting elsewhere is not included because it breaks route integrity and closed-loop finish protection.

### Active navigation

The route's authoritative progress index is monotonic. Accepted fixes can move it forward but never backwards. A raw fix far from the route cannot advance normal progress before recovery or rejoin logic has accepted it.

Practice and Mock Test use the same lifecycle thresholds. Mock Test additionally feeds accepted raw fixes to scoring and records lifecycle timestamps needed for its result.

### Off-route detection and recovery

Retain the existing hysteresis, with temporal qualification:

- enter off-route at 45 metres or farther for three accepted fixes spanning at least 3 seconds;
- exit off-route at 25 metres or nearer for two accepted fixes;
- isolated GPS spikes and two-fix departures remain visually and audibly silent.

The transition to off-route emits one deviation event, one haptic/speech instruction, and at most one initial directions request. Further fixes do not repeat those effects. A bounded retry policy handles request failure; between attempts the fallback instruction is `Head back toward route` using the bearing to the best forward rejoin point.

The recovery line leads to a forward route point. When a qualified rejoin occurs, navigation rebases to:

```text
max(previous progress floor index, selected rejoin index)
```

It then resets or recomputes the trail index, current manoeuvre, remaining distance, and announcement bookkeeping from that index. A rejoin must never rewind the learner. If at least 250 metres of the planned route was skipped, the app announces and logs the skipped section without treating it as a DVSA driving fault.

Leaving an unsuitable recovery leg can request a replacement route, but it must not emit a second departure event. Self-rejoin remains possible while a network request is unavailable or in flight.

### Closed-loop finish detection

Finish qualification requires all of the following:

- measured route progress is at least 90%;
- distance from the route finish is 30 metres or less;
- speed is 5 mph or less;
- accuracy is 25 metres or better;
- two accepted fixes satisfy the conditions over at least 3 seconds.

This prevents the shared start/finish coordinate from completing the drive at departure. Qualification latches a candidate finish timestamp and shows the finish prompt. The clock shown on screen may continue updating, but Mock Test duration uses the latched candidate time so time spent parked on the prompt cannot change the assessment.

`End route` persists the result and navigates exactly once. Repeated taps or fixes are idempotent. `Keep driving` dismisses the prompt and suppresses it until the learner leaves the finish zone and later re-enters it; active navigation then continues.

The app never auto-finishes.

### Location failures

Permission denial, watch failure, and a prolonged absence of accepted fixes produce a recoverable `location-unavailable` state. It offers retry, system settings where supported, and leave-route actions. Timing and scoring do not continue on invented or stale movement. A Mock Test with insufficient data is unassessable rather than a clean pass.

## Lifecycle Model

A new pure reducer owns the shared state machine and produces declarative one-shot effects. It must not import React, Mapbox, Expo Location, speech, haptics, navigation, or network code.

```text
preview
  -> start-candidate
  -> start-prompt
  -> active
  -> off-route / returning
  -> finish-candidate
  -> finish-prompt
  -> complete

Any live state -> location-unavailable
Any pre-complete state -> abandoned
```

Screens execute reducer effects such as starting a watch, requesting a recovery path, speaking once, persisting a result, or navigating. Each effect carries a stable ID so React rerenders cannot execute it twice.

Recommended module boundary:

- `src/lib/routeLifecycle.ts`: state, events, reducer, fix qualification, temporal confirmation, and effect descriptions;
- `src/lib/navigation.ts`: route projection and manoeuvre calculations, extended with explicit monotonic rebase inputs;
- `src/lib/offRoute.ts`: departure/rejoin geometry and forward rejoin selection;
- a shared screen hook or controller: owns the Expo Location watch and executes effects;
- Practice and Mock Test screens: provide mode-specific scoring, persistence, and completion destinations;
- shared start and finish prompts plus consolidated guidance and drive controls.

The implementation may refine filenames to match the surrounding code, but the pure lifecycle boundary and shared thresholds are required.

## Visual Direction

The approved direction is **Precision daylight**.

- Keep warm land, white roads, muted parks and water, and the existing navigation-day Mapbox foundation.
- Route ahead is emerald; driven route is neutral grey; recovery is amber.
- Preserve the current follow camera, pitch, readable road labels, puck, and Mapbox attribution.
- Consolidate guidance into one anchored charcoal top deck: distance, primary instruction, and compact next manoeuvre.
- Consolidate drive actions into one full-width bottom rail with stable dimensions. Attribution remains unobscured immediately above it.
- During an unconfirmed deviation, change no map chrome. Once off-route is confirmed, only the status strip, recovery tile, and recovery line turn amber; the original route dims to roughly 35% opacity.
- Start and finish confirmations use focused bottom sheets with one primary action and one quiet secondary action.
- Avoid nested cards and disconnected floating controls. Controls remain reachable at 320-point width and with long route or road names.

### Motion

- Start and finish sheets enter once with a short spring and a subtle backdrop fade.
- Confirmed recovery crossfades the original and recovery treatments; it does not flash on individual noisy fixes.
- Rejoin returns to active styling with a short opacity transition and one haptic.
- Camera changes use the existing follow behaviour and must not fight manual recentering.
- Reduced Motion removes sheet translation and route treatment interpolation; state changes use opacity only.

## Screen Behaviour

### Practice

Practice uses the shared start, navigation, recovery, and finish lifecycle. Ending the route opens the existing completion experience only after `End route`. Leaving early remains an explicit abandoned drive and is not recorded as a completed route.

### Mock Test

Mock Test uses the same visible lifecycle. Only accepted fixes contribute to assessment. Off-route events remain separate navigation events rather than automatic DVSA faults. Ending while still off-route flushes the open deviation before result persistence. Persistence and result navigation occur once after `End route`.

## Mapbox Constraints

`NavMap` must retain permanent source/layer ownership during a drive. Shape sources should receive empty or updated geometry instead of being mounted and unmounted across lifecycle states. This avoids native Mapbox source/layer races.

Recovery requests are asynchronous and cancellable or stale-result guarded. A response may update the map only if its request ID still belongs to the current departure. Network retries are bounded and never run once per GPS fix.

## Test Strategy

### Pure lifecycle tests

Use deterministic timestamps and coordinate fixtures to prove:

- live arrival requires three good fixes and never auto-starts;
- stale, inaccurate, duplicate, fast-moving, and noisy fixes do not trigger start;
- explicit begin starts exactly once;
- progress below 90% cannot finish at the closed-loop start coordinate;
- finish requires the full distance, speed, accuracy, count, and time-span gates;
- explicit end completes exactly once and uses the latched candidate time;
- `Keep driving` suppresses the prompt until finish-zone exit and re-entry;
- one or two off-route spikes produce no departure;
- sustained departure produces one event, announcement, and fetch effect;
- fetch failure enters bearing fallback and retries within its bound;
- a large forward rejoin rebases every route cursor and never rewinds;
- two good rejoin fixes produce one recovery completion;
- leaving a recovery leg replaces it without duplicating the deviation;
- permission denial, watcher failure, and no-fix timeout are recoverable and cannot score.

### Screen replay tests

Extend `src/test/locationMock.ts` and the existing Practice/Mock screen suites to replay a complete loop:

1. approach the start and hold for the prompt;
2. confirm start;
3. drive normally;
4. inject a single GPS spike and verify no recovery UI;
5. take a sustained wrong turn and verify one recovery transition;
6. simulate a failed directions request and bearing fallback;
7. rejoin well ahead of the previous snap window and verify monotonic progress;
8. pass the finish coordinate before 90% and verify no prompt;
9. complete at least 90%, stop in the finish zone, and verify the prompt;
10. keep driving once, leave and re-enter, then end explicitly;
11. verify exactly one persisted completion/result navigation.

Run the same replay in Practice and Mock Test. Mock assertions also cover accepted-fix scoring, the latched end time, an open deviation at end, and the unassessable no-data result.

### Device verification

Jest cannot validate native Mapbox rendering, camera tracking, spoken prompts, haptics, permission sheets, or GPS behaviour. Verify those on a real iPhone or development build using simulated location tracks for the normal loop, sustained departure, large forward rejoin, poor-accuracy fixes, and network loss. Confirm the route layers remain visible, controls do not overlap attribution, and 320-point layouts contain all text.

## Acceptance Criteria

1. Entering the start zone while the preview is already open produces a start prompt from live fixes.
2. Neither mode starts, finishes, persists, or navigates without the learner's explicit action.
3. The shared start/finish point never causes an early closed-loop completion.
4. GPS noise does not visibly toggle rerouting; a sustained departure produces one coherent recovery event.
5. Network loss still provides a stable bearing-based route-return instruction.
6. Rejoining at any later point resumes normal guidance from that point and never pulls progress backwards.
7. Practice and Mock Test share lifecycle rules, while Mock Test preserves mode-specific scoring and result persistence.
8. The map matches the approved prototype's visual hierarchy in active, recovery, start-prompt, and finish-prompt states.
9. Automated loop replays cover the complete lifecycle and pass in both modes.
10. Native device verification covers Mapbox, camera, speech, haptics, attribution, reduced motion, and narrow layouts.

## Out of Scope

- background navigation after the app is suspended;
- an offline routing graph or downloadable maps;
- traffic-aware rerouting;
- lane-level guidance;
- a night theme;
- route data reseeding;
- redesigning unrelated screens or changing the DVSA scoring model.
