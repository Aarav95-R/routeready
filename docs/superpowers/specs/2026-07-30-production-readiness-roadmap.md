# RouteReady — Production Readiness Roadmap

**Date:** 2026-07-30
**Status:** For discussion — confirm scope before starting.

## The honest reality

"Production-ready for the App Store" is a **program of work**, not one build step. I can do all the *engineering*. But shipping to the store depends on things **only you** can set up, some of which cost money and take time (Apple review, account enrolment). I can't create accounts, pay fees, sign legal docs, or submit on your behalf.

The good news: the **"full Waze look → dev build + Mapbox"** decision you just made *is* the production path. Expo Go was always dev-only — the App Store needs a real signed build (via EAS) regardless — so moving there now is a step toward release, not wasted work.

## Where we are today

- ✅ Working Phase 1 in Expo Go: auth, centres, routes, live turn-by-turn navigation.
- ❌ Not yet production, because:
  - Navigation's route-to-start uses the **public OSRM demo server** at runtime (not allowed for a shipping app).
  - A **Hemel test route** + dev scripts are in the data/repo.
  - Default **Expo icon/splash** (placeholder).
  - **Phase 2 tabs are empty** ("Coming in Phase 2") — a reviewer and users will see three stub screens.
  - The **DB password was shared in chat** (needs rotating).
  - No **build pipeline**, **privacy policy**, or **store listing** yet.
  - Supabase **free tier** pauses on inactivity.

## A. Engineering — I can do all of this

1. **Release build pipeline** — move off Expo Go to **EAS Build**: `eas.json`, `app.config.ts`, bundle id / version / build number, dev + preview + production profiles. (You run `eas login` and trigger builds; I set everything up and produce TestFlight-installable builds.)
2. **Maps & directions** — integrate **Mapbox** (`@rnmapbox/maps`) with a Waze-like custom map style (keeping your emerald route), and use **Mapbox Directions** for the route-to-start leg, replacing the OSRM demo. Needs your Mapbox token.
3. **Data cleanup** — remove the Hemel test route and the `add-test-route`/`push` dev scripts from the shipped path.
4. **App identity** — a clean app **icon + splash** set (a bespoke brand icon can come later).
5. **Robustness** — proper loading/empty/error states everywhere, network retries, **crash reporting** (Sentry), sensible offline behaviour, remove console noise.
6. **Auth completeness** — password reset, email-confirmation UX, production deep-link scheme for magic links.
7. **Phase 2 features** — build the **Progress dashboard, Manoeuvre trainer, and Show Me/Tell Me quiz**. Strongly recommended before submitting: three empty stub tabs is a common cause of a poor first impression or App Review rejection.
8. **Secrets/config** — Supabase URL + anon key via EAS env; nothing sensitive committed.

## B. Your actions — external / paid / legal (I can't do these)

1. **Apple Developer Program** — enrol (**$99/year**). Required to sign and submit. Can take a day or two to approve.
2. **Expo account** — free; needed for EAS cloud builds (you're on Windows, so cloud is the only route to an iOS build).
3. **Mapbox account** — free tier; a token for the map + directions (usage billed beyond the free allowance). *(Alternative: Google Maps Platform, billing enabled.)*
4. **Rotate the Supabase DB password** (it appeared in our chat).
5. **Privacy policy + support URL** — required, since we collect email + location. I'll **draft** the policy; you host it and get it reviewed.
6. **App Store Connect** — create the listing, screenshots, description, age rating; submit for review. I prep assets/copy; the account actions are yours.
7. **Supabase paid tier** (~$25/mo) so the backend doesn't pause for a live app.

## C. Decisions to confirm

1. **Provider:** Mapbox (recommended — custom style + directions in one SDK) vs Google Maps.
2. **Phase 2 before submitting?** Recommended (avoid empty tabs) vs ship Phase 1 only.
3. **Final app name / bundle id** (currently `com.routeready.app`).

## Suggested order

1. **You**, in parallel: begin **Apple Developer** enrolment; create **Expo** + **Mapbox** accounts.
2. **Me:** EAS pipeline + Mapbox navigation (the Waze look) → a **TestFlight build** you can install on your phone.
3. **Me:** Phase 2 features + data cleanup + robustness + icon/splash.
4. **Me:** draft privacy policy + store copy/screenshots.
5. **You:** rotate DB password; host policy; create listing; submit for review.
