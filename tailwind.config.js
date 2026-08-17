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

// One ground and one ink, each under two names — `surface`/`field` and
// `primary`/`label`. The second name of each pair was added when the old one
// could not be retuned without repainting unmigrated screens; repainting them
// is now the point. Twinned with src/ui/theme.ts.
const GROUND = "#F5F0E8";
const INK = "#1C1917";

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: INK,
        // Twinned with src/ui/theme.ts — the two must change together.
        accent: { DEFAULT: "#1A875E", pressed: "#146B4A" },
        clay: { DEFAULT: "#B8624A", tint: "#F7E6DB" },
        warning: "#D97706",
        surface: GROUND,
        card: "#FFFFFF",
        danger: "#DC2626",
        "fault-runner": "#A7C4B6",
        field: GROUND,
        cell: "#FFFFFF",
        label: INK,
        "label-secondary": "#6B635B",
        "label-tertiary": "#8A827A",
        separator: "#E4DFD8",
        fill: "#EBE7E1",
        slate: stone,
      },
    },
  },
};
