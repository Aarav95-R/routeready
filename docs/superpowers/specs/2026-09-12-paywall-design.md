# The paywall — design

**Status:** approved 2026-09-12
**Design artifact:** https://claude.ai/code/artifact/441d0aa1-83a8-41d4-9038-f8b54652a5c9

## The problem

RouteReady has no way to take money. There is no product, no entitlement, no
purchase path — a grep for `premium`, `subscri`, `paywall`, `purchase`,
`revenuecat` or `stripe` across `src`, `app`, `supabase` and `scripts` returns
nothing but a `LocationSubscription` and an auth listener.

The app is otherwise finished enough to charge for: ten routes at every centre,
each drivable as practice or as a marked mock test, with an examiner, a mark
sheet and a verdict behind it.

## The change

One gate, in one place: **every test centre gives one route away, and a
subscription opens the other nine.**

Nothing else is locked. Centres, pass rates, the map, the quiz, the manoeuvres,
favourites, and the learner's own record all stay free forever.

That single sentence is the entire product decision, and it is worth defending
as one. A paywall assembled from five smaller gates — a mock-test cap here, a
quiz limit there — costs five times as much to build, five times as much to
explain, and reads as meanness at every one of the five. This costs one
boolean and one policy.

## Decisions

| | Decision | Why |
|---|---|---|
| Price | £3/week, £9/month | £3/week is £13/month; £9/month is £2.08/week. Weekly exists to make monthly obvious, and does that arithmetic in the reader's head. It also earns its place honestly: a test on Thursday genuinely needs six days, and £9 would be the wrong answer to that. |
| Free unit | one route per centre | Reads as an offer rather than a restriction. In practice almost everyone cares about one centre, so it is one free route — but saying it the generous way costs nothing. |
| Free route is complete | practice *and* marked mock test | The examiner is the best thing in the app. Gating it means nobody ever experiences the thing they are being asked to pay for. Let the product sell itself. |
| Which route is free | a hand-picked `is_free` column | The free route is the demo. Picking it by sort order makes that demo an alphabetical accident; a mid-difficulty representative route argues better. |
| Rails | RevenueCat | Receipt validation, renewals, billing retry, refunds and cross-device restore. Free below $2.5k/month. A weekly product is 52 renewal events a year to get right by hand. |
| Free trial | none | At £3/week the weekly product already *is* the trial, and it collects a card rather than a cancellation reminder. Revisit if conversion disappoints; starting without one keeps phase 4 far simpler. |
| Annual plan | none | Nobody learns to drive for a year. An annual tier on a product with a natural six-to-ten-week life is revenue taken from people who will not use it, and it invites refund requests. |

## What is gated, exactly

Not the route. **The drivable part of the route.**

A locked card keeps its drawing. The thumbnail is the argument — nine real,
distinct routes around the centre someone is about to be tested at — and
withholding it turns a shop window into a shuttered one. You cannot drive from
a 150-pixel squiggle, so the sell and the security do not conflict.

So `geometry` stays public, alongside name, difficulty, distance and duration:
everything `RouteCard` draws. What the server withholds is `steps`,
`speed_profile` and the route's `hazards` — the turn-by-turn instructions, the
speed envelope, and the hazard set the examiner scores against.

