// The JS half of the palette, for the places a class name cannot reach:
// SVG strokes, shadow colours, Ionicon tints. Every value here has a twin in
// tailwind.config.js and the two must be changed together.
//
// The neutrals are warm stone; the accent, hazard amber and danger red are
// untouched, so the route line, the pins and the Stop button look exactly as
// they did before the app warmed up.
export const colors = {
  primary: "#221F1C",
  accent: "#059669",
  accentPressed: "#047857",
  warning: "#D97706",
  surface: "#F7F5F1",
  card: "#FFFFFF",
  danger: "#DC2626",
  /**
   * A fault bar that is not the leading one. The same green with the life
   * taken out of it, not a new hue — see FaultBars for why that distinction
   * matters.
   */
  faultRunner: "#A7C4B6",
  ink2: "#574F49",
  ink3: "#8B827A",
  line: "#E8E3DC",
  /** The ground a route drawing sits on, on cards and on the chooser's hero. */
  drawing: "#EDEBE4",
} as const;
