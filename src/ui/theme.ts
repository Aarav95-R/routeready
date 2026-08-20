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
  /**
   * The accent when it is *ink* rather than ground.
   *
   * The bare accent measures 4.50 on the cell and 3.96 on the field, which is
   * fine behind white — every primary button is large text — and not fine as
   * type on a light ground, which is what a borderless button's label is. Same
   * value as `accentPressed` on purpose: the app already owns this green, and
   * a fifth one invented at a call site is how the accent ended up with four
   * copies of itself the last time.
   */
  accentInk: "#146B4A",
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
  /**
   * Both of these moved a step darker after the quiz shipped.
   *
   * The old tertiary, #8A827A, measured 3.78 against the cell and 3.33 against
   * the field — under the 4.5 WCAG asks for at these sizes, and it was
   * carrying the second line of every list row, every group header and every
   * caption in the app. So most of the small type was below the threshold, and
   * on the quiz's two-line rows it read as genuinely faint.
   *
   * Fixed by shifting the pair down rather than by darkening one: collapsing
   * tertiary into the old secondary would have left two levels where the row
   * design needs three. Both values were already in the palette — this is the
   * ladder being re-spaced, not new colours. `theme.test.ts` holds the floor.
   */
  labelSecondary: "#574F49",
  /** Values, captions and group headers. */
  labelTertiary: "#6B635B",
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
  /** The ground under a chosen answer, and under the quiz hero. */
  clayTint: "#F7E6DB",
  /**
   * The three roles the clay ground needs, now that the quiz hero makes it a
   * surface type sits on rather than a 6pt bar.
   *
   * `clay` itself measures 3.54 on its own tint. That is fine for the bar and
   * not fine for the sentence beside it, which is the same argument that put
   * `accentInk` next to `accent` — a hue used as fill and a hue used as ink
   * are two roles, and collapsing them is how a palette ends up with type
   * nobody can read on the one screen that uses it.
   */
  clayInk: "#7A3A28",
  clayInkSoft: "#9A5741",
  /** Clay at 22% over its own tint, resolved flat. See `accentTint` for why. */
  clayTrack: "#E9C9BB",
  /**
   * The two grounds a marked quiz answer sits on — the accent and the danger
   * red, each laid over the cell at low alpha and resolved to a flat hex.
   *
   * Flat rather than transparent because a marked option keeps a 1.5pt border
   * of the full-strength hue, and a translucent fill behind a solid border
   * reads as two different colours wherever the cell is not pure white.
   *
   * Danger appears here and only here in the quiz. It is right at the moment
   * of answering, where the error haptic fires with it; by the summary screen
   * a missed question has cooled to clay, because three red bars on the screen
   * you see after every single round reads as a telling-off.
   */
  accentTint: "#E7F2ED",
  dangerTint: "#FBE9E9",
} as const;
