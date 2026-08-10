import type { Centre } from "@/types/db";
import { assignIdentities, IDENTITY_PALETTE, initials } from "../centreIdentity";

// WCAG 2.1 relative luminance and contrast ratio. Test-only: nothing in the app
// computes contrast at runtime, but the palette is not allowed to drift below
// the gate without this suite going red.
const luminance = (hex: string) => {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const centre = (id: string, name = id): Centre => ({
  id, name, address: "", lat: 51.6, lng: -0.24,
  pass_rate: 40, pass_rate_history: [], test_types: ["manual"], region: "Greater London",
});

test("every hue is legible as white monogram on the pin", () => {
  for (const { hue } of IDENTITY_PALETTE) {
    expect(contrast(hue, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  }
});

test("every hue is legible on its own tint", () => {
  for (const { hue, tint } of IDENTITY_PALETTE) {
    expect(contrast(hue, tint)).toBeGreaterThanOrEqual(4.5);
  }
});

test("a full near set of twelve gets twelve different hues", () => {
  const centres = Array.from({ length: 12 }, (_, i) => centre(`c${i}`));
  const hues = [...assignIdentities(centres).values()].map((v) => v.hue);
  expect(new Set(hues).size).toBe(12);
});

test("assignment follows position in the list given, and wraps past twelve", () => {
  const centres = Array.from({ length: 14 }, (_, i) => centre(`c${i}`));
  const ids = assignIdentities(centres);
  expect(ids.get("c0")!.hue).toBe(IDENTITY_PALETTE[0].hue);
  expect(ids.get("c11")!.hue).toBe(IDENTITY_PALETTE[11].hue);
  expect(ids.get("c12")!.hue).toBe(IDENTITY_PALETTE[0].hue);
  expect(ids.get("c0")!.seed).toBe(1);
});

test("initials take one letter per word and ignore a parenthesised suffix", () => {
  expect(initials("Mill Hill (London)")).toBe("MH");
  expect(initials("Barnet")).toBe("B");
  expect(initials("Bishop's Stortford")).toBe("BS");
});
