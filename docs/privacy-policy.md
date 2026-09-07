# RouteReady — Privacy Policy

> **This file has a published twin**, and the published one is what Apple and
> Google actually read:
> <https://aarav95-r.github.io/routeready-site/privacy.html>
>
> It is served from the separate public repo `Aarav95-R/routeready-site` (a
> working copy sits at `../routeready-site`), so that this repository can stay
> private while the policy stays reachable at a URL. The `site/` folder here is
> the editing copy.
>
> **Change all three together** — this file, `site/privacy.html`, and the site
> repo. A policy that disagrees with the one at the URL given to App Store
> Connect is worse than either version alone.

**Last updated: 29 August 2026**

RouteReady helps learner drivers practise around real UK driving test centres.
This policy explains what the app collects, why, and what you can do about it.
It describes what the app actually does; where something is not collected, this
policy says so plainly rather than staying quiet about it.

RouteReady is operated by **Aarav Raheja**, an independent developer based in
the United Kingdom. For anything in this policy, contact
**aaravraheja99@gmail.com**.

Under UK GDPR we are the **data controller** for the information described here.

---

## What we collect

### Your account

When you sign up we collect:

- **Your email address**, which identifies your account and is how you sign in.
- **Your password**, if you sign up with one. It is stored only as a
  cryptographic hash by our authentication provider. Nobody at RouteReady can
  see it.
- **Your first name**, if you choose to give one. It is optional, and it is used
  only to greet you in the app.

### If you sign in with Apple or Google

You can create an account with **Sign in with Apple** or **Continue with
Google** instead of a password. If you do, there is no password at all — the
provider confirms who you are and hands us a signed token, and we never see
your Apple or Google credentials.

What we receive from them is the same short list as above:

- **Your email address.**
- **Your name**, if the provider supplies one. Apple offers it only the first
  time you ever use Sign in with Apple for this app; Google supplies it each
  time. We store it only to greet you, and we never overwrite a name you have
  set yourself.

We do not receive, and never ask for, anything else — no contacts, no calendar,
no Drive or iCloud content, no profile photo, and no access to your Apple or
Google account beyond confirming your identity at the moment you sign in.

**Apple's Hide My Email is fully supported.** If you choose it, we only ever
receive the relay address Apple generates, never your real one, and the app
works exactly the same.

You can revoke this at any time from your Apple ID or Google account settings.
Doing so stops you signing in that way; it does not by itself delete your
RouteReady account, which you can delete in the app as described below.

### What you tell us at sign-up

The sign-up questions ask which test centre is nearest you, roughly when your
test is, how far along you are, and what you want to work on. These are stored
with your account and used to decide what the app shows you first. You can skip
the optional ones.

### What you do in the app

- **Mock test results** — the route you drove, your score, which categories of
  fault were recorded, and how long the drive took.
- **Off-route events** — how many times you left the route during a mock test,
  how much of the route that skipped, and how long you were off it. This is
  recorded as a position *along the route you chose*, not as a map coordinate.
  **We do not store the GPS location you were at.**
- **Your favourite routes.**

### Your location

RouteReady uses your device's location **only while the app is open and you are
using it**. It has no background location access and cannot see where you are
when the app is closed.

Your location is used, on your device, to:

- show where you are on the map,
- work out when to speak the next instruction,
- tell whether you have reached the start of a route or left it,
- and detect when you enter the observation zones a mock test scores.

**Your location is not stored on our servers and is not part of your account.**
It is held in your phone's memory while a drive is happening and discarded when
it ends. The only things that outlive a drive are the results described above.

The one exception is unavoidable and worth being clear about: to draw the map
and to give you directions to a route's start, coordinates are sent to Mapbox
as part of an ordinary map request. See **Who else is involved** below.

### What we do not collect

We want to be specific, because "we may collect" language usually hides this:

- **No analytics or usage tracking.** No third-party analytics SDK of any kind
  is in the app.
- **No advertising, and no advertising identifiers.** We do not use the IDFA and
  do not show ads.
- **No tracking across other apps or websites.**
- **No contacts, photos, microphone, calendar or health data.**
- **No payment details.** RouteReady does not take payments.
- **We never sell your data.** There is no arrangement under which we could.

---

## Why we are allowed to hold it (legal bases)

