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
type Style = Required<Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight" | "letterSpacing">>;

export const largeTitle: Style = { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: -0.9 };
export const title2: Style = { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.46 };
export const headline: Style = { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.41 };
export const body: Style = { fontSize: 17, lineHeight: 22, fontWeight: "400", letterSpacing: -0.41 };
export const subheadline: Style = { fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.17 };
export const footnote: Style = { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0 };
export const caption: Style = { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 };

export const TEXT_STYLES: readonly Style[] = [
  largeTitle, title2, headline, body, subheadline, footnote, caption,
];

/**
 * iOS will render the design 130% larger if the phone's text size is turned
 * up. Display type is capped; body copy is left free to scale, because that is
 * what the setting is for.
 */
export const MAX_DISPLAY_SCALE = 1.1;
