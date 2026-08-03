# Waze Map Treatment — Design Spec

**Date:** 2026-08-03
**Status:** Approved 2026-08-03 — "Waze layout, emerald identity". Design artifact: https://claude.ai/code/artifact/821b3c7f-fd6c-4455-b282-31d8821d6536
**Feature:** Make the practice-drive map look and behave like Waze — coloured base map, wide roads, a Waze-shaped puck, GPS snapped to the road, and a camera that stops twitching.

## Goal

The navigation map in `app/route/[id]/practice.tsx` currently uses Mapbox `light-v11`: a near-white base with hairline roads. Junctions are unreadable ahead of time, the puck reads as a map pin rather than a vehicle, raw GPS drifts the puck through gardens, and the camera flips zoom levels and swings with the compass.

Five changes fix that. The **layout** copies Waze; the **identity** stays emerald — the route line and puck arrow keep `#059669`, so the map still belongs to this app.

## 1. Map base — colour and road width

Switch `NAV_STYLE` from `mapbox://styles/mapbox/light-v11` to `mapbox://styles/mapbox/navigation-day-v1`, which already ships wide roads and navigation-oriented colouring, then override the land, water, park and road-width layers at runtime.

### Palette

| Role | Hex |
|---|---|
| Land / background | `#EFEEE8` |
| Road fill | `#FFFFFF` |
| Road casing | `#C3C8C1` |
| Motorway / A-road fill | `#F7DFAE` |
| Park, green space | `#DCE7CE` |
| Water | `#A9D3EA` |
| Buildings | `#E4E2DB` |
| Route core | `#059669` (`colors.accent`) |
| Route casing | `#04684C` |

Park green is deliberately low-saturation. A vivid park next to an emerald route line would compete with it; the route must remain the brightest green on screen at all times.

### Road widths

Zoom-interpolated `lineWidth`, roughly double today's:

| Road class | z15 | z17 | z19 (nav) |
|---|---|---|---|
| Motorway / A-road | 7 px | 15 px | 30 px |
| Primary / secondary | 5 px | 12 px | 24 px |
| Residential | 3 px | 8 px | 17 px |
| Casing (each side) | +1 px | +1.5 px | +2.5 px |

### Implementation

rnmapbox layer components accept an `existing` prop that restyles a layer already present in the loaded style. Road-width and colour overrides are declared as `<LineLayer id="road-primary" existing style={{...}} />`-style children of `MapView`, with all constants living in a new `src/ui/mapStyle.ts`.

**Risk and fallback:** if `existing` overrides prove unreliable, author the same palette as a custom style in Mapbox Studio and point `NAV_STYLE` at that URL. Identical visual result, one line of app code, but it requires the user's Mapbox account. Decide this during implementation, on-device.

## 2. The puck

Waze's puck is three stacked layers, not one icon. Today's is a solid emerald disc containing an Ionicons paper-plane rotated `-45deg` — it reads as a pin and hides the road beneath it.

New structure, extracted into `src/ui/NavPuck.tsx`:

1. **Presence pad** — soft grey ellipse, `#0F172A` at ~10% opacity, ~66×52 px, giving the vehicle physical footprint on the road.
2. **White disc** — 40 px, sitting on the pad.
3. **Arrow** — a real SVG chevron pointing straight up, fill `#059669`, stroke `#04684C` at 2 px. Replaces the `rotate(-45deg)` Ionicons workaround.

Rotation: while the camera is following, screen-up already *is* the driver's heading, so the arrow needs no rotation. It rotates by the smoothed heading only when the user has panned away from follow mode (`following === false`).

Screen position: the puck sits at roughly **62% down** the map instead of centred, putting more road ahead in view.

### Camera control

This is the one structural change. Today the camera runs in `followUserLocation` + `UserTrackingMode.FollowWithHeading`, which means the **native** layer decides both the centre (raw GPS) and the heading (raw compass). Neither is reachable from JS, so neither snapping nor heading smoothing would have any effect on what the driver sees.