| What | Why | Legal basis under UK GDPR |
|---|---|---|
| Email and password | To create and secure your account | Performance of a contract |
| Email and name from Apple or Google | To create your account when you choose that way in | Performance of a contract |
| Name, sign-up answers | To make the app useful to you | Consent — all optional |
| Mock test results, favourites | To show you your own progress | Performance of a contract |
| Location, while driving | To navigate and score a practice drive | Performance of a contract |

Where the basis is consent, you can withdraw it at any time by clearing the
field in the app or by deleting your account.

---

## Who else is involved

RouteReady uses the service providers below. All are bound by their own
contracts and none is permitted to use your data for their own purposes.

**Supabase** hosts the database and handles sign-in. Your email, your name if
you gave one, your sign-up answers, your mock test results and your favourites
are stored there. Data is held in the EU (`eu-west-1`, Ireland).
[supabase.com/privacy](https://supabase.com/privacy)

**Mapbox** provides the map and the driving directions. When the app draws a map
or asks for directions to a route's start, it sends the coordinates needed for
that request. Mapbox receives these as part of serving the map; it does not
receive your name, email, or anything that identifies your account.
[mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy)

**Apple** distributes the app and may collect its own data about downloads and
crashes under its own policy. We do not receive anything from Apple that
identifies you.

If you use **Sign in with Apple**, Apple additionally acts as your identity
provider: it confirms who you are and tells us your email address (or a relay
address, if you chose Hide My Email) and, on first use only, your name. Apple
does not tell us anything else, and we do not tell Apple anything about what
you do in the app.
[apple.com/legal/privacy](https://www.apple.com/legal/privacy/)

If you use **Continue with Google**, Google acts as your identity provider in
the same way, telling us your email address and your name. We request only the
basic `email` and `profile` information — nothing from Gmail, Drive, Contacts,
Calendar or any other Google service — and Google receives nothing from us
about what you do in the app.
[policies.google.com/privacy](https://policies.google.com/privacy)

Both of these happen **only if you choose that way of signing in.** If you sign
up with an email address and password, neither Apple nor Google is involved in
your account at all.

Some processing by these providers happens outside the UK. Where it does, it is
covered by the safeguards those providers publish, including the UK
International Data Transfer Addendum.

---

## How long we keep it

Your account and its data are kept for as long as your account exists.

When you delete your account, it is deleted **immediately and permanently** —
your email, your name, your sign-up answers, every mock test result and every
favourite. There is no grace period and nothing is retained in an archive.
Backups held by our hosting provider roll off within 30 days.

---

## Deleting your account

You can delete your account from inside the app, without asking us and without
sending an email:

> **Account → Delete account → Delete my account**

The screen lists exactly what will be removed before you confirm. Deletion is
immediate and cannot be undone. Signing up again with the same email address
gives you a new, empty account.

If you would rather we did it, email **aaravraheja99@gmail.com** from the
address on the account and we will action it within 30 days.

---

## Your rights

Under UK GDPR you have the right to:

- **access** the personal data we hold about you,
- **correct** anything inaccurate,
- **delete** your data — the in-app button above does this immediately,
- **restrict** or **object to** how we use it,
- **portability** — receive your data in a machine-readable form,
- **withdraw consent** where consent was the basis.

To exercise any of these, email **aaravraheja99@gmail.com**. We will respond
within one month. You will never be charged for making a request or treated
differently for having made one.

If you are unhappy with how we have handled your data, you can complain to the
**Information Commissioner's Office** — [ico.org.uk](https://ico.org.uk),
helpline 0303 123 1113.

---

## Security

Your sign-in session is stored in your device's secure keychain, not in ordinary
app storage. All traffic between the app and our servers uses TLS. Database
access is governed by row-level security policies, so one account cannot read
another's results — this is enforced by the database itself, not only by the app.

No system is perfectly secure, and we will not claim otherwise. If we ever
discover a breach affecting your data, we will tell you and the ICO as the law
requires.

---

## Children

RouteReady is intended for people learning to drive. You must be at least 17 to
apply for a UK provisional car licence, and the app is not directed at children
under 13. We do not knowingly collect data from anyone under 13; if you believe
we have, contact us and we will delete it.

---

## Changes to this policy

If we change what we collect or why, we will update this page and change the
date at the top. If the change is significant, we will tell you in the app
before it takes effect.

---

## Contact

**Aarav Raheja**
**aaravraheja99@gmail.com**
