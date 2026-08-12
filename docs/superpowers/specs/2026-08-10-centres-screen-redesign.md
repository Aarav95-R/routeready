# Centres Screen Redesign — Design Spec

**Date:** 2026-08-10
**Status:** Approved 2026-08-10. Design artifact: https://claude.ai/code/artifact/80e55e21-905c-4e35-b643-cd809742fb3c
**Feature:** Rebuild `app/(tabs)/index.tsx` so the list of test centres shows where the centres actually are, gives each one an identity you can recognise, and binds the two together.

## Goal

The centres list is the app's first screen and the plainest thing in it: a white rectangle per centre carrying a name, a region, a distance and a percentage. Meanwhile the screen one tap deeper — the routes list — now renders map postcards with staggered entrances and swipe actions. The front door looks like a spreadsheet in front of a redesigned house.

Direction **C × D** from the artifact: centres plotted at their real coordinates with distance rings around the driver, a sheet of cards bound to the map by scroll, and a permanent colour and monogram per centre so a pin is recognisably Barnet before you read its label.

Directions A (plain-English copy) and B (sparklines and a distribution plot) are not being built. B's material — the eight quarters of `pass_rate_history` that are seeded and never displayed — is still unspent and is the natural content for a centre detail screen, which does not exist yet.

## What is wrong now, precisely

1. `haversineM` is computed for every centre and then rendered as `· 1.2 mi away` in 11pt grey. The screen knows exactly where forty centres are and draws none of it.
2. Every row is the same rectangle. Forty of them.
3. The pass rate is the only thing with visual weight, coloured emerald above 45% and amber below, with no reference for whether 45% is good. (It is below the national average.)
4. `FILTERS = ["Nearest", "Pass rate", "Manual", "Auto"]` mixes two sorts and two filters in one segmented control, so choosing "Manual" silently abandons whichever sort you were in.
5. Sorting by distance requires a location fix. Without one, `filter === 0` quietly does nothing and the list stays in alphabetical order while the control still reads "Nearest".
6. There is no empty state. A search matching nothing renders an empty `FlatList` and the screen looks broken.
7. `refreshing` is only ever true during the pull, and a failed reload leaves the last-good list on screen with no indication the refresh failed.

## Three corrections to the artifact

The mockup showed things the data does not support. Same rule as the routes redesign: the screen may not say what the app does not know.

**1. "6 min drive" is deleted.** Nothing on this screen fetches a route. `services/directions.ts` does one origin→destination request at a time; drive times for forty centres would be forty calls on a tab that must open instantly, and the answer would be wrong the moment traffic changed. Rows show straight-line distance only — `1.2 mi away`, exactly what `haversineM` gives today. A batched matrix call is a follow-up, not part of a UI redesign.

**2. "Within 17 miles" is deleted.** `listCentres()` returns all forty, from Mill Hill to Tyne and Wear. The pill claimed a filter that does not exist. Its place on the map goes to a recentre button, which does something.

**3. The sheet header no longer shows the active centre.** The artifact put a coloured tile and the centre's name at the top of the sheet; that space now holds search and the filters, which the current screen has and the mockup dropped. Nothing is lost: the active centre is already named by its pin label on the map, tinted in its row, and centred by the camera. The tile was the fourth copy of the same fact.

## The shape of the screen

Behind everything is the map. In front of it, a sheet fixed at 52% — it does not move.

```
┌────────────────────────────────────────┐
│ 9:41                          ▮▮▮ ▯    │  status bar over the map
│                                        │
│  (Test centres)              (◎)       │  title pill · recentre button
│                                        │
│         ╭ ─ ─ ─ ─ ─ ─ ─ ╮              │  15 mi ring
│      ╭ ─┼─ ╮                           │  8 mi ring
│    ╭─┼─╮ │ │      ▾BA    ▾CH           │  3 mi ring
│    │ ◉ │ │ │  ▾MH    ▾WG               │  ◉ you · coloured pins
│    ╰─┼─╯ │ │      ▾HN    ▾TT           │
│      ╰ ─ ┼ ─ ╯                         │
│         ╰ ─ ─ ─ ─ ─ ─ ─ ╯              │
├────────────────────────────────────────┤
│              ▁▁▁▁                      │  grip
│  ▸ Search centres                      │  search
│  [ Nearest │ Pass rate │ Manual │ Auto]│  segmented control, flush
├────────────────────────────────────────┤
│  ┌──┐  Mill Hill               ╭───╮   │  88pt row
│  │MH│  1.2 mi away             │43%│   │  emblem · name · ring
│  └──┘  Closest to you          ╰───╯   │
├────────────────────────────────────────┤
│  ┌──┐  Hendon                  ╭───╮   │
│  │HN│  2.4 mi away             │39%│   │
│  └──┘                          ╰───╯   │
├────────────────────────────────────────┤
│  Further afield                        │  section header, unpinned
│  ┌──┐  Coventry                ╭───╮   │
│  │CO│  Warwickshire            │48%│   │  region, not distance
└────────────────────────────────────────┘
```

