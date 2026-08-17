// The JS half of the palette, for the places a class name cannot reach:
// SVG strokes, shadow colours, Ionicon tints. Every value here has a twin in
// tailwind.config.js and the two must be changed together.
//
// The neutrals are warm stone. The accent used to be emerald #059669, which
// leans blue — against warm stone that lean was most of what still read as
// software — so it moved a short distance towards leaf. It moved here and
// nowhere else: mapStyle, CentresMap, DriveModeRow and the tab bar each used
// to hold their own copy of the hex, and now all four read this module.
/**
 * One ground and one ink, each under two names.
 *
 * `field` and `label` were introduced as *additional* roles because `surface`
 * and `primary` could not be retuned without repainting every screen that had
 * not been migrated to the grouped-inset language yet. Repainting them is now
 * the point, so the pairs are the same value — written once here rather than
 * twice, because two literals is precisely how the accent ended up with four
 * copies of itself scattered across the app.
 *
 * The old names are kept rather than removed: about twenty files still spell
 * them, and renaming those call sites is churn with no pixel behind it.
 */
const GROUND = "#F5F0E8";
const INK = "#1C1917";

export const colors = {
  primary: INK,
  accent: "#1A875E",
  accentPressed: "#146B4A",
  warning: "#D97706",
  surface: GROUND,
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
  /** The grouped field behind every screen. Twinned with `surface` above. */
  field: GROUND,
  /** Every list group and panel sitting on the field. */
  cell: "#FFFFFF",
  /** Body and heading ink. Twinned with `primary` above. */
  label: INK,
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
  // ── The warm secondary. Green is the road; clay is you.
  //
  // The accent keeps every meaning it has — go, route, correct, primary
  // action — and clay takes the ones that are about the person: progress
  // through the sign-up interview, the answer they picked, their account.
  //
  // The split is what lets the app have a warm accent at all. Clay appears
  // nowhere on a live drive, so the two never compete for the same glance,
  // and nothing on the navigation screens has to be re-learned.
  /** Progress, a chosen answer, the confirmation tick. */
  clay: "#B8624A",
  /** The ground under a chosen answer. */
  clayTint: "#F7E6DB",
} as const;
