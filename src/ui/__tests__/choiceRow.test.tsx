import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChoiceRow } from "../ChoiceRow";
import { colors } from "../theme";

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

const styleOf = (testID: string) => flatten(screen.getByTestId(testID).props.style);

test("an option shows its text", () => {
  render(<ChoiceRow testID="c" text="At least 1.6mm across the central three-quarters" state="idle" />);
  expect(screen.getByText("At least 1.6mm across the central three-quarters")).toBeTruthy();
});

test("tapping an option selects it rather than committing it", () => {
  // A mis-tap on four long options is easy, and a mis-tap that instantly and
  // permanently marks a question wrong is what people close an app over.
  const onPress = jest.fn();
  render(<ChoiceRow testID="c" text="An option" state="idle" onPress={onPress} />);
  fireEvent.press(screen.getByTestId("c"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("a selected option is outlined but not yet coloured as right or wrong", () => {
  render(<ChoiceRow testID="c" text="An option" state="selected" />);
  const style = styleOf("c");
  expect(style.borderColor).toBe(colors.accent);
  expect(style.backgroundColor).toBe(colors.cell);
});

test("the right answer is marked with the accent, not with red", () => {
  render(<ChoiceRow testID="c" text="An option" state="correct" />);
  const style = styleOf("c");
  expect(style.backgroundColor).toBe(colors.accentTint);
  expect(style.borderColor).toBe(colors.accent);
});

test("a wrong pick is marked in danger red, at the moment it is made", () => {
  render(<ChoiceRow testID="c" text="An option" state="wrong" />);
  const style = styleOf("c");
  expect(style.backgroundColor).toBe(colors.dangerTint);
  expect(style.borderColor).toBe(colors.danger);
});

test("the options that were not in play recede rather than disappear", () => {
  render(<ChoiceRow testID="c" text="An option" state="faded" />);
  expect(styleOf("c").opacity).toBeLessThan(1);
});

test("an unanswered option is not faded", () => {
  render(<ChoiceRow testID="c" text="An option" state="idle" />);
  const opacity = styleOf("c").opacity;
  expect(opacity === undefined || opacity === 1).toBe(true);
});

test("a marked option cannot be tapped again", () => {
  // The answer is committed. Re-tapping must not re-score it.
  const onPress = jest.fn();
  render(<ChoiceRow testID="c" text="An option" state="correct" onPress={onPress} />);
  fireEvent.press(screen.getByTestId("c"));
  expect(onPress).not.toHaveBeenCalled();
});

test("a screen reader is told which option is selected, not just that it is a button", () => {
  render(<ChoiceRow testID="c" text="An option" state="selected" />);
  expect(screen.getByTestId("c").props.accessibilityState).toMatchObject({ selected: true });
});

test("colour is not the only thing that says right or wrong", () => {
  // Roughly one man in twelve cannot separate the green fill from the red one.
  render(
    <>
      <ChoiceRow testID="right" text="A" state="correct" />
      <ChoiceRow testID="wrong" text="B" state="wrong" />
    </>,
  );
  expect(screen.getByLabelText("Correct answer")).toBeTruthy();
  expect(screen.getByLabelText("Your answer, incorrect")).toBeTruthy();
});