So the camera moves to manual control: on each throttled tick, call `cameraRef.current.setCamera({ centerCoordinate: snapped, heading: smoothedHeading, zoomLevel, pitch: 55, padding, animationDuration })`. `followUserLocation` is switched off during the `approach` and `route` phases.

Consequences to handle:

- The recenter button no longer works by toggling `following` off and on. It sets `following = true`, which resumes the manual ticks.
- Detecting that the user has panned away can no longer rely on `onUserTrackingModeChange`. Use `MapView`'s `onTouchStart` / region-change-from-gesture to set `following = false`.
- `animationDuration` is set just above the tick interval (~300 ms at 4 ticks/s) so consecutive camera moves blend into continuous motion rather than stepping.

The `preview` phase keeps its existing `fitBounds` behaviour and is unaffected.

## 3. Snap to road

Raw GPS wanders 5–15 m. Because the full route polyline is already in memory, each fix can be projected onto it — no extra API call, no network, works offline.

### New pure functions in `src/lib/geo.ts`

- `projectOnSegment(a: LatLng, b: LatLng, p: LatLng): { point: LatLng; t: number; distM: number }` — perpendicular projection of `p` onto segment `a→b`, with `t` clamped to `[0, 1]`.
- `snapToPath(coords: LatLng[], p: LatLng, nearIdx: number, windowSize = 30): { point: LatLng; idx: number; distM: number; bearing: number }` — projects onto the segments within `±windowSize` vertices of `nearIdx` and returns the closest result, plus the bearing of the winning segment.
- `smoothHeading(prev: number, next: number, alpha = 0.15): number` — circular exponential moving average that wraps correctly across 0°/360°.

The `±30`-vertex window matters: the seeded routes are loops, and an unwindowed search would snap the driver onto the return leg when the outbound and inbound roads run close together.

### Use in the screen

- **Off-route threshold: 40 m.** Beyond it, `snapToPath` is ignored and the raw fix is used. This is also the natural hook for rerouting later — not acted on in this pass.
- The snapped point drives the puck marker and `trailIndex` (the travelled/ahead route split).
- The **road bearing** returned by the snap drives the camera heading above **3 mph**. Below that, the smoothed compass is used, since a stationary vehicle has no meaningful course. Either way the value is passed through `smoothHeading` before it reaches the camera.

## 4. Camera sensitivity

Three separate causes, three fixes.

| Knob | Now | Proposed |
|---|---|---|
| Puck heading source | raw compass, every fix | road bearing above 3 mph; smoothed compass below |
| Heading filter | none | circular EMA, α = 0.15 |
| Heading deadband | 0° | 3° — smaller deltas never reach the camera |
| Camera update rate | every fix (~2/s) | throttled to 4/s maximum |
| Zoom levels | 19 / 18 / 17.5 | 18.6 / 18.0 / 17.5 |
| Zoom thresholds | `<150 m`, `>600 m` (hard flip) | hysteresis: enter close at 130 m, leave at 180 m; enter far at 650 m, leave at 550 m |
| Puck position | raw GPS | snapped to route |
| GPS sample rate | 500 ms / 1 m | unchanged |

`navZoom(distanceToManeuverM)` in `src/lib/navigation.ts` becomes `navZoom(distanceToManeuverM, currentZoom)` so it can apply hysteresis against the level currently in effect.

**What stays fast:** voice prompts, distance-to-manoeuvre, and step advancement all continue to run on the unfiltered fix at the full 500 ms rate. Only what the driver *sees move* is smoothed. GPS sampling is not reduced — the noise is filtered downstream rather than sampled away.

## 5. Files

| File | Change |
|---|---|
| `src/lib/geo.ts` | add `projectOnSegment`, `snapToPath`, `smoothHeading` |
| `src/lib/navigation.ts` | `navZoom` gains hysteresis; `trailIndex` fed from the snapped point |
| `src/lib/__tests__/geo.test.ts` | tests for projection, windowed snapping, circular EMA |
| `src/lib/__tests__/navigation.test.ts` | tests for zoom hysteresis |
| `src/ui/NavPuck.tsx` | new — the three-layer puck |
| `src/ui/mapStyle.ts` | new — palette constants and road-width overrides |
| `app/route/[id]/practice.tsx` | new base style, layer overrides, manual camera control, snapped puck |

