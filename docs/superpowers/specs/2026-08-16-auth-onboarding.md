# Sign-in Redesign and the Sign-up Interview — Design Spec

**Date:** 2026-08-16
**Status:** Built. Revised 2026-08-16 after the first build was reverted; see *Revision* below.

## Revision — what the built version does differently

The first build of this spec was reverted the same day: card 4 crashed the app
and the cause was not found. It was rebuilt against a warm visual direction
([artifact](https://claude.ai/code/artifact/e6a68686-930a-4000-b87e-83f6349f61ca)),
with five changes to what is written below.

**1. Figtree replaces Inter, and the face travels with the type scale.**
React Native picks a static font file by family name and ignores `fontWeight`
alongside it, so `FACES` in `src/ui/type.ts` names the file per weight and each
of the seven styles carries its own `fontFamily`. Every screen already
spreading those styles got the face without a call-site change. `@expo-google-fonts/inter`
is gone.

**2. The accent moved, and its four copies were deleted.** `#059669` → `#1A875E`
in `theme.ts` and `tailwind.config.js`. `mapStyle.ts`, `CentresMap.tsx`,
`DriveModeRow.tsx` and `app/(tabs)/_layout.tsx` each held their own literal;
all four now read the token, and `mapStyle.test.ts` asserts
`mapColors.routeCore === colors.accent` so a fifth copy cannot appear quietly.
`routeCasing` follows to `#115B41`.

**3. Clay is a new role, and it means the person.** `clay` / `clayTint` dress
the interview's progress bar, its chosen answers and its confirmation tick.
Green keeps every meaning it had — go, route, correct, primary action — so a
warm accent never appears on a live drive.

**4. `test_window` replaces `test_date`, and card 2 loses its calendar.** Four
windows (`two_weeks` / `this_month` / `later` / `not_booked`), so
`@react-native-community/datetimepicker` is not needed: no new dependency, no
Expo Go risk, and none of the ~6,000 lines of lockfile churn its install caused
last time. Home gets a coarser countdown. This resolves correction 2 below by
taking its documented fallback.

**5. Two motions in the table below were not built, and one was.** See
*Motion, as built*.

## Motion, as built

Three entries were dropped, each for a stated reason rather than for time.

| Entry below | As built | Why |
|---|---|---|
| Card exit (`stepExit`) | **Not built.** The incoming card carries the whole transition. | An exiting layout animation on a re-keyed child, wrapping children that are themselves entering, is the structure the crashed build used on card 4. Nothing here nests layout animations or exits. |
| Per-row stagger inside a card | **Not built.** `QuestionCard` has no `Animated` in it at all. | The card is already travelling; staggering its rows is two motions describing one event — and it is the other half of the nesting above. |
| Strength segment fill and colour crossfade | **Not built.** The meter is static. | It changes on nearly every keystroke. The explicit `useReducedMotion()` carve-out the spec had to write for it was the tell that it was the busiest thing on the screen. |

`stepForward()` and `stepBack()` are built as specified, and the progress bar
still animates with an explicit `useReducedMotion()` check.

**The crash is still undiagnosed.** It was native-only — the reverted build's
own tests drove card 4 and passed — so it cannot be reproduced in Jest, and no
device was available. The rebuild removes the whole class of structure it
occurred in rather than claiming to have fixed a specific line. Card 4 is the
first thing to exercise on a device.

---

**Original spec follows.**
**Design artifact:** [live prototype](https://claude.ai/code/artifact/19e08a16-f60f-4560-8fa0-fd860979b9a1) (both phones run the real timing constants; local copy at `docs/design/2026-08-16-auth-onboarding.html`)
**Feature:** Re-dress `app/(auth)/sign-in.tsx` onto the grouped-inset language, wire the auth paths that were never finished, and turn `app/(auth)/sign-up.tsx` into a five-card interview whose answers reach `user_metadata` in a single `signUp()` call.

## Goal

Two things, and they share a screen stack rather than a mechanism.

**Sign-in becomes the app's first lesson in its own visual language.** It is currently the only screen a new user sees before the tabs, and it is dressed in the pre-redesign idiom — `bg-surface`, `border-slate-200`, ad-hoc `text-[26px]` and `text-[13px]`, a centred stack of loose fields. Home now speaks grouped-inset. The first screen should too.

**Sign-up becomes an interview, because the app has a cold-start problem it cannot otherwise solve.** `NextStepCard` is computed from recorded drives. A brand-new account has none, so the first screen of the app has nothing to say to the person most in need of being told something. Four questions asked before the account exists give it four things to say.

## What is wrong now, precisely

Auth works — `sessionStore` is wired to Supabase and signing in succeeds. These are the gaps between that and a screen that behaves like a shipped app. Nine are on the two screens; one is in a path that was never built at all.

1. **`resetPasswordForEmail` is not wired anywhere.** There is no forgot-password link, no screen, no store action. An account whose password was mistyped at sign-up is unrecoverable in-app, and the only workaround — the magic link — is presented as a convenience rather than a rescue. This is the most serious defect on the screen and the one least visible in a mockup.

2. **`KeyboardAvoidingView behavior="padding"` is hardcoded** (`sign-in.tsx:19`, `sign-up.tsx:21`). On Android `padding` is the wrong behaviour; the keyboard covers the submit button on both screens. It needs `Platform.select({ ios: "padding", android: "height" })`.

3. **No `textContentType` or `autoComplete` on any field.** iOS therefore offers neither Keychain autofill on sign-in nor a generated strong password on sign-up. This is a two-attribute fix that changes how the screen feels more than any amount of restyling.

4. **Raw Supabase strings reach the user.** `signIn` returns `error.message` verbatim (`sessionStore.ts:39`) and the screen renders it (`sign-in.tsx:41`). Users see `Invalid login credentials`, `User already registered`, `Email rate limit exceeded` — accurate, and written for whoever is reading the logs.

5. **Validation fires after the tap** (`sign-up.tsx:54-55`). You learn the passwords do not match by being told off for submitting. The password rule — eight characters — is never stated before it is enforced.

6. **No way to see the password being typed.** Both screens are `secureTextEntry` with no reveal.

7. **After sign-up, the notice lands under a still-filled form** (`sign-up.tsx:59`). `Account created — check your email to confirm, then sign in.` appears in the same slot the error uses, under four fields still holding the password. It reads as a failure.

8. **`notice` is never cleared.** `signIn`'s handler clears `error` and not `notice` (`sign-in.tsx:39`); the magic-link handler clears `error` and not `notice` (`sign-in.tsx:45`). Send a link, then fail a sign-in, and the success message sits under the failure.

9. **No `returnKeyType` chaining.** Return dismisses the keyboard instead of advancing to the next field. On a four-field sign-up that is four dismissals.

10. **Android hardware back has nothing to catch it.** Today it exits `(auth)/sign-up` harmlessly. Once sign-up holds four answers, an uncaught back press discards all of them.

## Three corrections to the artifact

Same rule the centres and Home redesigns worked under: **the screen may not ask what the app cannot act on, and may not say what the app does not know.**

**1. The weak-spots card offers four options, not six.**

The artifact's first draft offered Roundabouts, Parallel parking, Bay parking, Dual carriageways, Junctions, Reversing. Four of those six are answers the app has no way to use.

`hazards.type` carries exactly four values — `roundabout`, `zebra`, `narrow`, `junction` (`supabase/schema.sql:31`, and `Hazard["type"]` in `src/types/db.ts:27` is the union that makes it a contract). That is the only per-route difficulty signal in the schema. `manoeuvres` is a flat reference table of `{ name, steps, tips }` with **no route relation at all**, so "parallel parking" cannot sort a single route. There is no dual-carriageway marker anywhere.

The card therefore offers the four hazard types, in learners' words rather than the column's:

| Stored | Shown |
|---|---|
| `roundabout` | Roundabouts — *Mini, multi-lane and spiral* |
| `junction` | Junctions and priority — *Emerging, and who goes first* |
| `narrow` | Narrow roads — *Meeting traffic, parked cars* |
| `zebra` | Pedestrian crossings — *Zebras and schools* |

Adding parking means adding a route ↔ manoeuvre relation first. That is its own change and it is not in this one.

**2. The test-date card needs a dependency the project does not have.**

The artifact draws a settled date as a list row. Choosing one needs a picker, and `@react-native-community/datetimepicker` is not in `package.json`. There is no way to build this card honestly without either adding it or changing the question.

**Recommendation: add it** via `npx expo install @react-native-community/datetimepicker`, `display="inline"` on iOS and the default spinner on Android, with `minimumDate` today and `maximumDate` a year out. It is an Expo-supported module and should run in Expo Go, but **that must be confirmed on device before the rest of the card is built** — the project is on Expo Go today and a dev build is a later, separate decision (see `docs/dev-build.md`).

If it does not run in Expo Go, the fallback is to keep the question and drop the precision: `In the next two weeks` / `This month` / `Next month or later` / `Not booked`, stored as `test_window` instead of `test_date`. Home gets a coarser countdown and nothing else changes. Do not silently ship the fallback — it is a worse answer and the difference should be a decision, not a discovery.

**3. Nothing on the flow oscillates, and the shake is cut.**

A shake on a failed sign-in was prototyped and rejected. `src/ui/motion.ts` is built on one rule — *"nothing overshoots, so nothing settles, so nothing jiggles"* — and a shake is pure oscillation. One exception to a one-rule motion language is how it stops being one.

What the shake was for is real, though: a failure should land in the body, not only the eye. That job goes to `Haptics.notificationAsync(NotificationFeedbackType.Error)` — a channel iOS provides for exactly this, and one `expo-haptics` already gives the project (`Button.tsx:22`, `DriveModeRow.tsx:69`). The failure is felt; nothing on screen moves back and forth to say so.

## The shape of the flow

```
(auth)/sign-in ──"Create an account"──▶ (auth)/sign-up
     │                                        │
     ├──"Forgot your password?"──▶ (auth)/reset
     │                                   │
     └──"Email me a sign-in link"────────┴──▶ a sent-confirmation state
```

`sign-up` is **one route holding five cards**, not five routes.

The answers must survive until a single `signUp()` call, so the state has to live above the steps regardless. Route-per-step would only force that state into a store or into params and buy nothing, while churning the router five times per sign-up and surrendering control of the transition choreography. One component is also far cheaper to test than five routes. The cost is that Android hardware back needs an explicit `BackHandler` — defect 10 above, now load-bearing.

### Why the questions come before the account

Supabase email confirmation is on: `signUp()` returns **no session**. There is no signed-in user to write a profile to until the learner opens their inbox and returns in a later session. Anything asked "after the account" would have to survive that round trip in local storage and be replayed on first sign-in.

Asking first removes the problem rather than solving it. One call carries everything:

```ts
supabase.auth.signUp({ email, password, options: { data: toMetadata(answers, name) } })
```

`test_centres` grants `select` to `anon` (`supabase/schema.sql:73`), so the centre picker works with no session. And `cachedFetch("centres", …)` is not user-scoped — `clearUserCache` only clears `cache:progress:` (`cache.ts:23`) — so a device that has ever loaded the centre list shows it instantly here, offline included.

### The five cards

| # | Asks | Control | Gate to advance |
|---|---|---|---|
| 1 | Where are you testing? | Searchable list of centres | A centre is chosen |
| 2 | Have you booked it? | Two choices; *yes* reveals a date picker | A choice, plus a date if *yes* |
| 3 | How much have you driven? | Three choices | A choice |
| 4 | What trips you up? | Four choices, up to two | At least one |
| 5 | Your account | Name, email, password twice, live strength | Email valid, 8+ chars, both match |

Cards 1–3 advance themselves ~280ms after the selection settles. Cards 4 and 5 wait for a button, because a multi-select that jumped on first tap could never take a second.

Only the name is optional, and it stays optional for the reason already recorded in `sign-up.tsx:29-31`: left blank, the greeting is the time of day.

## Password strength

A pure module, `src/lib/passwordStrength.ts`, scoring the string and nothing else:

```ts
export type Level = "empty" | "short" | "weak" | "fair" | "good" | "strong";
export type Strength = { level: Level; segments: 0 | 1 | 2 | 3 | 4; message: string };
export function passwordStrength(password: string): Strength;
```

Under 8 characters is `short` and counts down (`3 more characters`). At 8 it becomes `weak` and earns a point for each of: twelve characters or more, mixed case, a digit, a symbol. One point or none is `weak`, two `fair`, three `good`, four `strong`.

Colour comes from the existing palette and introduces no new meaning: `danger` at `short`, `warning` at `weak`/`fair`, `accent` at `good`/`strong`.

**Only the eight-character floor disables the button.** Everything above it is advice. A meter that refuses to let you continue is a meter people defeat, and what they defeat it with is `Password1!` — which scores four segments and is on every breach list there is. The bar informs; it does not police.

The confirm field is revealed once the password clears eight characters rather than sitting there empty, and a tick fades in when the two match. **Mismatch says nothing until the field is blurred** — telling someone they are wrong halfway through typing a word is noise.

## Data

Four keys in `user_metadata`, beside the `full_name` already there. Same argument as `sessionStore.ts:41-43`: a table would need a row, a policy and a migration to hold four scalars that belong to the account.

```ts
{
  full_name:      string,   // existing; "" when not given
  home_centre_id: string,   // uuid of a test_centres row
  test_date:      string | null,   // ISO yyyy-mm-dd, null when not booked
  experience:     "starting" | "progressing" | "ready",
  focus:          ("roundabout" | "junction" | "narrow" | "zebra")[]  // 1–2
}
```

`user_metadata` is free-form and Supabase returns whatever was written, including nothing at all for every account made before this shipped. Every reader must narrow, exactly as `selectFullName` already does (`sessionStore.ts:24-27`). Selectors live beside it and are part of this change; the **screens that consume them are not** (see Deferred).

`src/lib/onboarding.ts` holds the questions as data rather than JSX — that is what makes the copy, the order and the gating testable without rendering anything, and it is why a fifth question later costs one array entry:

```ts
export type Answers = { centreId, testDate, experience, focus };
export const QUESTIONS: Question[];
export function canAdvance(step: number, a: Answers): boolean;
export function toMetadata(a: Answers, name: string): Record<string, unknown>;
```

## Motion

Everything comes from `src/ui/motion.ts`. Two new exports, no new numbers, no new curves.

| Moment | What moves | Timing | Source |
|---|---|---|---|
| Card advance | Outgoing fades and slides 14pt leading; incoming enters from 14pt trailing | 180 out / 280 in | `stepForward()` — **new** |
| Card back | The same, mirrored, so back reads as back | 180 / 280 | `stepBack()` — **new** |
| Screen entrance | Mark, title, group, then each action | 280, +45 each | `enterFrom(i)` |
| Progress bar | Width to the next fifth | 280 | `timing(280)` |
| Choice tap | Scale to 1.03 and straight back, plus `selectionAsync()` | 120 / 160 | `pulse(1.03)` |
| Auto-advance | Cards 1–3 only, once the pulse has landed | 280 delay | — |
| Date reveal | Height and opacity together | 280 | `timing(280)` |
| Strength segment | Fill scales from the leading edge; colour crossfades with it | 280, +45 each | `timing(280)` + `interpolateColor` |
| Strength label | Out then in — it changes on nearly every keystroke | 140 / 140 | `timing(140)` |
| Confirm reveal | Row expands past eight characters | 280 | `timing(280)` |
| Passwords match | Tick scales up at the trailing edge | 320 | `popIn()` |
| Account created | Tick scales up from 0.6 | 320 | `popIn()` |
| Button busy | Spinner fades in, label crossfades to `Signing in…` | 140 + endless | `ActivityIndicator` |
| Failure | Group outline turns danger; the reason slides down 6pt | 200 / 200 | `timing(200)` |
| Failure, felt | One asymmetric double tap. Nothing on screen moves | — | `notificationAsync(Error)` |
| Retry | Typing again clears the outline and the reason | 200 | `timing(200)` |

**Exactly one entry is off the decelerating curve**, and it earns it: the spinner is linear and endless because it reports progress rather than arriving anywhere. A decelerating spinner reads as a stall.

**Reduce Motion is only half-handled by default.** Reanimated's layout builders default to `ReduceMotion.System`, so `enterFrom`, `popIn` and the two new step transitions are already covered. The progress bar, the pulse and every strength animation are imperative `withTiming` calls and are **not** — they need an explicit `useReducedMotion()` check, or the one setting meant to calm the screen leaves the busiest thing on it moving. With the setting on, the meter still shows its state; it arrives there without travelling.

## Sequencing

This is one spec but it is deliberately two shippable halves, and the plan should keep them in that order:

**Half one — sign-in and the auth paths.** `authError.ts`, the store's `sendPasswordReset`, the re-dressed `sign-in.tsx`, the new `reset.tsx`, and defects 1–4 and 6–9. Nothing here depends on the interview. It stands alone, it fixes the unrecoverable-password bug, and it can go out on its own if the interview slips.

**Half two — the interview.** `passwordStrength.ts`, `onboarding.ts`, the three new components, the five-card `sign-up.tsx`, the `signUp` signature, and defect 10.

The dependency check in correction 2 belongs at the very start of half two, before any of its cards are built — the answer changes what card 2 is.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/passwordStrength.ts` | **New.** Pure scoring. No React, no Supabase. |
| `src/lib/onboarding.ts` | **New.** The questions as data, the gating, and `toMetadata`. Pure. |
| `src/lib/authError.ts` | **New.** Supabase message → human sentence. Pure, and total: an unrecognised code falls back to a generic sentence rather than leaking the original. |
| `src/ui/motion.ts` | Gains `stepForward()` and `stepBack()`. Nothing existing changes. |
| `src/ui/AuthField.tsx` | **New.** One row of a credentials `Group`: label, input, optional reveal toggle, the autofill attributes, and the return-key chaining. |
| `src/ui/StrengthMeter.tsx` | **New.** Four segments and a label, driven by a `Strength`. Presentational. |
| `src/ui/QuestionCard.tsx` | **New.** One card: heading, subheading, staggered options. Presentational — it neither stores an answer nor advances. |
| `src/stores/sessionStore.ts` | `signUp` takes a profile; gains `sendPasswordReset`. Selectors for the four new keys. |
| `app/(auth)/sign-in.tsx` | Re-dressed. Busy state, mapped errors, reveal, chaining, the two new links. |
| `app/(auth)/reset.tsx` | **New.** Email, send, sent-confirmation. |
| `app/(auth)/sign-up.tsx` | Becomes the five-card container. Owns `Answers`, the step index, and `BackHandler`. |

## Testing

`src/lib/**` is where the logic goes, so it is where most of the tests go — none of them render anything.

- **`passwordStrength.test.ts`** — the boundary at 7/8 characters; each of the four points in isolation; that `Password1!` scores `strong` (the documented reason the meter does not gate); that a 40-character passphrase with no symbol still reaches `good`.
- **`onboarding.test.ts`** — `canAdvance` false at every gate until its answer exists; card 4 capped at two and swapping the oldest on a third; `toMetadata` emitting `test_date: null` for *not booked*; `toMetadata` omitting `full_name` when the name is blank, so an unnamed account keeps the current greeting behaviour.
- **`authError.test.ts`** — the three real Supabase strings map to written sentences; an unknown string maps to the fallback and **does not appear in the output**.
- **`sessionStore.test.ts`** — extend the existing file, which already mocks `@/lib/supabase` at module scope (`sessionStore.test.ts:1-12`); add `signUp` passing `options.data` through, and `sendPasswordReset` returning `null` / a message.
- **`signInScreen.test.tsx`** — new. A failed sign-in shows the mapped sentence and not the raw one; typing again clears it; the button is disabled while busy.
- **`signUpFlow.test.tsx`** — new. The whole flow driven by `fireEvent`: cannot advance past card 1 without a centre; back preserves answers; the final press calls `signUp` with exactly the metadata `toMetadata` produced. This is the one test that matters most and it asserts the contract, not the pixels.

Screen tests mount standalone — `jest.setup.js` already stubs `@/lib/supabase` and `react-native-safe-area-context` for exactly this.

**Do not assert timing constants in screen tests.** `motion.test.ts` owns the numbers; a screen test that repeats them just breaks twice.

## Verification

Beyond green tests, on a device:

| Check | Expected |
|---|---|
| Sign in with a wrong password | A written sentence, a danger outline, one error haptic. Nothing moves back and forth. |
| Type again after that failure | Outline and message clear |
| iOS Keychain on sign-in | Fills both fields in one tap — the confirm field is on sign-up only, and this is why |
| Sign-up on Android, keyboard up | The button is reachable on every card |
| Android hardware back, mid-flow | Previous card, answers intact |
| Text size at maximum | Display type caps at 1.1×; body copy scales |
| Reduce Motion on | Nothing travels, including the meter and the progress bar |
| Complete a sign-up | Supabase dashboard shows all five keys under `raw_user_meta_data` |
| Forgot password | Email arrives; the link returns to the app |

The metadata check is the one that cannot be faked by a mock and is the whole point of the change.

## Deferred

- **Reading the four answers.** Centres opening on `home_centre_id`, a countdown on Home, `experience` picking the first suggestion, `focus` sorting routes by hazard. This spec writes and tests the data; the screens that consume it are their own change on their own screens. Shipping the write first is deliberate — it starts collecting real answers while those screens are built.
- **Sign in with Apple.** Not required while email is the only method; adding one third-party provider triggers App Store rule 4.8, which is a decision rather than a detail.
- **Parking and manoeuvre weak spots.** Needs a route ↔ manoeuvre relation that does not exist.
- **Migrating the remaining screens** onto the grouped-inset language. Centres, Result and the route screens still use the old tokens and are migrated separately.
