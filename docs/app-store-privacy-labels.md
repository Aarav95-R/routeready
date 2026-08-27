# App Store privacy labels — the answers, and why

**Last checked against the code: 20 August 2026**

App Store Connect asks these questions under **App Privacy**, and the answers
have to match what the app actually does. Apple rejects mismatches, and a label
that over-declares is as wrong as one that under-declares — it just costs you
installs instead of a rejection.

Every answer below was read out of the code, not guessed. Where an answer would
have been different a week ago, that is noted.

---

## Does this app collect data? — **Yes**

---

## Contact Info → Email Address

| Question | Answer |
|---|---|
| Collected | **Yes** |
| Used for | **App Functionality** |
| Linked to the user's identity | **Yes** |
| Used for tracking | **No** |

The email is the account. `supabase.auth` stores it; it is how you sign in and
the only way an account is identified.

## Contact Info → Name

| Question | Answer |
|---|---|
| Collected | **Yes** |
| Used for | **App Functionality** |
| Linked to the user's identity | **Yes** |
| Used for tracking | **No** |

Optional, and only used to greet the person. Stored in `user_metadata.full_name`.

---

## User Content → Other User Content

| Question | Answer |
|---|---|
| Collected | **Yes** |
| Used for | **App Functionality** |
| Linked to the user's identity | **Yes** |
| Used for tracking | **No** |

This covers mock test results (`user_progress`: route, score, fault categories,
duration, off-route counts) and favourites. Apple has no category that fits
"driving test results" better than this one.

---

## Location → Precise Location

**Collected: No.**

This is the answer that most deserves an explanation, because the app plainly
*uses* precise location.

Apple's definition of "collect" is transmitting data off the device in a way
that persists beyond what is needed to service the immediate request. RouteReady
uses precise location continuously while a drive is happening, entirely on the
device, and **does not store it anywhere**:

- `expo-location` is foreground-only. There is no background mode and no
  `NSLocationAlwaysAndWhenInUseUsageDescription` in `app.config.js`.
- Fixes live in React refs during a drive and are discarded when the screen
  unmounts.
- `user_progress` has no coordinate column. Off-route events are stored as
  `atIdx` — an index into the chosen route's own published geometry — plus
  distance and duration.
- Coordinates are sent to Mapbox to draw the map and fetch directions. That is
  servicing the immediate request, which Apple's own guidance treats as not
  collection.

**This answer changed on 20 August 2026.** Until then, `user_progress.deviations`
stored `lat`/`lng` — the driver's real GPS position at the moment they rejoined
the route, on a row keyed to a user id, read back by nothing. With that in place
the honest answer would have been **Yes / App Functionality / Linked to identity**.
The field was removed and a migration (`2026-08-20-deviation-positions.sql`)
strips it from rows already stored. **Run that migration before submitting**, or
this answer is wrong for your existing data.

---

## Everything else — **Not Collected**

Say no to all of these. Each was checked:

| Category | Why not |
|---|---|
| Identifiers (User ID, Device ID) | The Supabase user id never leaves the account context and is not an advertising or device identifier |
| Usage Data | No analytics SDK of any kind is in the app |
| Diagnostics | **No — for now.** See the Sentry note below |
| Purchases | No payments, no IAP |
| Financial Info | None |
| Health & Fitness | None |
| Contacts | Never requested |
| Search History | Centre search is local and not stored |
| Browsing History | None |
| Sensitive Info | None |
| Other Data | None |

---

## Tracking — **No**

The app does not track. It has no advertising identifier, no third-party
analytics, no ad network, and shares nothing with data brokers.

This means **you do not need App Tracking Transparency** and must not add
`NSUserTrackingUsageDescription`. Adding it without tracking is itself a reason
for rejection.

---

## Two things that will change these answers

**If you add Sentry** (finding 08), then **Diagnostics → Crash Data** becomes
**Yes**. Whether it is "linked to identity" depends on configuration: if you
never call `Sentry.setUser`, it is *not linked*, which is the better answer and
the one to aim for. Decide that when wiring it, not afterwards.

**If mock test results ever sync to a second device** or the quiz results move
off the phone, revisit User Content.

---

## Before you submit

- [ ] Confirm `supabase/migrations/2026-08-20-deviation-positions.sql` has been
      run against the live project (not just committed here) so the Precise
      Location answer is true of your stored data, not just your code
- [ ] Host the privacy policy and put its URL in App Store Connect
- [x] Fill in the placeholders in `docs/privacy-policy.md` — name and support
      email are filled in (Aarav Raheja, aaravraheja99@gmail.com); no street
      address is published, which UK ICO guidance permits as long as the
      controller is reasonably contactable
- [ ] Add a support URL (the same site with an email on it is enough)
- [ ] Age rating: 4+ is correct — no objectionable content, no user-generated
      content, no web browsing
