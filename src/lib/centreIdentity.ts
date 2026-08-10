import type { Centre } from "@/types/db";

export type CentreIdentity = {
  hue: string;
  tint: string;
  /** Up to two letters, drawn on the pin and the emblem tile. */
  initials: string;
  /** Drives the generated arcs on the emblem. 1-based position in the list. */
  seed: number;
};

// Emerald is deliberately absent: it means "you" or "go" everywhere in this app
// and an identity colour that matched the buttons would leave the screen
// without an action colour.
//
// The order is not the colour wheel's. Adjacent entries go to adjacent centres
// in the list, so neighbouring hues are kept apart on purpose — teal follows
// rose rather than pink following rose.
//
// Every value here is gated at 4.5:1 against white (the monogram) and against
// its own tint (the emblem lettering) by centreIdentity.test.ts. Four of them
// are a shade darker than the obvious choice for exactly that reason.
export const IDENTITY_PALETTE = [
  { hue: "#BE123C", tint: "#FFF1F2" }, // rose
  { hue: "#0F766E", tint: "#F0FDFA" }, // teal
  { hue: "#A16207", tint: "#FFFBEB" }, // amber
  { hue: "#4F46E5", tint: "#EEF2FF" }, // indigo
  { hue: "#4D7C0F", tint: "#F7FEE7" }, // lime
  { hue: "#BE185D", tint: "#FDF2F8" }, // pink
  { hue: "#0369A1", tint: "#F0F9FF" }, // sky
  { hue: "#C2410C", tint: "#FFF7ED" }, // orange
  { hue: "#7C3AED", tint: "#F5F3FF" }, // violet
  { hue: "#0E7490", tint: "#ECFEFF" }, // cyan
  { hue: "#A21CAF", tint: "#FDF4FF" }, // fuchsia
  { hue: "#475569", tint: "#F1F5F9" }, // slate
] as const;

/** "Mill Hill (London)" -> "MH". Seeded names carry a parenthesised town. */
export function initials(name: string): string {
  return name
    .split(/[\s(]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Colour by position, not by hash.
 *
 * A hash of `centre.id` spread over twelve hues collides constantly across the
 * forty seeded centres, and two identically coloured pins side by side is the
 * one failure this design cannot absorb. Position guarantees the near set —
 * capped at twelve, against a palette of twelve — never repeats on the map.
 *
 * Callers pass the distance-sorted list, never the displayed one, so
 * re-sorting by pass rate repaints nothing.
 */
export function assignIdentities(centres: Centre[]): Map<string, CentreIdentity> {
  const out = new Map<string, CentreIdentity>();
  centres.forEach((centre, i) => {
    const { hue, tint } = IDENTITY_PALETTE[i % IDENTITY_PALETTE.length];
    out.set(centre.id, { hue, tint, initials: initials(centre.name), seed: i + 1 });
  });
  return out;
}
