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

## 3. Auth URL configuration (no longer load-bearing)

Supabase **Authentication → URL Configuration** still shows a **Site URL** and **Redirect URLs**
section, and the dashboard (and `supabase/config.toml`) still has one set to
`routeready://auth-callback`. Nothing below matters for getting auth email working — none of the
three flows (sign-up, password reset, "Email me a sign-in code") sends a `redirectTo` /
`emailRedirectTo` any more. Each one now sends a typed six-digit code instead of a link, so there
is nothing for a redirect URL to open.

Supabase still requires a non-empty `site_url` regardless — GoTrue won't start without one — so
leave the current value in place. There's no need to change it, and deliberately no reason to:
nothing exercises it today, so changing it buys nothing functional while adding another field to
touch on a first push that's already delicate.

It is, however, a latent trap. `routeready://auth-callback` names the deep-link route this project
deleted once codes replaced links. If a link-based auth flow is ever reintroduced, whatever it
sends as `redirectTo` will land on that Site URL, and — because the route is gone — expo-router's
"Unmatched Route" screen is what the user sees instead of the app. Repoint `site_url` (and the
matching `additional_redirect_urls` entry in `supabase/config.toml`) to wherever the new route
lives before shipping that flow, not after someone reports the dead end.

## 4. Production email sending (Resend)

Supabase's built-in mailer is rate-limited to a handful of emails an hour — fine for the SQL-editor
sanity checks above, not for real signups. Production auth email goes through Resend instead,
configured in `supabase/config.toml` (`[auth.email.smtp]` and the three `[auth.email.template.*]`
blocks) and the three files under `supabase/templates/`.

**Three templates, not two.** `confirmation.html` and `recovery.html` are the ones the flows are
named after; `magic_link.html` covers "Email me a sign-in code" on the sign-in screen
(`sendMagicLink` in `src/stores/sessionStore.ts`). Leaving that third block out doesn't stop the
email — it sends GoTrue's stock unbranded one from your Resend sender.

Nothing below sends a single email until **every** step is done — the DNS records, the key, and
the push. A half-finished setup fails silently: signups appear to work and no confirmation arrives.

0. **Install the Supabase CLI** if you haven't (`supabase --version` should print something):
   ```bash
   brew install supabase/tap/supabase
   ```
1. **Sending domain.** Auth email sends as `RouteReady <noreply@getticker.dev>`, from the **root**
   `getticker.dev` domain, which was already verified in Resend for another project. Confirm it
   still shows green (SPF + DKIM) under Resend → Domains before trusting any of this; an unverified
   or lapsed domain bounces or lands in spam no matter how good the templates are.

   Note the trade this makes. The usual advice is a dedicated `mail.getticker.dev` subdomain, so
   that auth email carries its own sending reputation — on the root, anything the other project
   sends can degrade deliverability here, and the failure mode is a user who can't get back into
   their account because the reset is in spam. Reusing the verified root avoided the DNS work at
   launch. To switch later: add `mail.getticker.dev` in Resend, add the MX + DKIM TXT + SPF TXT
   records it shows you at the `getticker.dev` registrar (entering hosts *relative to the zone* —
   `send.mail`, not `send.mail.getticker.dev`), verify, then change `admin_email` in
   `supabase/config.toml` and push. Worth adding a DMARC TXT record either way.
2. **Create an API key** in Resend, scoped to sending only. Make a **new** one for RouteReady
   rather than reusing the other project's — same domain, but a key you can revoke without taking
   the other project down with it.
3. **Set the secret.** Locally, add it to `.env` (see `.env.example`):
   ```
   SUPABASE_AUTH_SMTP_PASS=re_...
   ```
   For the hosted project, set the same name as a project secret instead — `.env` only reaches the
   CLI when it runs on your machine:
   ```bash
   supabase secrets set SUPABASE_AUTH_SMTP_PASS=re_...
   ```
