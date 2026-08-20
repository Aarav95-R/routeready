// Dynamic Expo config (plain JS/CommonJS for maximum compatibility with the
// EAS build config reader). The Mapbox build-time download token comes from the
// environment (an EAS secret) rather than being committed.
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
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "RouteReady uses your location to guide you along practice routes and score mock tests.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
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
        backgroundColor: "#ffffff",
      },
    ],
    "expo-secure-store",
    "expo-font",
    "expo-asset",
    "expo-web-browser",
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