**`observation_zones` stays public, deliberately.** It looks like coaching
content and half of it is, but it feeds the card as well as the drive:
`RouteThumbnail` draws a pin per zone, and `plainSummary()` tallies zone kinds
to write the card's second line — `routeSummary.ts:53`. Gating it would empty
the exact sentence the locked card exists to sell with ("dual carriageway, box
junction") and blank the pins, while withholding nothing you could drive from.

## Shape

**The gate is Postgres, not the client.** `listRoutesByCentre` and `getRoute`
both call `select("*")` today, so a gate built only in the UI would leave the
full turn-by-turn payload sitting in the response of an unlocked query —
readable by anyone with a proxy, and cached to disk besides. The client
*reflects* the entitlement; it never decides it.

**Row-level security is row-level**, which is the whole reason for the schema
change below. The fields that must be withheld cannot be withheld as columns,
so they have to become rows.

### Data

Three changes, in one migration.

`routes.is_free boolean not null default false` — one true per centre, chosen
in the seed script rather than derived.

`route_details` — a new table keyed by `route_id`, holding `steps` and
`speed_profile`, moved off `routes` and backfilled. Its policy admits a row
when the route is free or the caller is subscribed. The `hazards` policy
changes from `using (true)` to the same condition. `observation_zones` stays on
`routes`, for the reason above.

`entitlements` — one row per account: `user_id` (primary key, cascading from
`auth.users`), `status` in `active | lapsed`, `product`, `renews_at`,
`updated_at`. Written only by the webhook's service role; readable only by its
owner. An account with no row has never subscribed, which is the same as
`lapsed` and needs no row to say so.

**Grace and billing-retry map to `active`.** RevenueCat distinguishes them;
this table does not, because the only question it exists to answer is whether
to serve the route, and during grace the answer is yes. Two statuses keep the
policy a boolean.

A partial unique index on `(centre_id) where is_free` stops a centre having
*two* free routes. It cannot stop a centre having *none* — which is the worse
failure, since that centre silently becomes fully paywalled — so the seed
script asserts a free route per centre before it pushes, and a test covers the
same invariant against the live schema.

`is_subscribed()` — a `security definer` SQL helper both policies call, so the
condition is written once.

### Purchase path

The app talks to RevenueCat, RevenueCat talks to StoreKit, and a RevenueCat
webhook writes the `entitlements` row through an Edge Function. The app never
writes its own entitlement — that is the property that makes the whole thing
trustworthy.

**RevenueCat's `appUserID` is the Supabase user id.** This is the join, and
getting it wrong makes the webhook unable to find whose row to write.
`Purchases.logIn(userId)` on session open, `Purchases.logOut()` on sign-out.
The root layout already guarantees a session exists before any tab renders, so
there is no anonymous purchase case to handle.

### Client state

`src/stores/entitlement.ts`, a zustand store beside `sessionStore`, holding
`active | lapsed | unknown` and mirroring RevenueCat's cached customer info to
AsyncStorage.

`unknown` resolves from that mirror. With no mirror at all — a fresh install
that has never reached the network — it resolves to `lapsed`, which is both
correct and harmless: such a device has no cached route details to unlock
either.

`src/lib/gating.ts` holds the rules as pure functions, so they are testable
without mounting anything, matching how `authRoute`, `homeView` and
`routeSummary` are already factored. The screens use one selector:
`canDrive(route)`.

## Three failures this must not have

These came out of reading the existing services. Each is cheap now and
expensive in TestFlight.

### A drive must never be revoked underneath someone

A mock test runs for twenty-odd minutes with the screen awake and location
streaming. A renewal that fails mid-drive, or a token refresh that returns
lapsed while someone is on a roundabout being marked, must not bin the run.

**Entitlement is read once, when a drive starts, and never re-checked until it
ends.** Losing a few pence to a grace case is nothing against destroying a
learner's mock test. The result still writes through the existing progress
outbox either way.

### Cached routes must not survive a lapse

`cachedFetch` writes every route list to AsyncStorage under
`cache:routes:<centreId>`, and `clearUserCache()` deliberately sweeps only
`cache:progress:`. Its comment explains why: routes "belong to the country, not
the person."

That reasoning is correct today and **stops being correct the moment routes are
entitlement-scoped.** Without a change: subscribe, cache nine routes, cancel,
and drive them offline indefinitely.

So a sweep of the `cache:route` prefix — catching both `cache:routes:<centreId>`
and `cache:route:<routeId>` — fires when status goes `active → lapsed`. It is a
separate function from `clearUserCache`, matching how `clearOutbox` is separate:
sign-out wants one thing, a lapse wants another, and a flag argument would put
that decision at the call site of a function whose job is to not need one.

The comment must be rewritten rather than left — it encodes an assumption this
feature invalidates, and leaving it will mislead whoever reads it next.

### Offline must not lock a paying learner out

The app is built to work without signal and a test centre car park is a
plausible place to have none. The mirror is what carries someone through it,
and it is honoured for as long as the device is offline. The exposure — staying
in airplane mode forever to keep access — still requires cached details, and
the sweep closes the online case.

## Where the sheet appears

Ranked by intent already shown. The first two carry the conversion; the rest
exist so nobody hits a dead end.

1. **Tapping a locked route card.** A specific route at a specific centre. The
   sheet names it.
2. **The unlock panel under the route list.** Browsing with intent. Same sheet.
3. **After a mock verdict on the free route.** The result's next step usually
   names a locked route. Worth doing gently — this lands on someone who has
   just been marked down.
4. **Home's next-step card.** `nextStep()` already computes what to practise
   from the fault record. When its answer is locked, the card says so rather
   than sending them at a wall.
5. **Settings.** Status, renewal date, manage, restore. Not a sales surface.

**Never** during a drive, on launch, over the quiz or manoeuvres, or more than
once per screen visit.

The sheet is a `@gorhom/bottom-sheet`, already used by the examiner panel — a
familiar object rather than a new kind of screen. It is dismissible at any
time, with no timed delay on the close control.

### Copy and colour

The headline names the centre: "Nine more routes at Wood Green" beats "Upgrade
to Premium" because it describes something the person was already trying to do.

The interview's `testWindow`, captured on card 2 of sign-up, pre-selects the
price and writes the supporting line. Somebody testing inside two weeks is
shown weekly first.

Green stays the route-and-action colour — the CTA and the free route's drawing,
nowhere else on the sheet. Clay carries the personal line about the test date.
A locked state is neutral stone, never `danger`: a locked route is not an
error.

## App Store obligations

- Restore purchases reachable without an account action — on the sheet and in
  Settings.
- Prices read from StoreKit, never the £3 and £9 hard-coded. Storefronts differ.
- Terms and Privacy linked from the sheet. Both already exist in `docs/` and on
  the site.
- Renewal terms beside the button: cost, frequency, that it auto-renews, how to
  stop.
- Account deletion keeps working with an active subscription, and says plainly
  that deleting does not cancel billing — Apple owns that, and only the App
  Store can end it.

## Deliberately not built

No trial, no annual tier, no lifetime unlock, no promo codes, no per-centre
purchase, no web checkout, no paywall A/B framework, and no analytics beyond
what RevenueCat's dashboard already reports. Each is a real feature with a real
argument behind it, and not one of them is needed to take the first pound.

## Testing

The gating rules are pure functions and get unit tests: free route, locked
route, active, lapsed, unknown-with-mirror, unknown-without.

The store gets tests against a faked RevenueCat — status transitions, the
mirror, and the cache sweep firing exactly on `active → lapsed`.

The policies get SQL tests: an unsubscribed caller reads a free route's details
and is refused a locked one; a subscribed caller reads both.

The sheet and the locked card are verified on the simulator, not in Jest —
consistent with what this project already knows about layout and sheet
position. Purchase, restore, renewal, cancellation and lapse are exercised in
the StoreKit sandbox, including restore onto a second device.
