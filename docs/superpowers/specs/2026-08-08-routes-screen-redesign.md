# Routes Screen Redesign — Design Spec

**Date:** 2026-08-08
**Status:** Approved 2026-08-08. Design artifact: https://claude.ai/code/artifact/a2ec3a7c-7de9-4e93-a5f8-e73d460ae4db
**Feature:** Rebuild the list of routes at a test centre so a learner can tell the routes apart, see what each one is like, and know which ones they have already been assessed on.

## Goal

`app/centre/[id].tsx` renders three routes as three identical white rectangles — name, `18 min · 6.2 km`, five unlabelled pips. The screen reads like an internal fleet dashboard rather than something a seventeen-year-old opens the night before their test.

Direction **A (Postcard)** from the artifact, with the history line from direction **B** folded into it. Each route becomes a card carrying its own map, described in plain English, with a visible way to start it and a line saying what you have already done on it.

Directions B (Trail) and C (Deck) are not being built. C becomes the right answer once a centre carries six or eight routes and the list needs a hierarchy; it is not that today.

## What is wrong now, precisely

1. The section header — `"Routes — swipe right to start, left to favourite"` — teaches a hidden gesture in a label, because no affordance for either gesture appears on the card.
2. Three rows are visually identical. Town loop and Main-road run are different drives that look the same.
3. The route's shape — the single thing that makes a route a route — appears only after a tap.
4. `PASS RATE` / `LAST 8 QUARTERS` uppercase micro-labels on a KPI tile with a sparkline. Dashboard furniture on a screen about going for a drive.
5. Difficulty is five dashes with no legend or word.
6. Nothing on the row knows your history with that route.
7. `Start practice` at the bottom always launches `routes[0]`, whichever route the learner was reading.

## The correction that changed the copy

The artifact showed a badge reading "Driven 3×" and a status line reading "best 4 faults". Neither is backed by the data:

- `saveProgress` is called from exactly one place — `app/route/[id]/result.tsx:23`, after a **mock test** finishes. Practice drives write nothing. "Driven" would be a lie for anyone who only practises.
- `mock_test_score` is `MockResult.score`, a 0–100 number (`src/lib/scoring/engine.ts`). It is not a fault count. Minors and majors are never persisted.

So the history line reports mock tests and a score:

| History | Badge on map | Line under name |
|---|---|---|
| No rows | `New` | *(omitted)* |
| 1 row | `Best 82` | `1 mock test · best score 82` |
| n rows | `Best 82` | `n mock tests · best score 82` |
| Rows, all scores null | `Attempted` | `n mock tests` |

Logging practice drives to `user_progress` is a real gap, but it is a data-model change and not part of a UI redesign. Noted as follow-up.

## The screen

```
Centres                                    ← back, unchanged
Mill Hill · 3 routes                        ← 26pt, centre name only, route count demoted
Around 20 minutes each.                     ← 13pt supporting line
[● 43.5% pass rate] [● 1 of 3 attempted]    ← two chips, replacing the KPI card

┌──────────────────────────────────────┐
│  ▁▂▃ route polyline on faint ground  │   88pt map strip, hazard pins, start dot
│                            [Best 82] │   badge, top right
├──────────────────────────────────────┤
│  Town loop                           │   16pt
│  Quiet streets, two roundabouts.     │   12.5pt, generated
│  1 mock test · best score 82         │   12pt, accent when present
│  18 min · 6.2 km                     │
│  ▬▬▭▭▭ Gentle            [▶ Start]   │   pips + word, pill
└──────────────────────────────────────┘
```

The pass-rate sparkline card is deleted from this screen. The number survives as a chip; the eight-quarter history is centre-level trivia that belongs on a centre screen, not above a list of routes.

The bottom `Start practice` button is deleted. Every card has its own Start, so there is no longer a button that silently picks route 1.

### Route name

Seeded names are `Route 1 · Town loop`. The card shows `Town loop` as the title and drops the `Route n` prefix — the position in the list already says which number it is. Names without the prefix render whole.

## Components

Each piece is separately testable, and the two pure modules carry the logic worth testing.

### `src/lib/routeSummary.ts` (new, pure)

- `difficultyWord(level: 1|2|3|4|5): string` — `Very gentle · Gentle · Steady · Testing · Demanding`.
- `plainSummary(route: Route): string` — one sentence from data already on the row. Counts `observation_zones` by `kind` (`roundabout` / `junction` / `pedestrian`) and reads the top limit from `speed_profile`. Numbers below ten spell out. Examples: `"Quiet streets, two roundabouts and a crossing."`, `"Two 40 mph stretches, three junctions to watch."` Falls back to `"A steady drive around the area."` when a route has neither zones nor profile.
- `progressLine(rows: ProgressEntry[]): string | null` and `progressBadge(rows: ProgressEntry[]): string` — the table above.
- `shortRouteName(name: string): string` — strips a leading `Route n · `.