## The near set

Forty centres across fifteen regions cannot all be pins. At a zoom that fits Newcastle and Kent, the distance rings are meaningless and every London centre is one dot.

**The near set** is the centres within 30 miles of the driver, capped at 12 and floored at 8, ordered by distance. The map plots exactly this set and the camera fits it. Everything else is listed under a `Further afield` section header, keeps its colour and emblem, shows its region in place of a distance, and does not drive the camera when scrolled past.

The floor matters more than the cap: a learner in Cumbria has nothing within 30 miles, and an empty map with one ring is worse than a wide one with eight pins.

With no location fix there is no near set. The map fits all forty, the rings are not drawn, and every row sits under a single `All centres` header sorted by pass rate.

## Identity

`lib/centreIdentity.ts`, a pure module, no fetching:

```ts
export type CentreIdentity = { hue: string; tint: string; initials: string; seed: number };
export function assignIdentities(centres: Centre[]): Map<string, CentreIdentity>;
```

**Assignment is by position, not by hash.** The nth centre in the distance-sorted list takes the nth hue. A hash of `centre.id` was the artifact's implied mechanism and it is wrong here: twelve hues over forty centres collide constantly, and two identical pins side by side on the map is the one failure this design cannot absorb. Position-based assignment guarantees the near set — capped at 12, against a palette of 12 — never repeats a colour on the map.

The cost is that a centre's colour shifts if the driver's location changes enough to reorder the list. Accepted for this build: the colour's job is recognition between the pin and its row *in view*, and the list is only reordered by moving house. Persisting the first assignment per centre id is the follow-up if colour ever travels to other screens.

Assignment always runs on the distance-sorted list regardless of which sort the segmented control is showing, so re-sorting by pass rate never repaints anything. With no location fix there is no distance order, and assignment falls back to the order `listCentres()` already returns — `order("name")` — which is equally stable and does not depend on a fix arriving.

### Palette

