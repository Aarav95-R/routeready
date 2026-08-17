import { FACES, TEXT_STYLES, body, caption, footnote, headline, largeTitle, subheadline, title2 } from "../type";
import { colors } from "../theme";

/**
 * React Native picks a static font file by family name, not by weight: set
 * `fontFamily: "PlusJakartaSans_400Regular"` next to `fontWeight: "700"` and Android
 * renders the regular file and ignores the weight outright.
 *
 * So the family has to travel with the style rather than being set alongside
 * it. Baking it into the scale is also what carries the face to every screen
 * already spreading these styles, without one call site changing.
 */
test("every style names the font file matching its own weight", () => {
  for (const style of TEXT_STYLES) {
    expect(style.fontFamily).toBe(FACES[style.fontWeight]);
  }
});

test("the three weights the scale uses each have a face", () => {
  expect(new Set(TEXT_STYLES.map((s) => s.fontWeight))).toEqual(new Set(["400", "600", "700"]));
  expect(FACES).toEqual({
    "400": "PlusJakartaSans_400Regular",
    "600": "PlusJakartaSans_600SemiBold",
    "700": "PlusJakartaSans_700Bold",
  });
});

/**
 * The names here must be the exact export names of `@expo-google-fonts/…`,
 * because `app/_layout.tsx` passes those exports to `useFonts` and React
 * Native then looks the family up by that string. A typo does not throw: the
 * screen renders in the system face and nothing anywhere says so.
 */
test("a face name is the loader's export name, not a display name", () => {
  for (const face of Object.values(FACES)) {
    expect(face).toMatch(/^PlusJakartaSans_(400Regular|600SemiBold|700Bold)$/);
  }
});

// The point of the scale is that it is closed. A screen reaching for 18.5pt is
// the thing this module exists to prevent, so the set is asserted whole.
test("the scale is exactly the seven iOS styles", () => {
  expect(TEXT_STYLES).toHaveLength(7);
  expect(TEXT_STYLES.map((s) => s.fontSize).sort((a, b) => b - a)).toEqual([34, 22, 17, 17, 15, 13, 13]);
});

test("each style carries the platform's size, leading and weight", () => {
  expect(largeTitle).toMatchObject({ fontSize: 34, lineHeight: 41, fontWeight: "700" });
  expect(title2).toMatchObject({ fontSize: 22, lineHeight: 28, fontWeight: "700" });
  expect(headline).toMatchObject({ fontSize: 17, lineHeight: 22, fontWeight: "600" });
  expect(body).toMatchObject({ fontSize: 17, lineHeight: 22, fontWeight: "400" });
  expect(subheadline).toMatchObject({ fontSize: 15, lineHeight: 20, fontWeight: "400" });
  expect(footnote).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: "600" });
  expect(caption).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: "400" });
});

// Display type is tracked tighter than body type on iOS; body type is not
// tracked at all. Getting this backwards is what makes large type look loose.
test("only display styles carry negative tracking", () => {
  expect(largeTitle.letterSpacing).toBeLessThan(0);
  expect(title2.letterSpacing).toBeLessThan(0);
  expect(caption.letterSpacing).toBe(0);
});

test("the new colour roles exist and are distinct", () => {
  const roles = [
    colors.field, colors.cell, colors.label, colors.labelSecondary,
    colors.labelTertiary, colors.separator, colors.fill,
  ];
  expect(roles).toEqual(["#F5F0E8", "#FFFFFF", "#1C1917", "#6B635B", "#8A827A", "#E4DFD8", "#EBE7E1"]);
  expect(new Set(roles).size).toBe(7);
});

// The emerald leaned blue, and against warm stone that lean was most of what
// still read as software. It moves a short distance towards leaf — and it
// moves everywhere at once, which is what the copies in mapStyle, CentresMap
// and the tab bar existed to prevent.
test("the accent is the warmer green", () => {
  expect(colors.accent).toBe("#1A875E");
  expect(colors.accentPressed).toBe("#146B4A");
});

/**
 * Green is the road; clay is you.
 *
 * Clay dresses progress through the interview, the answer you picked and your
 * account — and it appears nowhere on a live drive, so a warm accent can exist
 * without ever competing with the route line for the same glance.
 */
test("clay is a separate role from the accent, not a shade of it", () => {
  expect(colors.clay).toBe("#B8624A");
  expect(colors.clayTint).toBe("#F7E6DB");
  expect(colors.clay).not.toBe(colors.accent);
});

/**
 * `field` and `label` existed only because `surface` and `primary` could not
 * be changed without repainting every screen that had not been migrated yet.
 * Repainting them is now the point, so the two pairs are one ground and one
 * ink under two names — asserted as an identity rather than as two literals,
 * because two literals is exactly how they drifted apart in the first place.
 *
 * The old names stay because ~20 files still spell them, and several of those
 * files have uncommitted work in them. Renaming the call sites is churn with
 * no pixel behind it.
 */
test("there is one ground and one ink, whichever name a screen uses for them", () => {
  expect(colors.surface).toBe(colors.field);
  expect(colors.primary).toBe(colors.label);
});

test("the warm ground and ink are the values the redesign chose", () => {
  expect(colors.field).toBe("#F5F0E8");
  expect(colors.label).toBe("#1C1917");
});

test("the rest of the existing palette is untouched", () => {
  expect(colors.faultRunner).toBe("#A7C4B6");
  expect(colors.card).toBe(colors.cell);
});
