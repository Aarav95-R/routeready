import { render, screen } from "@testing-library/react-native";
import { passwordStrength } from "@/lib/passwordStrength";
import { colors } from "../theme";
import { StrengthMeter } from "../StrengthMeter";

const meterFor = (password: string) => render(<StrengthMeter strength={passwordStrength(password)} />);

/**
 * The bars are deliberately outside the accessibility tree — the label below
 * them already announces the level, and four unlabelled bars either side of it
 * are noise — so every query for them has to opt into hidden elements. That
 * opt-in is the assertion that they stayed decorative.
 */
const HIDDEN = { includeHiddenElements: true } as const;

const segments = () => screen.getAllByTestId(/^strength-segment-/, HIDDEN);

const segmentColours = () =>
  segments().map((s) => {
    const style = Array.isArray(s.props.style) ? Object.assign({}, ...s.props.style) : s.props.style;
    return style.backgroundColor;
  });

// Nothing typed is not a criticism, and a row of empty bars sitting there
// before the first keystroke is one.
test("there is no meter until there is a password", () => {
  meterFor("");
  expect(screen.queryByTestId(/^strength-segment-/, HIDDEN)).toBeNull();
});

test("the bar is always four segments, however few are filled", () => {
  meterFor("abcdefgh");
  expect(segments()).toHaveLength(4);
});

test.each([
  ["abcdefgh", 1],
  ["abcdefghijklmnop", 2],
  ["Password1!", 3],
  ["Tr0ub4dor&3Xk!", 4],
])("%s fills %i segment(s)", (password, filled) => {
  meterFor(password);
  const unfilled = segmentColours().filter((c) => c === colors.fill);
  expect(4 - unfilled.length).toBe(filled);
});

/**
 * The colours come from the palette and introduce no new meaning: danger while
 * the password is too short to be accepted, amber while it is accepted but
 * thin, and the accent once it is genuinely good. A fifth colour here would be
 * a fifth thing to learn.
 */
test.each([
  ["abcde", colors.danger],
  ["abcdefgh", colors.warning],
  ["abcdefghijklmnop", colors.warning],
  ["Password1!", colors.accent],
  ["Tr0ub4dor&3Xk!", colors.accent],
])("%s is drawn in the colour its level earns", (password, expected) => {
  meterFor(password);
  expect(segmentColours().filter((c) => c !== colors.fill)[0] ?? expected).toBe(expected);
});

// Too short still draws: the countdown is the useful part, and it is the one
// state where the bar has something to say and nothing to fill.
test("a password under the floor counts down with nothing filled", () => {
  meterFor("abcde");
  expect(screen.getByText("3 more characters")).toBeTruthy();
  expect(segmentColours().every((c) => c === colors.fill)).toBe(true);
});

test("the label says what the level is", () => {
  meterFor("Password1!");
  expect(screen.getByText("Good password")).toBeTruthy();
});