4. **Reconcile `config.toml` with the live project before pushing anything.** It didn't exist in
   this repo before now, so the file was scaffolded fresh rather than pulled from what's actually
   configured on the dashboard today. `config push` overwrites each section it covers with what's
   in the file, so a section this repo guessed wrong reverts that setting on the live project,
   silently and with no diff to review afterwards. Run once:
   ```bash
   supabase link --project-ref cbbkkpcyuqrfwfztcddf
   supabase config pull
   ```
   That overwrites `supabase/config.toml` with the project's real settings. Then re-apply, from
   this repo's version (`git diff supabase/config.toml` shows exactly what the pull took out):
   - `[auth.email.smtp]`
   - `[auth.email.template.confirmation]`, `.recovery`, `.magic_link`
   - `auth.rate_limit.email_sent = 100` — the CLI default is **2 per hour, project-wide**, which
     means the third signup of any hour gets no email at all. Keep it at or under your Resend
     plan's daily quota (free tier: 100/day).
   - `auth.email.max_frequency = "60s"` — the CLI default of `1s` makes the reset screen's
     "Send it again" button an email cannon aimed at any address someone can type.
   - `auth.email.otp_length = 6` — must equal `CODE_LENGTH` in `src/lib/otpCode.ts`. If they
     disagree, Supabase emails a code of one length while the app types and submits another, and
     every code is refused in production while every local test that doesn't check this still
     passes. `src/lib/__tests__/emailTemplates.test.ts` asserts this value against the repo, so a
     drift shows up there as a test failure rather than as a production incident.
   - `auth.email.otp_expiry = 3600` — 60 minutes, quoted verbatim in all three templates. A
     six-digit code is one of a million, so the CLI's day-long default is a materially weaker
     thing to leave standing than it was for an unguessable link token.

   Then check `auth.email.enable_confirmations` by hand against the dashboard, since it's set from
   what the app's code assumes rather than from the pull: it must be `true` — the sign-up flow is
   built on `signUp()` returning no session. Also check that `auth.site_url` /
   `auth.additional_redirect_urls` still both contain `routeready://auth-callback` — not because
   any auth call needs it (see section 3, it doesn't), but because GoTrue requires a non-empty
   `site_url` and this repo isn't touching that value right now.

   Review the full `git diff`, and only then:
   ```bash
   supabase config push
   ```
5. **Send yourself all three codes and confirm they arrive branded**, in light and dark:
   - sign up with a fresh address → *Confirm your email*
   - "Forgot your password?" → *Reset your password*
   - "Email me a sign-in code" → *Your sign-in code*

   Each email carries a six-digit code and no link. Type it into the screen the
   app is already showing. The reset code must land you on "Set a new password"
   rather than dropping you into the app.

   Check the **From** line reads `RouteReady <noreply@getticker.dev>` and that
   the mail lands in the inbox rather than spam.

## 5. Run the app

**Not in Expo Go.** The maps are native Mapbox and the purchases are native
RevenueCat, neither of which exists in Expo Go. There are two ways to run it,
and which you need depends on what you are testing.

### On the iOS simulator — for everything except buying

Builds locally. Needs Xcode and the `MAPBOX_DOWNLOAD_TOKEN` in `.env` (the pod
is fetched at build time).

```bash
npm install                              # if you haven't already
npm run ios -- --device "iPhone 17 Pro"  # first build 5-15 min; drop --device to be prompted
```

After the first build, `npx expo start` and press `i` is enough — JS changes
live-reload. Rebuild with `npm run ios` only when something native changes (a
new native module, a plugin in `app.config.js`, a pod update).

The simulator has no GPS and no StoreKit. Set a location by hand with
*Features → Location → Custom Location* (the seed is all UK, so something like
51.7520, -0.3360), and see below for purchases.

### On a physical iPhone — required for purchases

StoreKit sandbox does not run on the simulator, so testing a real subscription
means a dev build on a real device. `docs/dev-build.md` is the runbook; section
7.5 below covers the sandbox account.

## 6. Manual QA checklist (the Phase-1 review)

Walk through these on the device:

1. **Auth** — sign up, confirm by typing the six-digit code from the email, sign in → lands on the Centres tab. Kill and relaunch the app → still signed in (session persists in the iOS keychain). Then, from the sign-in screen, tap "Forgot your password?", request a reset, type the emailed code → lands on "Set a new password" (not straight into the app), set one, and confirm the new password signs you in.
2. **Centres** — search narrows the list; the Nearest / Pass rate / Manual / Auto segmented control filters and sorts; pull-to-refresh works. Turn on Airplane Mode and relaunch → cached list shows with the amber "Offline" banner.
3. **Centre detail** — pass-rate sparkline renders; swipe a route card right to start practice, left to favourite (the amber star persists after relaunch).
4. **Route detail** — this is the **map-look checkpoint**: the Mapbox `navigation-day-v1` cartography, the emerald route line following actual roads, amber hazard pins. Stats and hazards match the seed data. On a route that is not the centre's free one, expect the paywall sheet in place of the drive row and the hazard list — that is the gate working, not a failure to load.
5. **Practice** — the blue dot follows you; approaching a turn speaks the instruction once in a British voice; tapping a hazard pin opens the bottom sheet (drag between 25/50/90%); "End practice" cleans up (no voice after leaving). Best tested walking or driving a short loop.
6. **Mock test** — the timer ticks; entering a seeded observation zone lights the green "Mirrors" button with a haptic; "Finish test" → animated PASS/FAIL result with the fault breakdown → a row appears in Supabase `user_progress` (or queues offline and syncs on reconnect).

## What's deliberately not in Phase 1

The Quiz tab is built: the bank is browsable by category, and a round deals ten questions as multiple choice, one screen each, ending on a summary. Results live on the device under `cache:progress:quiz`, so signing out clears them with everything else personal.

Two things to know about the bank. The rebalance this file used to promise is done — the single "under the bonnet" row that crammed oil, coolant and brake fluid into one question is now the three real DVSA questions it stood in for, and the indicator and brake-light checks moved to "safety and the outside", where you actually do them. That is how 18 questions became 20.

The four options under each question are **not DVSA content**. The agency publishes the questions and the model answers only, because the real test is verbal and offers nobody a choice of four. Every wrong option was written for this app, each bending one real detail out of true — a threshold, a condition, a dashboard symbol. They live in `scripts/seed/questions.ts` and are worth reading before release.

Manoeuvres is built: four manoeuvres, each with a top-down diagram whose car moves to whichever step you tap or scroll to. It is a reference only \u2014 nothing is saved, so there is no ticking, no confidence rating and no per-user state.

## 7. Subscriptions (RevenueCat)

The app takes money through RevenueCat, which sits in front of StoreKit so that
the entitlement is one question with one answer on every platform. Everything
RevenueCat-shaped in this codebase lives behind the seven functions in
`src/services/purchases.ts`; nothing else imports the SDK.

Until `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is set, all seven are no-ops that report
an unknown entitlement. That is a supported build, not a broken one — the
paywall sheet renders with no plans rather than crashing — so you can do the
steps below in any order and the app keeps running throughout.

**None of this works in Expo Go or on the simulator.** StoreKit purchases need a
real device, a dev build, and a sandbox Apple ID. See `docs/dev-build.md`.

### 7.1 App Store Connect: the two products

Under **My Apps → RouteReady → Subscriptions**, create one subscription group
(call it `RouteReady Full`) with two auto-renewable subscriptions in it:

| Product ID | Duration | Price |
|---|---|---|
| `routeready_weekly` | 1 week | £3.00 |
| `routeready_monthly` | 1 month | £9.00 |

Both need a localised display name, a description, and a review screenshot
before Apple will let them leave "Missing Metadata". They do **not** need to be
approved for sandbox testing — "Ready to Submit" is enough.

You also need the **App-Specific Shared Secret** (App Store Connect → your app →
General → App Information → App-Specific Shared Secret). RevenueCat needs it to
validate receipts.

### 7.2 RevenueCat: project, entitlement, offering

1. Create a project and add an **App Store** app to it, with the bundle
   identifier `com.sumeetraheja.routeready`. Paste the shared secret from 7.1.
2. **Products**: import or add `routeready_weekly` and `routeready_monthly`.
3. **Entitlements**: create one with the identifier **`full`** — exactly that
   string, it is `ENTITLEMENT_ID` in `src/services/purchases.ts` and the thing
   the Postgres policies key off. Attach both products to it.
4. **Offerings**: create an offering named **`default`** and mark it current.
   Add two packages to it: **`$rc_weekly`** → `routeready_weekly`, and
   **`$rc_monthly`** → `routeready_monthly`.

The package identifiers matter: `offers()` reads `current.weekly` and
`current.monthly`, which RevenueCat populates only for those two reserved
identifiers. A custom package identifier produces an offering the sheet renders
as empty.

### 7.3 The key

RevenueCat → **Project Settings → API keys** → the **public app-specific** key
for the iOS app (it starts `appl_`). Put it in `.env`:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
```

For TestFlight and production builds, set the same name on EAS — the cloud
bundles the JS, so a value only in your local `.env` never reaches those builds:

```bash
eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_... --environment production
```

### 7.4 The webhook

RevenueCat → **Integrations → Webhooks**, pointed at the Supabase Edge Function
that writes the `entitlements` table. That function is Task 11 of the paywall
plan and is **not built yet** — until it exists, the `entitlements` table stays
empty, which means the server-side RLS gate treats everyone as unsubscribed
even after a successful purchase. The client will unlock (it asks RevenueCat
directly), but `route_details` and `hazards` will not be served.

In other words: 7.1–7.3 make the purchase work; Task 11 makes it stick.

### 7.5 Sandbox testing, on a device

1. Create a **Sandbox Apple ID** in App Store Connect → Users and Access →
   Sandbox → Test Accounts. Use an address you control that is not an existing
   Apple ID.
2. On the iPhone: Settings → App Store → Sandbox Account, sign in with it.
3. Build and install the dev client (`docs/dev-build.md`), then
   `npx expo start --dev-client`.
4. Walk it: buy weekly, confirm the locked routes unlock. Kill and relaunch,
   confirm it persisted. Cancel in the sandbox account and confirm the lapse
   sweeps the cached routes. Sandbox renewals are accelerated — a week renews
   in a few minutes — so a cancellation lands fast enough to watch.

Never test with your real Apple ID. Sandbox purchases are free; real ones are
not.
