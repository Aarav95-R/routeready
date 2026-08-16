import { render, screen } from "@testing-library/react-native";
import { StrengthMeter } from "../StrengthMeter";
import { passwordStrength } from "@/lib/passwordStrength";
import { colors } from "../theme";

const flat = (style: unknown) =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style as object);

test("there are always four segments, however few are earned", () => {
  render(<StrengthMeter strength={passwordStrength("abcdefgh")} />);
  expect(screen.getAllByTestId(/^strength-segment-/)).toHaveLength(4);
});

test("it states the level in words as well as in bars", () => {
  render(<StrengthMeter strength={passwordStrength("abcdefghijkH1!")} />);
  expect(screen.getByText("Strong")).toBeTruthy();
});

test("a short password counts down instead of being scored", () => {
  render(<StrengthMeter strength={passwordStrength("abc")} />);
  expect(screen.getByText("5 more characters")).toBeTruthy();
});

// No new colours enter the palette: danger, warning and accent are the app's
// existing three, used the way DriveModeRow already uses them.
test("the colour is the app's own vocabulary, by level", () => {
  const { rerender } = render(<StrengthMeter strength={passwordStrength("abc")} />);
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.danger);
  rerender(<StrengthMeter strength={passwordStrength("abcdefgh")} />);
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.warning);
  rerender(<StrengthMeter strength={passwordStrength("abcdefghijkH1!")} />);
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.accent);
});

test("an empty field states the rule in the quiet role", () => {
  render(<StrengthMeter strength={passwordStrength("")} />);
  expect(screen.getByText("At least 8 characters")).toBeTruthy();
  expect(flat(screen.getByTestId("strength-label").props.style).color).toBe(colors.labelTertiary);
});

// The bar is advice, not a gate — a screen reader user should hear the advice
// without having to infer it from four unlabelled bars.
test("the meter reports itself to a screen reader", () => {
  render(<StrengthMeter strength={passwordStrength("abcdefgh")} />);
  expect(screen.getByLabelText("Password strength: Weak — add a capital or a number")).toBeTruthy();
});
