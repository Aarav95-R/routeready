# Live Navigation Upgrade — Design Spec

**Date:** 2026-07-30
**Status:** Approved 2026-07-30 — Apple Maps/Expo Go; travelled trail fades to grey; Preview → Start → Navigate flow.
**Feature:** Turn practice mode into a true Google/Apple/Tesla-style turn-by-turn navigation experience.

## Goal

When you start a practice route it should feel exactly like pressing **Start** in Google Maps: a route preview, then a live camera that stays locked on you, tilts and zooms in, looks ahead, rotates with your heading, **consumes the route behind you as you drive**, and clearly marks the **start and finish** — with spoken and on-screen turn instructions.

## 1. Map engine decision (the big one)

The whole app must keep running in **Expo Go** (scan a QR, no Mac/Xcode/build step). That constraint drives this choice.

| Option | Nav quality | Expo Go? | Cost |
|---|---|---|---|
| **Apple Maps** (react-native-maps, current) | Very good — supports everything below | ✅ Yes | None |
| Google Maps on iOS (react-native-maps) | Similar to Apple | ❌ No — needs API key + custom dev build | Leaves Expo Go |
| **Mapbox** (@rnmapbox/maps) | Best/most customisable nav look | ❌ No — native module, needs dev build | Leaves Expo Go; you're on Windows → cloud (EAS) builds + TestFlight to install |

**Everything you asked for — auto-zoom, look-ahead, path-consumed-behind-you, start/finish markers, directional puck, heading-up rotation — is fully achievable on Apple Maps inside Expo Go.** Switching to Mapbox would only buy a more premium *default* look, at the cost of leaving Expo Go (no more QR-scan; you'd need cloud builds installed via TestFlight).

**Recommendation:** stay on **Apple Maps / Expo Go** now. Revisit Mapbox later only if you specifically want the premium map styling and are willing to move to dev builds.

## 2. The three states (flow)

**A. Preview** (before you start)
- Map zooms out to frame the **whole route**.
- **Start** marker (green) and **Finish** marker (checkered flag). *Note: the seeded routes are loops that begin and end at the test centre, so start and finish are the same spot — shown as one "Start / Finish" marker. Your Hemel test loop is the same.*
- Hazard pins visible.
- Bottom card: distance, estimated time, difficulty, and a big **Start** button.

**B. Navigating** (after you tap Start)
- Camera **locked on you**, tilted into 3D, **heading-up** (rotates as you turn), positioned so you sit in the **lower third** of the screen with the road ahead filling the view (look-ahead).
- **Auto-zoom**: tighter as you approach a turn, wider on long straights.
- **Directional puck**: an emerald chevron showing which way you're pointing (replaces the plain blue dot).
- **Route consumed behind you**: the part you've already driven fades/removes; only the road **ahead** stays bright emerald.
- Turn-instruction card (already built) + British voice announcing each turn.
- Bottom: remaining distance / ETA + a **Stop** button.

**C. Finished**
- "Route complete" summary; **Done** returns to the route screen.

## 3. Feature details

- **Route consumption:** project your position onto the route line, split it into *travelled* and *remaining*, draw them as two lines, update every GPS tick. Travelled = faint grey; remaining = bright emerald 7px. *(Alternative: remove the travelled part entirely — pure Tesla. Your call in the questions below.)*
- **Auto-zoom curve:** ~zoom 18.5 within 120 m of a turn → ~17 cruising → ~16 on long straights. Smoothly animated.
- **Look-ahead camera:** centre the camera a short distance *ahead* of you along your heading so you see what's coming, not what's behind.
- **Directional puck:** flat marker rotated to your heading (emerald disc + white chevron); default location dot hidden.
- **Start/Finish markers:** green "Start" and checkered "Finish"; combined into one marker for loop routes.
- **Heading:** GPS course when moving, travel-bearing fallback when slow, last-known otherwise (already implemented).

## 4. Out of scope for this pass

- **Rerouting** if you leave the route (we're guiding a fixed test route; if you go off it we keep showing the route and could add a subtle "off route" hint later).
- Lane guidance, speed-limit signs, 3D buildings, live traffic.

## 5. Testing

- Pure logic (route split point, adaptive-zoom curve) gets unit tests, like the existing nav engine.
- Camera, puck, markers, and the consumed-route look are verified on the device using the **Hemel Hempstead (TEST)** loop.

## 6. Decisions needed before build

1. **Map engine** — stay Apple Maps / Expo Go (recommended), or invest in a Mapbox dev build?
2. **Travelled path** — fade it to grey (keeps your bearings), or fully remove it (pure Tesla)?
3. **Preview → Start → Navigate flow** — add the route-preview screen with a Start button, or jump straight into navigation as it does now?
