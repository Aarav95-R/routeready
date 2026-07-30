// Dynamic Expo config so the Mapbox build-time download token comes from the
// environment (an EAS secret) rather than being committed.
export default {
  name: "RouteReady",
  slug: "routeready",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "routeready",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.routeready.app",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "RouteReady uses your location to guide you along practice routes and score mock tests.",
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
    ["@rnmapbox/maps", { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? "" }],
  ],
  experiments: {
    typedRoutes: true,
  },
};
