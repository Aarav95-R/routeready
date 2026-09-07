# Apple and Google sign-in

The code is done. What is left is credentials, in three consoles, and none of
it can be done from the repo.

Until it is done the app still builds and runs — the buttons simply do not
appear. `appleAvailable()` hides Apple's on a device that cannot honour it,
and `googleConfigured()` hides Google's in a build that shipped without its
client IDs. Nothing is broken in the meantime; there is just one fewer door.

## How it works, in one paragraph

Both providers hand back an OpenID `id_token` on the device, and that goes
straight to `supabase.auth.signInWithIdToken()`. Nothing leaves the app — no
browser, no redirect, no deep link. That was the point of choosing this over
`signInWithOAuth`, which would have put `site_url` back on the critical path
of signing in, and this project has been bitten by that before.

## 1. Apple Developer — the capability

Needs a **paid** Apple Developer Program membership. Sign in with Apple is not
available on a free account.

- Developer portal → Certificates, Identifiers & Profiles → Identifiers
- Open the App ID `com.sumeetraheja.routeready`
- Tick **Sign in with Apple**, save

`eas build` will also offer to enable this for you during a credentials sync,
which is easier than doing it by hand. The entitlement side is already done —
`usesAppleSignIn: true` in `app.config.js` writes it into the native project.

## 2. Supabase → Authentication → Providers → **Apple**

- Enable it
- **Authorized Client IDs**: `com.sumeetraheja.routeready`

Leave the Service ID and Secret Key blank. Those belong to the web OAuth flow,
which this app does not use. The bundle identifier is the audience Apple mints
the token for, so it must match `ios.bundleIdentifier` exactly.

## 3. Google Cloud Console — two OAuth clients

APIs & Services → Credentials. Configure the OAuth consent screen first if you
have not (External, app name, support email, the `email` and `profile` scopes).

Create **two** clients:

| Type | Configure with | Gives you |
|---|---|---|
| **iOS** | Bundle ID `com.sumeetraheja.routeready` | the iOS client ID |
| **Web application** | Authorized redirect URI `https://cbbkkpcyuqrfwfztcddf.supabase.co/auth/v1/callback` | the web client ID **and secret** |

Both are needed, for different reasons, and this is the step that is easiest to
get half right. The **iOS** client opens the sheet. The **web** client is the
audience Google mints the token for, and it is what Supabase validates. A build
configured with only the first opens a sheet that works perfectly and produces
a token Supabase then refuses, with a message about audiences.

## 4. `.env`

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com
```

Neither is a secret — Google client IDs are public, which is why they carry the
`EXPO_PUBLIC_` prefix that inlines them into the bundle.

`app.config.js` reverses the iOS one into the URL scheme Google's SDK needs, so
that is the only place it has to be written. Do not add a second variable for
the scheme; two variables for one fact is how they end up disagreeing, and the
failure that produces — a sheet that opens, completes, and never comes back —
says nothing about which of them is wrong.

## 5. Supabase → Authentication → Providers → **Google**

- Enable it
- **Client ID** and **Client Secret**: the **web** client's
- **Authorized Client IDs**: both the iOS client ID and the web client ID

That last field is the one that matters for native sign-in. It is the list of
audiences Supabase will accept an `id_token` for, and the iOS client ID must be
in it or every sign-in is refused after the person has already chosen an
account.

## 6. EAS environment variables — easy to miss

`eas.json` gives each build profile an `environment`, so **cloud builds do not
read your local `.env`**. Add both variables to EAS for every profile you build
(`development`, `preview`, `production`):

```
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <...> --environment development,preview,production --visibility plaintext
eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <...> --environment development,preview,production --visibility plaintext
```

Skip this and the cloud build simply has no client ID, so `app.config.js` leaves
Google's config plugin out and the button never appears — with no error
anywhere to explain why.

## 7. Rebuild

Both packages have native code, so this cannot run in Expo Go.

```
npx expo prebuild -p ios --clean
npx expo run:ios
```

or `eas build --profile development --platform ios`.

Sign in with Apple needs a real device, or a simulator signed into an Apple ID
under Settings.

## Notes

**Same person, two providers.** Supabase links identities automatically when
the provider's email is verified and matches an existing account. Nothing to
build; worth confirming on the project's settings if you care about the
behaviour.

**Apple hands over the name exactly once.** On the very first consent for the
app, and never again — every later sign-in carries `null` there, for the same
person, forever. `signInWithProvider` writes it the moment it arrives, which is
the only moment it can be written. If you delete the account and sign in again
during testing and the name does not reappear, that is why: revoke the app
under Settings → Apple ID → Sign in with Apple to get a first consent back.

**Apple's private relay.** People may sign in with a hidden
`@privaterelay.appleid.com` address. Nothing in the app emails users outside of
Supabase auth, so this needs no handling.

**App Store guideline 4.8** requires Sign in with Apple wherever you offer
Google. Both are here, so it is satisfied. Account deletion (5.1.1(v)) was
already covered by the `delete-account` function.