Extracting the puck and the style constants out of `practice.tsx` is deliberate: that file is already 500+ lines carrying preview, approach, route and finished states. Moving presentational constants and one self-contained marker component out keeps the change reviewable and the file from growing further.

## 6. Testing

- `projectOnSegment`, `snapToPath`, `smoothHeading` and the new `navZoom` are pure and unit-tested first, following the existing `src/lib/__tests__` pattern.
- Circular EMA needs an explicit wraparound case: smoothing from 355° toward 5° must move forward through 0°, not backward through 180°.
- `snapToPath` needs a loop-route case proving the window prevents snapping onto the return leg.
- Zoom hysteresis needs a case proving that hovering at 150 m does not oscillate.
- The map palette, road widths, puck appearance and camera feel are verified on-device against the Hemel Hempstead (TEST) loop. They are visual, and not unit-testable.

## 7. Out of scope

- **Rerouting.** The 40 m off-route signal is computed, but nothing acts on it.
- The top instruction banner, speedometer and bottom bar keep their current design.
- Traffic, incident reports, and anything else Waze-specific beyond the map surface.
- A dark / night map. Worth doing, but it doubles the palette work — separate job.

## 8. Known follow-ups after implementation

Implemented 2026-08-03 across ten commits (`d4dd43d`..`93ecd22`). Two defects in this spec surfaced during the final review and were corrected in the code, so §1's numbers no longer match what shipped:

- **The casing model in §1 was wrong.** `navigation-day-v1`'s `-case` layers use `line-gap-width` (the hole the fill sits in) with `line-width` as the per-side outline. Overriding `lineWidth` on them would have rendered every road as two grey rails around a floating stripe. The code overrides the gap and uses a single `ROAD_OUTLINE_PX`; the `casingWidths` table is gone.
- **The width table in §1 was authored against `light-v11`** and then applied to `navigation-day-v1`, which already ships wide roads — it made roads roughly 40% *narrower* than doing nothing. The tables were re-derived from the live style JSON and now run 1.19–1.50× stock across the navigation band. `src/ui/mapStyle.ts` holds the real values; `src/ui/__tests__/mapStyle.test.ts` guards them against a `STOCK_AT_Z18` constant.

Deferred, in rough priority order:

1. **Bridge and tunnel layers.** 32 `bridge-*`/`tunnel-*` road layers are unstyled, so colour and width jump mid-carriageway on any flyover. Widening the fills made this more visible. Largest remaining visual defect.
2. **`ROAD_OUTLINE_PX` is flat at 2.5** where stock interpolates 0.5 → 2, so at preview zooms streets read grey rather than white-with-an-edge. The fix is a two-stop outline expression, not a change to the width tables.
3. **`practice.tsx` has no test coverage.** Seven of the final review's ten findings lived in that file and rest on code reading alone. A pure `navTick(state, fix) → { pos, heading, zoom, trailIdx, onRoute }` in `src/lib/` would be unit-testable without mocking Mapbox, and would have caught the two behavioural bugs that survived every per-task gate.
4. **The layer-override block** is ~50 near-identical JSX elements; adding bridges and tunnels would roughly double it. A data-driven `.map()` over a `{id, fill, casing}` table is now clearly worth it.
5. **`setFollowing(false)`** in the touch and `onCameraChanged` handlers does not also write `followingRef.current`, so one or two camera pushes can land before the sync effect runs. Harmless today.
6. **`recenter` lost its distinct 500 ms ease** and now shares `CAM_ANIM_MS` (600 ms).

**Nothing below has been seen on a device.** The palette, widths, casing flushness, puck, camera feel, the 10 px drag threshold, and whether touch events reach JS through Mapbox's native gesture handling are all unverified. Check in this order: road rendering, width against a stock screenshot, camera smoothness, then whether a pan cancels follow at all.