Emerald is retired from identity duty. `colors.accent` (#059669) means *you* or *go*: the location dot, the distance rings, the buttons. Nothing else on this screen may be emerald.

Twelve hues, ordered so that no two adjacent assignments are neighbours on the wheel:

| # | Name | Hue | Tint | White | On tint | | # | Name | Hue | Tint | White | On tint |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | rose | `#BE123C` | `#FFF1F2` | 6.29 | 5.72 | | 7 | sky | `#0369A1` | `#F0F9FF` | 5.93 | 5.57 |
| 2 | teal | `#0F766E` | `#F0FDFA` | 5.47 | 5.25 | | 8 | orange | `#C2410C` | `#FFF7ED` | 5.18 | 4.88 |
| 3 | amber | `#A16207` | `#FFFBEB` | 4.92 | 4.75 | | 9 | violet | `#7C3AED` | `#F5F3FF` | 5.70 | 5.20 |
| 4 | indigo | `#4F46E5` | `#EEF2FF` | 6.29 | 5.62 | | 10 | cyan | `#0E7490` | `#ECFEFF` | 5.36 | 5.15 |
| 5 | lime | `#4D7C0F` | `#F7FEE7` | 4.99 | 4.82 | | 11 | fuchsia | `#A21CAF` | `#FDF4FF` | 6.32 | 5.89 |
| 6 | pink | `#BE185D` | `#FDF2F8` | 6.04 | 5.53 | | 12 | slate | `#475569` | `#F1F5F9` | 7.58 | 6.92 |

All twelve clear 4.5:1 on both gates. Rose, teal, orange and pink are a shade darker than the artifact's, which is what the gate is for — the artifact's teal and orange were at 3.7 and 3.6 against white.

**The exact hue values are set by a test, not by taste.** The monogram is white, 9.5pt, bold, sitting on the pin fill, so every hue must clear **4.5:1 against white**. `centreIdentity.test.ts` computes the contrast ratio for all twelve and fails the build on any that does not; the fix is to step that hue one shade darker (Tailwind 600 → 700 → 800). Amber, lime, cyan and sky are the ones expected to move.

Tints are used only as row backgrounds and emblem grounds behind hue-coloured text, so they carry the inverse obligation: hue on tint must clear 4.5:1. Same test.

### Emblem

`ui/CentreEmblem.tsx` — a rounded square in the centre's tint, three arcs whose radii and offsets come from `seed`, and the initials in the hue on top. `initials` splits on whitespace and `(`, so `Mill Hill (London)` gives `MH` and `Barnet` gives `B`.

Nothing about the emblem is hand-authored, so seeding a new centre never needs a design pass.

## The map

`ui/CentresMap.tsx`, built on `@rnmapbox/maps`, which the nav map already uses. This is an overview map, not a navigation map: no pitch, no traffic layers, none of the road-width expressions from `mapStyle.ts` — those exist to make roads legible at z17–19 and would make an overview map a slab of white.

- Style: `mapbox://styles/mapbox/navigation-day-v1`, the same base as the nav map, with a `BackgroundLayer` in `mapColors.land` beneath it. The background is what shows when tiles have not loaded, which is what offline looks like; a flat warm ground reads as deliberate where a grey void reads as broken.
- Rings at 3, 8 and 15 miles, drawn as **GeoJSON polygons**, not `circle-radius`. A pixel radius does not scale with zoom, so a pixel ring is a lie at every zoom but one. `lib/geo.ts` gains `ringPolygon(centre: LatLng, radiusM: number, segments = 64): GeoPolygon`, and `types/db.ts` gains `GeoPolygon = { type: "Polygon"; coordinates: [number, number][][] }` alongside the `GeoLineString` it already exports. The ring is stroked, not filled, so it is a `LineLayer` over a Polygon source with the first vertex repeated to close it.
- Pins are a `ShapeSource` over the near set, drawn as a `CircleLayer` in the centre's hue with a white 2pt stroke and its white monogram — the same colour and letters the row carries, which is the entire point of the mix.
- **The active centre is not one of them.** It is filtered out of those layers and drawn instead as a single `MarkerView` (`ui/ActiveCentreMarker.tsx`): a teardrop that pops, under a callout carrying its name, pass rate and distance. The reason is mechanical — a layer's `circleRadius` reading `["case", ["get","active"], …]` changes because the *source data* changed, not the property, and Mapbox's paint transitions only animate a property's own value, so the pin could only ever snap. A view can spring. Exactly one marker is ever mounted, so the cost scales with how many centres are active rather than how many exist.
- The callout's three facts all come off the row beneath it, so the map and the sheet cannot disagree and nothing extra is fetched.
- The driver is a 6pt emerald dot with a white ring and one slow pulse. It is the only looping animation on the screen.
- The recentre button refits the camera to the driver plus the near set.

## The binding

The sheet is `@gorhom/bottom-sheet` (already a dependency, already driving `mock.tsx` and `practice.tsx`), with a `BottomSheetFlatList` inside and **exactly one snap point, `["52%"]`**.

**The sheet does not move at all**, and making that true took three props, none of them a gorhom default. It is worth writing down why, because each closes a different route and the first attempt — one snap point — fixed none of them:

| Prop | What it closes |
|---|---|
| `enableContentPanningGesture={false}` | The important one. gorhom locks its scrollable unless the sheet sits at its highest detent, so the first scroll gesture on the list is spent hauling the sheet up before a row moves. `useScrollable`'s first rule is `if (!enableContentPanningGesture) return SCROLLABLE_STATUS.UNLOCKED` — disabling it both frees the list to scroll in place and removes the gesture that drags the sheet from its content. |
| `enableDynamicSizing={false}` | Defaults to **true**, and inserts a content-height detent alongside `snapPoints`. One snap point is therefore not one detent, which is why setting `["52%"]` alone changed nothing. |
| `enableHandlePanningGesture={false}` | The last route: dragging the top edge. |

`handleComponent={null}` follows from those — a grabber advertising a drag that cannot happen is a lie, so the handle is gone and its space is replaced by padding on the content.

The consequence to accept: the sheet cannot be pulled up to show more rows at once. About four are visible. That is the trade the premise demands — the map is half of this screen and must not be scrollable away.

Rows are a fixed 88pt with `getItemLayout` supplied, so the active index is `Math.round(offsetY / 88)` — no measurement, no layout pass. On change:

- the arrived-at pin pops — overshooting to 1.42 and settling at 1.24, never leaving the ground, so it does not cover the neighbours it sits between — and its callout fades in above it while holding still, because text that springs is text you cannot read,
- its row takes its tint as a background **and grows a 4pt rail in the centre's full hue down its left edge** — the tint cannot carry this alone, since all twelve were picked to sit behind hue-coloured text and are invisible against a white row,
- the camera moves to it.

Camera moves are the one thing here that can feel bad. Rules: fire only when the index changes, never on raw scroll; `animationDuration: 350`; ignore a change arriving less than 150ms after the last one, so a flung list settles before the map chases it; and do not move at all for rows under `Further afield`, which have no pin.

## Filters, honestly

The segmented control keeps its four options, but they stop pretending to be one thing:

- **Nearest** and **Pass rate** are sorts. Selecting one keeps whatever type filter is active.
- **Manual** and **Auto** are filters on `test_types`. Selecting one keeps the current sort, removes non-matching centres from the list *and their pins from the map*, and refits the camera to what is left.

This is a behaviour change, not just a visual one: today "Manual" throws away your sort.

**Nearest is disabled without a location fix**, greyed and non-selectable, with the sort defaulting to Pass rate. A control that silently does nothing is worse than one that says it cannot.

Search matches `name` and `region`, filters both list and pins, and matches across the whole forty — including centres outside the near set, which appear under `Further afield` with no pin.

## States

| State | What the screen does |
|---|---|
| Loading | Map mounts immediately with no pins; sheet shows five 88pt skeleton rows. |
| No location permission | No rings, no driver dot, no near set. Map fits all centres. Rows show region instead of distance. Sort defaults to Pass rate, Nearest disabled. A pill on the map: `Turn on location for distances`, tapping it re-requests. |
| Permission granted, no fix yet | Identical to having no permission until the fix lands, at which point distances and the near set appear. A row without a distance shows its region, which is information; `—` is not. |
| Offline or stale cache | Rows render from `cachedFetch`; the existing `OfflineBanner` sits between the map and the sheet. Map tiles will not load, so the background colour shows through with pins and rings still correctly placed — the spatial layout survives without a network. The layout does **not** swap to a list-only mode; a connection dropping in and out would thrash it. |
| Load failed, no cache | Map with no pins, and in the sheet a centred line — `Couldn't load centres.` — over a `Try again` button. The old copy said "pull down to retry"; a sheet whose list has been replaced by an error has nothing to pull. |
| Search matches nothing | `No centres match "brixton".` in the sheet, with the map keeping its last fit. |

## Files

| File | Change |
|---|---|
| `src/lib/centreIdentity.ts` | New. `assignIdentities`, the palette, `initials`. |
| `src/lib/__tests__/centreIdentity.test.ts` | New. Contrast gate, no-collision-in-near-set, initials. |
| `src/lib/geo.ts` | Add `ringPolygon`. |
| `src/lib/__tests__/geo.test.ts` | Add ring radius accuracy against `haversineM`. |
| `src/lib/centresView.ts` | New. Pure: near set selection, sort, filter, search, section split. |
| `src/lib/__tests__/centresView.test.ts` | New. |
| `src/ui/CentreEmblem.tsx` | New. |
| `src/ui/CentreRow.tsx` | New. 88pt row: emblem, name, distance-or-region, chip, pass-rate ring. |
| `src/ui/CentresMap.tsx` | New. Map, rings, pins, driver dot, recentre. |
| `app/(tabs)/index.tsx` | Rewritten around the map and sheet. |

All list-shaping logic lives in `centresView.ts` so the screen holds no rules, matching how `routeSummary.ts` serves the route cards.

## Motion

Entrance, on first load:

| At | What |
|---|---|
| 0ms | Map is already there. Rings appear in sequence outward from the driver — 3 miles, then 8, then 15 — 130ms apart, fading in over 600ms. |
| 420ms | Pins drop in nearest-first, 70ms apart, 580ms each, with a slight overshoot. |
| 300ms | Sheet rises to its 52% snap over 700ms. |
| 700ms | Rows spring up 20pt at 60ms stagger; each emblem's mark blooms in from −24° and its ring sweeps over 950ms. |
| 1400ms | The nearest centre becomes active. |

Rings appear rather than expand: growing a ring outward would mean regenerating its 64-vertex polygon every frame and re-uploading three shapes to the native map sixty times a second — the churn `NavMap`'s header comment warns against. Appearing one at a time keeps the outward read while leaving the geometry untouched.

They appear without a fade, and so do the pins. An earlier revision of this section claimed `lineOpacityTransition` would fade them natively; that was wrong. Mapbox's paint transitions animate a paint property's own *value* changing, and neither property here changes value: `lineOpacity` is the constant `0.28`, and `circleRadius` is a `["case", ...]` expression. What changes is the source data — a ring or a pin arriving in the `ShapeSource`'s `FeatureCollection` — and a feature appearing in a source is not a paint-property change, so nothing transitions. Rings and pins pop in.

Whether they need a real fade is a Task 10 question, to be answered on device rather than here: the honest options are a per-feature opacity driven off a `["get", ...]` property that the reveal steps, or accepting the pop. Both are cheap; neither is worth choosing without seeing it run.

Springs are `withSpring` from Reanimated, already used by `RouteCard`. Every entrance is skipped when `useReducedMotion()` is true; the pulse and the camera eases stay, since neither is decorative.

Touch: rows press to 96.5% scale with a light haptic, matching `RouteCard`.

## Testing

- `centreIdentity`: contrast gate on all twelve hues both ways; twelve distinct hues assigned to a twelve-centre near set; initials for `Mill Hill (London)`, `Barnet`, and a single-word name; wrap behaviour past twelve.
- `centresView`: near set respects the 30-mile rule, the cap and the floor; sort survives a type filter; search matches region; empty result is distinguishable from a failed load.
- `geo.ringPolygon`: every vertex is within 0.5% of the requested radius by `haversineM`; the ring closes.
- Screen, with `src/test/rnmapboxMock.tsx` and `src/test/locationMock.ts`: renders rows from cache; with permission denied, Nearest is disabled and the sort is Pass rate; typing filters rows; selecting Manual keeps the current sort.

## Deferred

- **Drive time.** Needs a batched matrix request and a cache. The right unit is minutes, not miles, but not at forty round trips.
- **Colour beyond this screen.** Scoped out deliberately: live with twelve hues on one screen before spending them on the centre detail, result and progress screens. Needs persisted assignment first.
- **The eight quarters of `pass_rate_history`.** Concept B's material. It belongs on a centre detail screen, which does not exist.
- **Logging practice drives to `user_progress`.** Still open from the routes redesign; the `2 routes driven` chip on a centre row can only count mock tests until it is done.

## Follow-ups left open after implementation

Triaged by the whole-branch review as not worth blocking the merge. Roughly in the order worth doing.

1. **Move `buildRows` and `rowAtOffset` into `centresView.ts`.** They are list-shaping rules and this document says the screen holds none. They are well tested where they are — through the screen — but they would be testable directly against a table of offsets, and the screen is now the third-largest file in the app.
2. **The camera refits on every search keystroke.** Search narrows the pins, and the framed set follows, so a fast typist can start a 600ms eased fit on each letter. Nothing debounces `query`. This is the pin-stagger problem of finding 3 moved to the camera, and it is a device question, not a test question.
3. **`src/ui/SegmentedControl.tsx` is orphaned.** The screen hand-rolls a two-axis control instead. Delete it or fold the two together — only `ui.test.tsx` keeps it alive.
4. **The entrance stagger is uncapped.** `FadeInDown.delay(index * 60)` over forty rows means a row scrolled into view at index 30 sits invisible for 1.8s. `Math.min(index, 7)` fixes it. Same latent issue in `RouteCard`, where the lists are short enough that it has never shown.
5. **`No centres match "".`** — the empty copy assumes a search term, but a filter alone can empty the list, and so can a database with no centres in it.
6. **Nothing reloads after the first failure.** Pull-to-refresh went with the old list and `load()` now runs on mount and from the error retry only, so a stale cache shows the banner with no way to clear it.
7. **Smaller:** the recentre button has no accessibility label; `CentreRow`'s label omits distance, so a list read aloud loses "how far"; `OfflineBanner` sits inside the sheet rather than between map and sheet; `getItemLayout` is still not supplied; `CentresMap` re-declares `ACCENT` instead of importing `colors.accent`; single-section headers never render, so `All centres` is dead copy; `fitBounds`' min-span floor pads latitude and longitude equally, which is not square in real distance at 51–55°N.

## Risks

1. **Twelve saturated pins is close to the limit.** It holds because the map bed is desaturated and every pin carries its monogram. Weakening either — a brighter base style, dropping the monogram at small sizes — turns the map into confetti.
2. **A map on the first tab.** It is the heaviest thing the app can mount and it is now mounted on launch. The app already cannot run in Expo Go, so there is no new build constraint, but cold-start time on the centres tab must be measured on device before this ships.
3. **The camera chasing a flung list.** The 150ms floor and the index-change gate are the mitigation; if it still feels seasick on device, the fallback is to move the camera only when scrolling stops.
4. **Colour identity shifting when the driver moves.** Accepted, and invisible to anyone who does not move house between sessions.
