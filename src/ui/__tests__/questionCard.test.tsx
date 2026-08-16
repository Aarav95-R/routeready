import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChoiceRow, QuestionCard } from "../QuestionCard";

test("a card asks its question and explains why", () => {
  render(<QuestionCard title="Where are you testing?" subtitle="We'll open on that centre's routes." />);
  expect(screen.getByText("Where are you testing?")).toBeTruthy();
  expect(screen.getByText("We'll open on that centre's routes.")).toBeTruthy();
});

test("a row states its choice and any detail under it", () => {
  render(<ChoiceRow label="Roundabouts" sub="Mini, multi-lane and spiral" selected={false} onPress={() => {}} />);
  expect(screen.getByText("Roundabouts")).toBeTruthy();
  expect(screen.getByText("Mini, multi-lane and spiral")).toBeTruthy();
});

test("pressing a row reports it", () => {
  const onPress = jest.fn();
  render(<ChoiceRow testID="r" label="Roundabouts" selected={false} onPress={onPress} />);
  fireEvent.press(screen.getByTestId("r"));
  expect(onPress).toHaveBeenCalled();
});

// A radio and a checkbox are announced differently and behave differently to
// assistive tech. A multi-select that reports itself as a radio tells a screen
// reader user their first choice was replaced.
test("a row announces whether it is one-of or any-of", () => {
  const { rerender } = render(<ChoiceRow testID="r" label="Roundabouts" selected onPress={() => {}} />);
  expect(screen.getByTestId("r").props.accessibilityRole).toBe("radio");
  rerender(<ChoiceRow testID="r" label="Roundabouts" selected multi onPress={() => {}} />);
  expect(screen.getByTestId("r").props.accessibilityRole).toBe("checkbox");
});

test("a row carries its selected state for assistive tech", () => {
  render(<ChoiceRow testID="r" label="Roundabouts" selected onPress={() => {}} />);
  expect(screen.getByTestId("r").props.accessibilityState).toMatchObject({ checked: true });
});

test("only a chosen row shows its tick", () => {
  const { rerender } = render(<ChoiceRow testID="r" label="Roundabouts" selected onPress={() => {}} />);
  expect(screen.getByTestId("choice-tick")).toBeTruthy();
  rerender(<ChoiceRow testID="r" label="Roundabouts" selected={false} onPress={() => {}} />);
  expect(screen.queryByTestId("choice-tick")).toBeNull();
});
