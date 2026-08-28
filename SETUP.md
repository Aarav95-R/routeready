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

## 3. Enable auth deep links

In Supabase **Authentication → URL Configuration**, set:
- **Site URL**: `routeready://auth-callback`
- **Redirect URLs**, add: `routeready://auth-callback`

This app is mobile-only — there's no web front end — so the custom scheme is both. Without this,
GoTrue rejects (or silently ignores) the `redirectTo`/`emailRedirectTo` every auth call sends, and
every emailed link — signup confirmation, magic link, password reset — falls back to whatever Site
URL was there before, which does not open the app.

For testing magic links inside Expo Go specifically, also add the `exp://…/--/auth-callback` URL that `npx expo start` prints (Expo Go uses the `exp://` scheme in development).

## 4. Production email sending (Resend)

Supabase's built-in mailer is rate-limited to a handful of emails an hour — fine for the SQL-editor
sanity checks above, not for real signups. Production auth email goes through Resend instead,
configured in `supabase/config.toml` (`[auth.email.smtp]` and the three `[auth.email.template.*]`
blocks) and the three files under `supabase/templates/`.

**Three templates, not two.** `confirmation.html` and `recovery.html` are the ones the flows are
named after; `magic_link.html` covers "Email me a link instead" on the sign-in screen
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

   Then check these two by hand against the dashboard, since they're set from what the app's code
   assumes rather than from the pull: `auth.email.enable_confirmations` (must be `true` — the
   sign-up flow is built on `signUp()` returning no session) and `auth.site_url` /
   `auth.additional_redirect_urls` (both must contain `routeready://auth-callback`, per step 3).

   Review the full `git diff`, and only then:
   ```bash
   supabase config push
   ```
5. **Send yourself all three emails and confirm they arrive branded**, in light and dark (Apple
   Mail follows the system appearance; most clients do):
   - sign up with a fresh address → *Confirm your email*
   - "Forgot your password?" on the sign-in screen → *Reset your password*
   - "Email me a link instead" on the sign-in screen → *Your sign-in link*

   Open each on the **device**, not the desktop: the links carry
   `redirect_to=routeready://auth-callback`, which only resolves where the app is installed. The
   reset link must land on "Set a new password" rather than dropping you straight into the app —
   if it opens the app instead, `recovering` isn't being set and `type=recovery` isn't surviving
   the round trip.

   Check the **From** line reads `RouteReady <noreply@getticker.dev>` and that the mail lands
   in the inbox rather than spam. If it's in spam, DKIM/SPF haven't propagated or verified — go
   back to step 1; no amount of template work fixes it.

### Known limitation: link pre-fetching

Some corporate mail scanners follow every link in an incoming message to check it for malware.
Because these links are one-time, a scanner that opens one first burns it, and the person then
taps a link that reports itself as expired. This affects magic links and password resets, not
just this app, and there is no fix on the sending side — the real answer is emailing a 6-digit
OTP code instead of a link (Supabase supports it; `otp_length = 6` is already set). Consumer
providers — Gmail, iCloud, Outlook.com — don't generally do this, so it's unlikely to bite the
App Store audience. Worth knowing before debugging a report of "the link says it's expired".

## 5. Run in Expo Go

```bash
npm install      # if you haven't already
npx expo start
```
Scan the QR code with the Camera app on an iPhone that has **Expo Go** installed. (iOS only — the maps use Apple Maps.)

## 6. Manual QA checklist (the Phase-1 review)

Walk through these on the device:

1. **Auth** — sign up, confirm via the email Supabase sends, sign in → lands on the Centres tab. Kill and relaunch the app → still signed in (session persists in the iOS keychain). Then, from the sign-in screen, tap "Forgot your password?", request a reset, open the emailed link on the device → lands on "Set a new password" (not straight into the app), set one, and confirm the new password signs you in.
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
