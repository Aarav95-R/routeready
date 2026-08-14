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
  // ── The iOS-native roles. Additive: the values above still dress Centres,
  // Result and the route screens, which are migrated separately.
  //
  // A cell separates from the field by being lighter than it. That is the
  // whole mechanism, it is what iOS uses, and it survives a future dark mode
  // where a drop shadow does not.
  /** The grouped field behind every screen that has adopted the language. */
  field: "#F2F0EC",
  /** Every list group and panel sitting on the field. */
  cell: "#FFFFFF",
  label: "#1C1917",
  labelSecondary: "#6B635B",
  /** Values, captions and group headers. */
  labelTertiary: "#8A827A",
  /** Hairlines. Always inset from the leading edge, never full-bleed. */
  separator: "#E4DFD8",
  /** Bar tracks and other inactive ground. */
  fill: "#EBE7E1",
  ink2: "#574F49",
  ink3: "#8B827A",
  line: "#E8E3DC",
  /** The ground a route drawing sits on, on cards and on the chooser's hero. */
  drawing: "#EDEBE4",
} as const;
