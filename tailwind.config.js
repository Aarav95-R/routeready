/** @type {import('tailwindcss').Config} */

// The neutral scale is warm stone, not Tailwind's slate.
//
// `slate` is a grey with a blue cast, and it was used in ~70 places across
// every screen — it, not the emerald, was what made the app read clinical.
// Overriding the scale in place rather than renaming every class means one
// edit warms the whole app and no screen can be left behind on the old greys.
// The accent, hazard amber and danger red keep their exact values.
const stone = {
  100: "#F0ECE6",
  200: "#E8E3DC",
  300: "#D8D1C8",
  400: "#A79D94",
  500: "#8B827A",
  600: "#574F49",
  700: "#433D38",
  800: "#332E2A",
  900: "#221F1C",
};

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#221F1C",
        accent: { DEFAULT: "#059669", pressed: "#047857" },
        warning: "#D97706",
        surface: "#F7F5F1",
        card: "#FFFFFF",
        danger: "#DC2626",
        "fault-runner": "#A7C4B6",
        slate: stone,
      },
    },
  },
};
