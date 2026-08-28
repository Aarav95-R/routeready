# Auth email as typed codes — design

**Status:** approved 2026-08-28
**Design artifact:** https://claude.ai/code/artifact/aab14f7e-27dd-4fd0-a84a-0c9cc1600cca

## The problem

Every auth email RouteReady sends is a link that has to be tapped:
confirmation, password recovery, and the sign-in magic link. Three things are
wrong with that here.

**One-time links get spent by machines.** Corporate mail scanners follow every
link in an incoming message to check it. The token is single-use, so the
scanner spends it and the person taps a link that reports itself as already
used. Nothing on the sending side fixes this.

**The link flow depends on configuration that has never been right.** An
emailed link only reaches the app if `site_url` and the redirect allow-list
name `routeready://auth-callback`. On the live project today `site_url` is
still `http://localhost:3000` and the allow-list is empty, so no emailed link
has ever opened the app. A code does not care about either setting.

**A link assumes one device.** Sign up on the phone, read email on a laptop,
and the link opens on the wrong machine. Six digits can be carried across the
room in someone's head.

## The change

All three flows become codes. The email carries `{{ .Token }}` and no link at
all; the app gains one screen where the code is typed.

Deliberately code-*only*. Supabase can render both a code and a link in one
email, and doing so would re-import the scanner problem this change exists to
remove, while giving the reader two ways to do one thing.

## Decisions

| | Decision | Why |
|---|---|---|
| Flows converted | all three — confirmation, recovery, magic link | Leaving one on links keeps the whole deep-link mechanism alive to serve a single path. Converting all three lets it be deleted. |
| Code length | 6 (`otp_length` 8 → 6) | Six is what people expect to type and chunks into two glances. Eight is the Supabase project default, chosen by nobody. |
| Expiry | 60 minutes (`otp_expiry` 86400 → 3600) | A link token is unguessable; a six-digit code is one of a million. A million-space secret must not stay live for a day. Supabase's per-IP verification limit blunts brute force but shouldn't have to carry the whole argument. |
| Link in body | none | See above. |

## Shape

**One screen, not three.** `app/(auth)/verify.tsx` takes an `email` and a
`type` as route params and serves sign-up, reset and magic link alike. The
alternative — a code field inlined into each of the three screens' existing
"check your inbox" states — would spread the resend cooldown, the error
sentences and the paste handling across three files that then drift.

**Pure logic stays out of the screen**, matching how `authRoute`, `authError`
and `authCallback` are already factored: `otpCode.ts` normalises what the
field receives, `verifyCopy.ts` maps a type to its words. Both are directly
testable without mounting anything.

**`recovering` survives unchanged.** It is set when a recovery code verifies
rather than when a recovery link lands, and `nextAuthRoute` keeps routing on
it exactly as before. The verify screen sits inside the `(auth)` group, so the
existing `session && inAuth → /(tabs)` branch carries a confirmed sign-up into
the app with no new routing rule.

**The deep-link auth path is deleted, not left dormant.** `auth-callback.tsx`,
`authCallback.ts`, `setSessionFromCallback`, the `Linking` listener in
`app/_layout.tsx`, and the `auth-callback` branch in `authRoute.ts` all exist
solely to receive emailed tokens. Once no email carries one they are dead
weight that still has to be read and reasoned about. The `routeready` scheme
stays registered in `app.config.js` — it costs nothing and a future share link
will want it.

## Verification states

The screen distinguishes three failures, because collapsing them makes people
retype a code that will never work:

- **wrong code** — check the email and try again
- **expired code** — send a new one
- **too many attempts / too soon to resend** — already handled by
  `authError`'s `rate limit` and `for security purposes` entries

## Out of scope

- OTP for email *change* — the app has no email-change flow (`updateUser` is
  only ever called with `password` and `full_name`).
- Rotating the project's `jwt_secret`.
- The Resend/config push itself, which is unchanged by this work except that
  it now carries the rewritten templates.
