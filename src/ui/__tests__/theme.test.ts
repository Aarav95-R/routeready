import { colors } from "../theme";

/**
 * WCAG relative luminance and contrast ratio, as the spec defines them.
 * Small enough to restate here that pulling in a dependency to check five
 * colours would be the larger cost.
 */
const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const luminance = (h: string) => {
  const [r, g, b] = channels(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The two grounds every piece of text in the app sits on. */
const GROUNDS = [
  ["cell", colors.cell],
  ["field", colors.field],
] as const;

/** WCAG AA for text below 18pt, which is nearly all of this app's text. */
const AA = 4.5;

describe("text is legible on both grounds", () => {
  const textRoles = [
    ["label", colors.label],
    ["labelSecondary", colors.labelSecondary],
    ["labelTertiary", colors.labelTertiary],
  ] as const;

  for (const [role, value] of textRoles) {
    for (const [groundName, ground] of GROUNDS) {
      test(`${role} on ${groundName} meets AA`, () => {
        // labelTertiary shipped at #8A827A — 3.78 on the cell, 3.33 on the
        // field — and it carries the second line of every quiz row, every
        // group header and every caption. That is most of the app's small
        // text sitting below the threshold.
        expect(contrast(value, ground)).toBeGreaterThanOrEqual(AA);
      });
    }
  }
});

test("the three text roles stay distinguishable from each other", () => {
  // Fixing contrast by flattening three levels into two would trade one
  // problem for another: the hierarchy is what makes a row scannable.
  const ranked = [colors.label, colors.labelSecondary, colors.labelTertiary].map(luminance);
  expect(ranked[0]).toBeLessThan(ranked[1]);
  expect(ranked[1]).toBeLessThan(ranked[2]);
});

/** WCAG AA for large text — 18pt regular or 14pt bold and up. */
const AA_LARGE = 3;

test("white on the accent is legible, since that is how every primary button reads", () => {
  // Measured at 4.496 on white, which is a hair under the small-text bar and
  // over the large-text one. Every place white sits on the accent is a button
  // label at 17pt weight 600 — large text by the spec's reckoning — so this is
  // the threshold that applies, not a relaxed version of the other one.
  //
  // The alternative was darkening the brand green by a percent to clear 4.5 on
  // a rule that does not govern it, which would have touched the tab bar, the
  // map style and every route line to fix nothing.
  expect(contrast("#FFFFFF", colors.accent)).toBeGreaterThanOrEqual(AA_LARGE);
  expect(contrast("#FFFFFF", colors.accentPressed)).toBeGreaterThanOrEqual(AA_LARGE);
});

test("there is an accent dark enough to set type in on a light ground", () => {
  // The bare accent is 4.50 on the cell and 3.96 on the field — fine as a
  // fill behind white, not fine as ink. A borderless button's label needs a
  // darker one, and inventing a hex at the call site is how an app ends up
  // with four greens.
  for (const [, ground] of GROUNDS) {
    expect(contrast(colors.accentInk, ground)).toBeGreaterThanOrEqual(AA);
  }
});

test("white on danger is legible, since a wrong answer is marked that way", () => {
  expect(contrast("#FFFFFF", colors.danger)).toBeGreaterThanOrEqual(AA);
});

test("type on the clay hero is legible, since that is a third ground now", () => {
  // The quiz hero is the first surface in the app that is neither the cell nor
  // the field, so the two grounds above do not cover it. The bare clay is 3.54
  // on its own tint — fine as a bar, not as the sentence next to it — which is
  // exactly why these are separate roles rather than `clay` reused as ink.
  expect(contrast(colors.clayInk, colors.clayTint)).toBeGreaterThanOrEqual(AA);
  expect(contrast(colors.clayInkSoft, colors.clayTint)).toBeGreaterThanOrEqual(AA);
});

test("the clay hero's bar is visible against the ground it sits on", () => {
  // A track that reads as nothing turns the bar into a floating fragment with
  // no scale behind it, which is worse than no bar.
  expect(contrast(colors.clayTrack, colors.clayTint)).toBeGreaterThanOrEqual(1.1);
});
