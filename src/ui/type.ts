import type { TextStyle } from "react-native";

/**
 * The seven text styles, and the only font sizes allowed on a re-dressed
 * screen.
 *
 * These are Apple's own text styles, not sizes chosen to look right in
 * isolation. That is the whole argument for them: every well-built app on the
 * phone is already using this scale, so matching it is most of what makes an
 * app read as native rather than as a website in a phone frame. Home
 * previously used eight sizes — 30, 18.5, 18, 17, 16.5, 15.5, 14.5, 13 — and
 * not one of them was on it.
 *
 * Tracking is negative on display sizes and zero on body sizes, which is the
 * direction iOS tightens in. Reversing it is what makes large type look loose
 * and small type look cramped.
 */
type Weight = "400" | "600" | "700";
type Style = Required<Pick<TextStyle, "fontSize" | "lineHeight" | "letterSpacing" | "fontFamily">> & {
  fontWeight: Weight;
};

/**
 * The face, per weight.
 *
 * Inter went first because it is not a warm typeface — drawn for screens and
 * control panels, its even, flat rhythm was most of what made the sign-in
 * screen read as a form rather than as a welcome. Figtree replaced it and
 * fixed exactly that, but a face chosen for being inoffensive at every size
 * never becomes the app's own: at 34pt the large title had nothing to say.
 *
 * Plus Jakarta Sans is the one candidate that reads as drawn rather than
 * generated — squared curves and cut joins give it tension at display sizes —
 * while staying open and even at 13pt, which is where two thirds of this app's
 * words live. Its figures matter as much as its letters here: a pass rate, a
 * distance and a fault count are most of what a row says.
 *
 * React Native selects a static font file by family name and ignores
 * `fontWeight` when one is set, so the family has to be named per weight and
 * has to travel with the style. Every screen spreading these styles gets the
 * face for free; that is why it lives here rather than at call sites. The
 * screens not yet on the scale import FACES rather than spelling a file name,
 * for the same reason — a family name that no longer exists does not throw,
 * it silently renders in the system face.
 */
export const FACES: Record<Weight, string> = {
  "400": "PlusJakartaSans_400Regular",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
};

const style = (
  fontSize: number, lineHeight: number, fontWeight: Weight, letterSpacing: number,
): Style => ({ fontSize, lineHeight, fontWeight, letterSpacing, fontFamily: FACES[fontWeight] });

export const largeTitle = style(34, 41, "700", -0.9);
export const title2 = style(22, 28, "700", -0.46);
export const headline = style(17, 22, "600", -0.41);
export const body = style(17, 22, "400", -0.41);
export const subheadline = style(15, 20, "400", -0.17);
export const footnote = style(13, 18, "600", 0);
export const caption = style(13, 18, "400", 0);

export const TEXT_STYLES: readonly Style[] = [
  largeTitle, title2, headline, body, subheadline, footnote, caption,
];

/**
 * iOS will render the design 130% larger if the phone's text size is turned
 * up. Display type is capped; body copy is left free to scale, because that is
 * what the setting is for.
 */
export const MAX_DISPLAY_SCALE = 1.1;
