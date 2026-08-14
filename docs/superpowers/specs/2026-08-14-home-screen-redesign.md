# Home Screen Redesign — Design Spec

**Date:** 2026-08-14
**Status:** Draft, awaiting review.
Design artifacts: [three directions](https://claude.ai/code/artifact/d2e4a9db-4997-4955-82cc-2a395958e732) · [merged prototype](https://claude.ai/code/artifact/74c55c25-10dc-4dab-8fbb-311843aceb6e)
**Feature:** Rebuild `app/(tabs)/index.tsx` so Home leads with the one thing worth doing next, and keeps the record underneath as the evidence for it.

## Goal

Direction **Dashboard × Coach** from the artifact: Coach's diagnosis card on top, Dashboard's record card underneath, and the standalone `What keeps costing you` card deleted — its bars move inside the diagnosis, where they stop being a tally and become an argument.

Direction Launchpad is not being built. Its material — a current centre, a next route, a route drawing on Home — is the natural content for a Home screen that comes *after* there is a notion of "your centre", which nothing in the app has yet. It is the better screen and it is the wrong one to build first.

## What is wrong now, precisely

1. **Home has no action after your first test.** The `Find a test centre near me` button renders only when `summary.count === 0 && rows !== null && !failed`. Score once and the button is gone forever; the first tab becomes a screen you can only read.
2. **The diagnosis is computed and then abandoned.** `faultCounts` picks out the three faults that keep recurring, draws them, and says nothing about what to do. It is the only diagnostic information the app owns and the screen treats it as a footer.
3. **`FaultBars` gives the leader no more weight than the third row.** All one colour, by a deliberate decision recorded in its own header comment. Correct when the bars were a tally; wrong once the card has a subject.
4. **`finding()` carries the entire burden of interpretation in one sentence.** Eleven branches of tone — `That's your best yet.`, `it happens.` — under the name, and nothing anywhere else on the screen tells you what to do about any of them.
5. **The offline empty state is a dead screen.** With `failed === true` and no rows, the user gets `Your scores will appear here once you're back online.` and no button, because the button is gated on `!failed`. A new account whose first launch has no network sees a greeting and a sentence.
6. **`listMyProgress` is `select("*")` with no join,** so the screen knows the score of every test and the name of none of them.

## Four corrections to the artifact

The mockups showed facts `user_progress` does not store. Same rule as the centres and routes redesigns: the screen may not say what the app does not know.

**1. The `Pass` / `Fail` chips are deleted.** `ProgressEntry` is `{ id, user_id, route_id, completed_at, mock_test_score, mistakes, duration_seconds }`. There is no verdict column, and the verdict is **not derivable from the score**: `aggregate` caps a failed test at `FAILED_SCORE_CEILING` (55), and a pass with nine driving faults is `100 - 45` = 55 exactly. The two are indistinguishable at the one value where it matters most. The `Passed 4 of 5` stat goes with them.

**2. `Serious` and `2 driving faults` are deleted.** Severity exists on `Fault` at scoring time and is thrown away before persistence: `result.tsx` saves `mistakes: result.tags`, and `aggregate` builds `tags` as `[...new Set(...)]`. What survives a mock test is *a deduped set of fault names*. Nothing about how bad any of them was, and no count within a test.

This also settles what the bars actually measure. A tag appears at most once per row, so `faultCounts` counts **tests containing that fault**, never occurrences. Every string on this screen must be written that way — `Marked in 4 of your 5 mock tests`, never `7 faults`.

**3. `Route 3 · Mill Hill` requires a join, and gets one.** `listMyProgress` becomes:

```ts
.select("*, routes(name, centre_id, centres(name))")
```

One query, one round trip, still cached under `progress:mine`. `types/db.ts` gains a separate type rather than widening the one that gets inserted:

```ts
export type ProgressEntryWithRoute = ProgressEntry & {
  routes: { name: string; centre_id: string; centres: { name: string } | null } | null;
};
```

`ProgressEntry` is untouched, so `insertProgress` cannot accidentally be handed a joined row. Every function in `homeView.ts` keeps taking `ProgressEntry[]` — a joined row is a structural subtype, so the arithmetic needs no change and its tests need no fixtures.

A row whose join comes back null renders its date and score with no route line. That happens for a route deleted after the test was taken, and it must not blank the row.

**4. `Practise junctions at Mill Hill` becomes `Start a mock test`.** Two things it needs, neither of which exists: Home has no notion of your centre, and no route is tagged by what it exercises.

Worth recording because it is closer than it looks: `Route.observation_zones[].kind` is `roundabout | junction | pedestrian`, and `ZONE_TAGS` maps those to exactly the three observation fault names. So *for observation faults only*, "routes that exercise this" is already derivable with no new data. It covers three tags out of the sixteen `EXAMINER_CATEGORIES` plus `Speeding`, which is not enough to build a promise on. Deferred, with a note that a third of the work is done.

## The shape of the screen

```
┌────────────────────────────────────────┐
│ 9:41                          ▮▮▮ ▯    │
│                                        │
│  Good evening, Sumeet            (⚙)   │  greeting · ink
│  That's your best yet.                 │  finding() · emerald
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Work on this next                  │ │  card title
│ │ Junction observations              │ │  27pt — the claim
│ │ Marked in 4 of your 5 mock tests   │ │  the evidence, in words
│ │ — more than any other fault.       │ │
│ │                                    │ │
│ │ Junction observations ████████  4  │ │  lead · emerald
│ │ Use of mirrors        ██████    3  │ │  runner · muted
│ │ Roundabout observ.    ████      2  │ │  runner · muted
│ │                                    │ │
│ │ [        Start a mock test       ] │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ Your record          5 mock tests  │ │
│ │ 88 /100                     ▲ 8    │ │
│ │      ╱╲__╱‾                        │ │  sparkline, no axis
│ │ 55 on 14 Jul        88 on 12 Aug   │ │  both ends, named
│ ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤ │  ← the fold, ~707pt
│ │ ──────────────────────────────────  │ │
│ │  BEST        │  AVERAGE            │ │
│ │   88         │     72              │ │
│ │ ──────────────────────────────────  │ │
│ │  RECENT TESTS                      │ │
│ │  12 Aug                        88  │ │
│ │  Route 3 · Mill Hill        41 min │ │
│ │  5 Aug                         80  │ │
└────────────────────────────────────────┘
```

Two cards, not four. Coach's hairline sections survive *inside* the record card rather than as separate containers, so score, shape, stats and history read as one object with four registers.

### It scrolls, and that is fine

Measured at the real type sizes, the five-test state runs about **1,090pt against 707pt** of usable screen on a 6.1" iPhone (844 − 54 status − 83 tab bar). Roughly a screen and a half.

The fold lands on the hairline below the chart, at roughly 706pt of a 707pt screen — close enough to that divider to treat it as the design's own break. Above it: the greeting, the whole diagnosis card including its button, and the score with its chart and both end labels. Below it: the stat row and the history. The claim and the number are both complete before anything moves, and what is below the fold is reference rather than argument.

`app/(tabs)/index.tsx:88` is already a `ScrollView`. No new work.

The other states behave differently and correctly: **one test** overruns by roughly 115pt, and **no tests** fits with room to spare. The empty state never scrolls.

## The lead card

One slot, five shapes, one job: *tell me the single most useful thing I could do next*. It is the largest piece of new logic in this redesign, it is entirely pure, and it lives in `lib/homeView.ts` beside `finding()`, which does the smaller version of the same job.

```ts
export type NextStep =
  | { kind: "first" }
  | { kind: "baseline" }
  | { kind: "clean" }
  | { kind: "tied"; tags: string[] }
  | { kind: "fault"; tag: string; count: number; of: number; runners: FaultCount[] };

export function nextStep(summary: ScoreSummary, faults: FaultCount[]): NextStep;
```

### The rule

A fault may lead when **both** hold:

1. `summary.count >= 2`, and
2. `faults[0].count > (faults[1]?.count ?? 0)` — it strictly beats the runner-up.

The second condition is the artifact's rule. The first is not decoration, and it is the reason the rule is stated as two clauses instead of one: because `tags` is deduped per test, a single test tagged only `Speeding` produces `[{ tag: "Speeding", count: 1 }]`, which strictly beats a runner-up that does not exist. Without the floor, one test would diagnose a habit. `faultCounts` already sorts descending and breaks ties alphabetically, so both checks are one comparison against an array the screen already has.

### The five shapes

| Kind | When | Title / claim | Action |
|---|---|---|---|
| `first` | no tests | Start here / **Your first mock test** — "Drive a real examiner route at your centre and get marked the way the DL25 marks you. It sets the baseline everything after it is measured against." | `Find a test centre near me` |
| `baseline` | 1 test | Work on this next / **Take a second mock test** — "One test shows what went wrong that day. Two show what keeps going wrong — and that's the thing worth practising." Lists that test's tags, unranked, with no bars. | `Start a mock test` |
| `clean` | ≥1 test, no tags on any of them | Work on this next / **Nothing is costing you yet** — "No faults recorded across your mock tests. Keep going — a fault has to show up before it can be worked on." | `Start a mock test` |
| `tied` | ≥2 tests, no strict leader | Work on this next / **Two faults are level** — "Junction observations and Use of mirrors are each marked in 3 of your 5 tests. Another test breaks the tie." | `Start a mock test` |
| `fault` | the rule holds | Work on this next / **{tag}** — "Marked in 4 of your 5 mock tests — more than any other fault." Ranked bars beneath. | `Start a mock test` |

`clean` is not hypothetical: `result.tsx` already renders `A clean drive — no faults recorded`, and a learner who drives two clean mocks reaches this screen. Without the branch they would get a card built around `faults[0]` of an empty array.

All five route to `/centres`, because that is the only place Home can send anyone — see Deferred. Only the label differs: `first` says `Find a test centre near me`, the other four say `Start a mock test`.

### Ranking in FaultBars

`FaultBars` gains an optional `lead` treatment: row 0 keeps `colors.accent`, rows below drop to a muted `#A7C4B6`.

This contradicts the component's own header comment, which says all one colour on purpose, so the reasoning has to replace it rather than sit beside it. That comment defends against a *second meaning-carrying hue* — the centre identity palette lives a card away, and the same green must not mean "Goodmayes" in one row and "Speeding" in the next. De-saturating the runners adds no new hue and no new meaning. It says less about rows 2 and 3, not something different.

Colour is never the only encoding: the count stays at the end of every row, the lead tag is repeated verbatim as the card's headline three lines above, and the runners' labels also drop to `colors.ink3`. Someone who cannot see the difference between the two greens loses nothing.

`lead` is off by default, so any other caller of `FaultBars` is unaffected. There are none today; the prop exists so that the ranking is a property of this card rather than of the component.

## The record card

Everything in it is already computed by `scoreSummary`, or is one line of arithmetic on `summary.attempts`.

- **`88` with a muted `/100` tail**, and the delta as a mark — `▲ 8` in an emerald pill — rather than the sentence `↑ 6 on your last`. The sentence duplicated `finding()` two lines above it.
- **The sparkline is unchanged.** `ScoreSparkline` still draws no axis and the card still names both ends underneath, per the rule in that component's header. No gridlines are added. A chart that implies a scale it is not drawing is the one thing that file forbids, and a redesign is not a reason to overrule it.
- **The chart is dropped entirely at one test.** `sparkPoints` centres a lone point when `span === 0`, which is correct behaviour and an incorrect picture: a single dot in the middle of an empty box is not a chart. Below two attempts the card shows the number and the line `One score draws no line. Your second test starts the shape.`
- **Stat row: Best · Average**, two columns, not three. `best` comes straight off `ScoreSummary`; average is the mean of `attempts`, rounded. Both `tabular-nums`. The count is deliberately absent — the card header already says `5 mock tests`, and a third column repeating it would be the same fact twice in one card.
- **The stat row is gated with the chart**, at two or more attempts. `Best 55 · Average 55` under a single score says nothing that the score has not already said.
- **Recent tests: three rows**, then `All 5 tests` — which routes nowhere in this build and is therefore **not rendered until there is a Progress screen**. A link to nothing is worse than a list that stops.

Each row: date, route and centre from the join, score, and duration from `duration_seconds` via the existing `formatElapsed` in `lib/resultView.ts`. No verdict chip — see correction 1.

## States

| State | What the screen does |
|---|---|
| Loading | Greeting renders immediately from the session; both cards show skeletons at their real heights, as today. |
| No tests, online | `first` card with a working `Find a test centre near me`. Record card shows one line: `Nothing recorded yet. Your first score lands here, and the faults you pick up become the thing this screen tells you to work on.` Does not scroll. |
| No tests, load failed | Same `first` card, button included. This is the fix for the dead screen: the button navigates within the app and never needed the network. The record card's line becomes `Your scores will appear here once you're back online.` |
| One test | `baseline` card listing that test's tags unranked. Record card: score, no chart, one history row. |
| Tests, no faults on any | `clean` card. Record card in full. |
| Tests, tie at the top | `tied` card naming both tags. Record card in full. |
| Tests, clear leader | `fault` card with ranked bars. Record card in full. The screen scrolls. |
| Offline with cache | Identical to online. Every number comes from `cachedFetch`, and the join is cached with the rows. |
| A row whose route join is null | Date and score render; the route line is omitted rather than blanked. |

## Files

| File | Change |
|---|---|
| `src/types/db.ts` | Add `ProgressEntryWithRoute`. |
| `src/services/progressRepo.ts` | `listMyProgress` selects the nested route and centre; return type widens. |
| `src/services/__tests__/progressRepo.test.ts` | Cover the nested select and a null join. |
| `src/lib/homeView.ts` | Add `NextStep`, `nextStep`, and `averageScore`. |
| `src/lib/__tests__/homeView.test.ts` | Table-drive all five shapes and both clauses of the rule. |
| `src/ui/FaultBars.tsx` | Add `lead`; replace the one-colour comment with the ranking reasoning. |
| `src/ui/__tests__/faultBars.test.tsx` | New. Lead colour, runner colour, `lead` off by default. |
| `src/ui/NextStepCard.tsx` | New. Renders a `NextStep`. Holds the copy for all five shapes. |
| `src/ui/__tests__/nextStepCard.test.tsx` | New. One assertion per shape. |
| `src/ui/RecordCard.tsx` | New. Score, chart-or-line, stat row, recent tests. |
| `src/ui/__tests__/recordCard.test.tsx` | New. Chart present at two attempts, absent at one; null join. |
| `app/(tabs)/index.tsx` | Rewritten around the two cards. Holds no rules. |
| `src/ui/__tests__/homeScreen.test.tsx` | Rewritten against the state table. |

The screen keeps no logic, matching how `centresView.ts` serves the centres screen and `routeSummary.ts` the route cards. `homeView.ts` goes from 131 to roughly 210 lines and stays one module — it is still one screen's arithmetic, and splitting `nextStep` out would separate it from the `ScoreSummary` and `FaultCount` types it is written against.

## Motion

Nothing new. `enterFrom` already staggers the existing cards, `FaultBars` already grows its fills from the left after `FIRST_DELAY_MS`, and `ScoreSparkline` already draws its line before washing the area in.

Two notes:

- The entrance still stages three elements — header, lead card, record card — where today it stages header, score card, faults card. `enterFrom(0..2)` is unchanged, and the optional CTA that used to take index 2 is gone, so no index is ever skipped.
- The bar fill delay stays at 520ms. It now runs beneath a headline that has already named the leading fault, so the bars confirm a claim the reader is holding rather than announcing one. That is the argument for leaving it late rather than speeding it up.

`useReducedMotion` handling is inherited from the existing components and unchanged.

## Testing

- **`nextStep`** — table-driven over: zero tests; one test with one tag; one test with three tags; two tests, clear leader; two tests, exact tie; five tests with a leader; any number of tests with no tags at all. Both clauses of the rule get a case that fails on that clause alone.
- **`averageScore`** — rounds half up; ignores practice rows with a null `mock_test_score`, exactly as `scoreSummary` does.
- **`aggregate`** — an existing behaviour worth pinning with a test now that copy depends on it: `tags` comes back deduped, so a fault marked three times in one drive reaches `user_progress` once. The invariant lives there and not in `faultCounts`, which counts every entry in `mistakes` it is given — the copy `marked in 4 of your 5 mock tests` is only true because the rows arrive already deduped.
- **`FaultBars`** — with `lead`, row 0 is `colors.accent` and rows 1+ are the muted green; without it, every row is `colors.accent`.
- **`NextStepCard`** — one assertion per shape, asserting the headline and the button label. The `fault` case asserts the sentence names the same tag as the headline.
- **`RecordCard`** — `spark` renders at two attempts and does not at one; `spark-empty` never appears; a row with `routes: null` renders its score and omits the route line.
- **`progressRepo`** — the select string contains the nested join; a row with a null join deserialises.
- **Screen** — the state table above, driven through the existing mocks. Specifically: the failed-load empty state renders a button, which is the regression this redesign fixes.

## Deferred

- **The verdict.** `Pass` / `Fail` chips and a `Passed n of m` stat need `user_progress` to persist it. The right migration is `minors integer` and `majors integer` rather than a `passed boolean` — `aggregate` already computes both, `passed` is derivable from them, and the result screen gains real material for free. Blocked on a migration and a change to what `result.tsx` saves.
- **Fault-targeted practice.** `Practise junctions at Mill Hill` needs routes tagged by what they exercise. `observation_zones[].kind` already covers the three observation tags; the sixteen `EXAMINER_CATEGORIES` and `Speeding` have nothing. Needs a tagging pass over `routes` before the button can promise anything.
- **A Progress screen.** Until one exists, `All 5 tests` is not rendered and Home is where history stops.
- **Your centre.** Every action on this screen routes to `/centres` because Home does not know where you drive. This is also the whole of what direction Launchpad needs, and it should be built once, for both.
- **Practice drives are still not written to `user_progress`.** Open since the routes redesign. Until it is done, `Your record` is a record of mock tests only, which is why the card and every count in it says `mock tests` rather than `drives`.

## Risks

1. **Five shapes in one slot is a lot of logic for one card.** It is the honest cost of a screen that claims to know what you should do next, and it is the thing most likely to be wrong on contact. Mitigated by keeping every branch pure and table-tested, so a change of mind about the rule is a change to one function and its table.
2. **The diagnosis is only as good as the tags.** `faultCounts` measures how many *tests* a fault appeared in, and a learner who takes five tests on the same route will be diagnosed with whatever that route punishes. The copy says `marked in 4 of your 5 mock tests` rather than anything causal, which is true but does not make the underlying sample any better. Route diversity is not something this screen can fix.
3. **De-saturating the runners weakens the bars as a comparison.** Two of the three are now quiet, which is the point, and it is a real loss for anyone reading the card as a tally rather than an argument. The counts stay for exactly that reader.
4. **`Start a mock test` on four of five shapes is a weak action** and the card knows it. It is the most visible consequence of not having a centre on Home, and it is the strongest argument for building that next.