No new fetch: `observation_zones` and `speed_profile` are already columns on `routes`, so `listRoutesByCentre` covers the whole card. Hazards stay on the detail screen.

### `src/lib/routeThumb.ts` (new, pure)

`thumbPath(coords: [number, number][], w: number, h: number, pad = 8)` returns `{ d, start, points }` — an SVG path string, the projected start point, and the projected vertices.

Equirectangular projection about the route's mid-latitude (the same approximation `projectOnSegment` in `src/lib/geo.ts` already relies on), scaled to fit the box on the tighter axis and centred on the other, so a route keeps its real proportions instead of being stretched to fill. Coordinates are `[lng, lat]` per `GeoLineString`. Long geometries are decimated to at most 120 points before projection — a 300-vertex path costs more than an 88pt strip can show.

`projectZones(zones, ...)` reuses the same transform so pins land on the line.

### `src/ui/RouteThumbnail.tsx` (new)

`react-native-svg`. A faint ground, the route path in `colors.accent`, amber dots at observation zones, a white-filled start dot. The path animates its `strokeDashoffset` from full length to zero over 900ms via `useAnimatedProps` on an animated `Path`; if that proves unreliable on device it degrades to a plain fade, which is a one-line change and no worse than today.

### `src/ui/RouteCard.tsx` (new)

Composes the thumbnail, the text block, `DifficultyPips`, and the Start pill. Takes `route`, `progress`, `favourite`, `onPress`, `onStart`, `onFavourite`. Holds no data logic — everything it renders comes from the two pure modules.

### `src/services/progressRepo.ts` (extend)

```ts
export function listProgressByCentre(routeIds: string[]): Promise<Record<string, ProgressEntry[]>>
```

One `select` with `.in("route_id", routeIds)`, grouped in memory. Wrapped in `cachedFetch` for the same offline behaviour as the rest of the screen, and resolving to `{}` on failure — a missing history line must never blank the routes list.

### `app/centre/[id].tsx` (rewrite the list)

Keeps: back link, `SafeAreaView`, `FlatList`, `ReanimatedSwipeable` gestures, the favourites calls, skeleton loading. Loses: the pass-rate `Card`, the `LineChart`, the instructional header, the bottom button.

## Motion

| Moment | Treatment |
|---|---|
| Cards enter | `FadeInDown.delay(i * 60).springify()`, Reanimated — the same idiom `app/route/[id]/result.tsx` already uses |
| Route line | Draws start → finish over 900ms, once per mount, after its card has landed |
| Card press | `active:scale-[0.97]`, light haptic — matching `Button` |
| Start pill | Deepens to `accent-pressed`, as `Button`'s `go` variant does |
| Favourite | Star springs 1 → 1.25 → 1; badge slides in |

All entrance animations are one-shot on mount. Nothing loops, nothing animates while the learner is reading.

## What stays

Emerald `#059669`, the `Card` shadow values, `DifficultyPips`, the swipe gestures, `SafeAreaView`/`FlatList` structure, and every existing service call. No new dependency: `react-native-svg` and `react-native-reanimated` are already in `package.json`.

## Testing

Pure modules get real tests, in the repo's existing locations:

- `src/lib/__tests__/routeSummary.test.ts` — difficulty words at all five levels; summaries for zone/profile combinations, plurals, and the empty fallback; every row of the progress table including all-null scores; name stripping with and without a prefix.
- `src/lib/__tests__/routeThumb.test.ts` — a known square of coordinates projects to expected box corners; aspect ratio is preserved rather than stretched; a 300-point path decimates to ≤120; a single-point or empty geometry returns an empty path instead of throwing.
- `src/ui/__tests__/routeCard.test.tsx` — renders name, summary, difficulty word and pip count; shows the history line when rows exist and omits it when they don't; `onStart` and `onFavourite` fire.

Manual verification is on a device against a seeded centre, because the thumbnail and the draw animation cannot be judged in Jest.

## Follow-ups, not in this work

- Log practice drives to `user_progress` so "driven" can mean what a learner thinks it means.
- Move the pass-rate history sparkline onto a centre screen where eight quarters of data belong.
- Direction C's collapsing hero, once centres carry more than about five routes.
