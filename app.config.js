// Dynamic Expo config (plain JS/CommonJS for maximum compatibility with the
// EAS build config reader). The Mapbox build-time download token comes from the
// environment (an EAS secret) rather than being committed.

/**
 * The URL scheme Google's SDK hands the sheet's result back on.
 *
 * It is the iOS client ID with its dot-separated parts reversed, so it is
 * derived here rather than kept as a second variable somebody has to
 * remember to change with the first. Two env vars for one fact is how they
 * end up disagreeing, and the failure that produces — a sheet that opens,
 * completes, and never returns — says nothing about which of them is wrong.
 *
 * "" when the client ID is absent, and the plugin below is then left out
 * entirely rather than handed an empty string — it validates its option and
 * *throws*, so including it unconditionally would break `expo run:ios` and
 * every EAS build for anyone who has not finished the Google console setup
 * yet, with an error about a URL scheme rather than about the missing ID.
 *
 * Leaving it out is safe in both directions: the same env var gates the
 * Google button at runtime (`googleConfigured` in socialAuth.ts), so a build
 * without it simply does not offer a door it cannot open.
 */
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
const googleIosUrlScheme = googleIosClientId
  ? googleIosClientId.split(".").reverse().join(".")
  : "";

module.exports = {
  name: "RouteReady",
  slug: "routeready",
  owner: "ar3063",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "routeready",
  // Light, not "automatic". The palette in src/ui/theme.ts is a single warm-stone
  // set with no dark twin and nothing reads useColorScheme, so "automatic" only
  // ever meant iOS darkening the chrome around a light app. This is the honest
  // declaration until a dark pass exists; theme.ts is already written for one.
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    // Every screen is laid out at phone widths. Claiming tablet support
    // guarantees a reviewer opens it on an iPad, where those layouts stretch.
    supportsTablet: false,
    bundleIdentifier: "com.sumeetraheja.routeready",
    // Adds the Sign in with Apple entitlement to the app. The matching
    // capability still has to be switched on for this App ID in the Apple
    // Developer portal — EAS does that during a credentials sync — and the
    // bundle identifier above is what Supabase validates Apple's tokens
    // against, so the two must stay identical.
    usesAppleSignIn: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "RouteReady uses your location to guide you along practice routes and score mock tests.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      // The mark is drawn on nothing so the launcher can mask it; this is the
      // ground it sits on, and it is the app's, not white.
      backgroundColor: "#F5F0E8",
    },
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        // Matches colors.field, so the splash does not flash white into a
        // warm-stone app on every cold start.
        backgroundColor: "#F5F0E8",
      },
    ],
    "expo-secure-store",
    "expo-font",
    "expo-asset",
    "expo-web-browser",
    "expo-apple-authentication",
    ...(googleIosUrlScheme
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }]]
      : []),
    ["@rnmapbox/maps", { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN || "" }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "dfbca2a8-f268-47af-b81a-3fc9e9c58f01",
    },
  },
};
