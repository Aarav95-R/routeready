# RouteReady — Setup & Run (Phase 1)

Phase 1 is code-complete on the `phase-1` branch: auth, test-centre directory, route detail, practice mode (voice), and the silently-scored mock test. All automated checks pass (38 unit tests, TypeScript clean, `expo-doctor` 18/18). The steps below are the parts that need your Supabase account and a physical iPhone — they can't be automated.

## 1. Create the Supabase project

1. Create a new project at https://supabase.com.
2. Open the **SQL Editor** and run, in order:
   - `supabase/schema.sql` — creates the 6 tables, RLS policies, and Phase-1 columns/`favourites` table.
   - `supabase/seed.sql` — inserts 40 real DVSA centres, 400 road-snapped practice routes, their hazards, 20 show-me/tell-me questions, 4 manoeuvres.
3. Sanity check in the SQL editor:
   ```sql
   select count(*) from routes;           -- expect 400
   select count(*) from show_me_tell_me;  -- expect 20
   ```

## 2. Configure credentials

1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. In the repo root, copy the example env file and fill it in:
   ```bash
   cp .env.example .env
   ```
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
   `.env` is gitignored — your keys never get committed.

## 3. Enable magic-link deep links

In Supabase **Authentication → URL Configuration → Redirect URLs**, add:
```
routeready://auth-callback
```
For testing magic links inside Expo Go specifically, also add the `exp://…/--/auth-callback` URL that `npx expo start` prints (Expo Go uses the `exp://` scheme in development).

Email/password sign-up works without this; only the "magic link" button needs it.

## 4. Run in Expo Go

```bash
npm install      # if you haven't already
npx expo start
```
Scan the QR code with the Camera app on an iPhone that has **Expo Go** installed. (iOS only — the maps use Apple Maps.)

## 5. Manual QA checklist (the Phase-1 review)

Walk through these on the device:

1. **Auth** — sign up, confirm via the email Supabase sends, sign in → lands on the Centres tab. Kill and relaunch the app → still signed in (session persists in the iOS keychain).
2. **Centres** — search narrows the list; the Nearest / Pass rate / Manual / Auto segmented control filters and sorts; pull-to-refresh works. Turn on Airplane Mode and relaunch → cached list shows with the amber "Offline" banner.
3. **Centre detail** — pass-rate sparkline renders; swipe a route card right to start practice, left to favourite (the amber star persists after relaunch).
4. **Route detail** — this is the **map-look checkpoint**: real Apple Maps in `mutedStandard`, the emerald route line following actual roads, amber hazard pins. Stats and hazards match the seed data.
5. **Practice** — the blue dot follows you; approaching a turn speaks the instruction once in a British voice; tapping a hazard pin opens the bottom sheet (drag between 25/50/90%); "End practice" cleans up (no voice after leaving). Best tested walking or driving a short loop.
6. **Mock test** — the timer ticks; entering a seeded observation zone lights the green "Mirrors" button with a haptic; "Finish test" → animated PASS/FAIL result with the fault breakdown → a row appears in Supabase `user_progress` (or queues offline and syncs on reconnect).

## What's deliberately not in Phase 1

The Quiz tab is built: the bank is browsable by category, and a round deals ten questions as multiple choice, one screen each, ending on a summary. Results live on the device under `cache:progress:quiz`, so signing out clears them with everything else personal.

Two things to know about the bank. The rebalance this file used to promise is done — the single "under the bonnet" row that crammed oil, coolant and brake fluid into one question is now the three real DVSA questions it stood in for, and the indicator and brake-light checks moved to "safety and the outside", where you actually do them. That is how 18 questions became 20.

The four options under each question are **not DVSA content**. The agency publishes the questions and the model answers only, because the real test is verbal and offers nobody a choice of four. Every wrong option was written for this app, each bending one real detail out of true — a threshold, a condition, a dashboard symbol. They live in `scripts/seed/questions.ts` and are worth reading before release.

Manoeuvres is built: four manoeuvres, each with a top-down diagram whose car moves to whichever step you tap or scroll to. It is a reference only \u2014 nothing is saved, so there is no ticking, no confidence rating and no per-user state.
