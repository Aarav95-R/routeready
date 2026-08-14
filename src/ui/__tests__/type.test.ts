import { TEXT_STYLES, body, caption, footnote, headline, largeTitle, subheadline, title2 } from "../type";
import { colors } from "../theme";

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
  expect(roles).toEqual(["#F2F0EC", "#FFFFFF", "#1C1917", "#6B635B", "#8A827A", "#E4DFD8", "#EBE7E1"]);
  expect(new Set(roles).size).toBe(7);
});

// The old tokens still dress Centres, Result and the route screens. Removing
// one here would silently repaint every screen this plan does not touch.
test("the existing palette is untouched", () => {
  expect(colors.primary).toBe("#221F1C");
  expect(colors.surface).toBe("#F7F5F1");
  expect(colors.accent).toBe("#059669");
  expect(colors.faultRunner).toBe("#A7C4B6");
});
