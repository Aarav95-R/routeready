# RouteReady — Dev Build Runbook (Mapbox)

The app now uses **native Mapbox**, so it can't run in Expo Go anymore. You build a
**development client** once (in the cloud, no Mac needed), install it on your iPhone,
then develop exactly like before: edit on Windows → live reload on the phone.

You have the Apple Developer account already. You'll also need free Expo + Mapbox accounts.

## 1. Mapbox account + tokens (free)

1. Sign up at https://account.mapbox.com.
2. **Public token** (runtime): from **Tokens**, copy your **Default public token** (`pk.…`).
3. **Secret download token** (build-time): **Tokens → Create a token** → name it "downloads" →
   tick the **`DOWNLOADS:READ`** secret scope → Create. Copy the `sk.…` token (shown once).

## 2. Put the tokens in place

In the repo root, in your local `.env` (create it from `.env.example` if needed), add:
```
EXPO_PUBLIC_MAPBOX_TOKEN=pk.your-public-token
```
(Your Supabase lines stay as they are.)

The **secret** download token is NOT committed and NOT in `.env` for the cloud build —
you'll give it to EAS as a secret in step 4.

## 3. Expo + EAS login

```powershell
npm install -g eas-cli
eas login            # your Expo account
eas init             # links this project to your Expo account (creates a project id)
```

## 4. Give EAS the Mapbox download token

```powershell
eas secret:create --scope project --name MAPBOX_DOWNLOAD_TOKEN --value sk.your-secret-download-token
```

## 5. Register your iPhone as a test device

```powershell
eas device:create
```
Follow the prompt — it gives you a link/QR; open it **on your iPhone** and install the profile.
(One-time per device.)

## 6. Build the dev client (cloud, ~15–30 min)

```powershell
eas build --profile development --platform ios
```
- When it asks about Apple credentials, log in with your Apple Developer account and let EAS
  manage signing (say yes to the prompts).
- When it finishes, it prints a QR/link — open it on your iPhone to **install the dev client**.

## 7. Run it

```powershell
npx expo start --dev-client
```
Open the **RouteReady** dev-client app on your phone (same Wi-Fi), and it connects to Metro
just like Expo Go did. Go to a route → Practice → you'll see the **Mapbox navigation**.

## Day-to-day after this

- **JS/UI changes** (screens, logic, styling): instant live reload, no rebuild.
- **Native changes** (adding/updating a native module): rebuild the dev client (repeat step 6).

## Notes

- This **development** build loads its JS from your local Metro, so your local `.env`
  (public Mapbox token + Supabase keys) is used at runtime — good for iterating.
- For a **production / TestFlight** build later, those `EXPO_PUBLIC_*` values must also be set
  on EAS (the cloud bundles the JS then). We'll handle that when we get to submission.
- The Waze-style *map cartography* comes from Mapbox's `navigation-day-v1` style. A fully
  bespoke Waze look (custom colours/pills) would be a custom Mapbox Studio style we can wire
  in later by swapping one style URL.
