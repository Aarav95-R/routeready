import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { DifficultyPips } from "../DifficultyPips";

test("Button fires onPress and renders title", () => {
  const onPress = jest.fn();
  render(<Button title="Start practice" onPress={onPress} />);
  fireEvent.press(screen.getByText("Start practice"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("Button disabled does not fire", () => {
  const onPress = jest.fn();
  render(<Button title="Go" onPress={onPress} disabled />);
  fireEvent.press(screen.getByText("Go"));
  expect(onPress).not.toHaveBeenCalled();
});

test("SegmentedControl selects segment", () => {
  const onChange = jest.fn();
  render(
    <SegmentedControl options={["Nearest", "Pass rate"]} selectedIndex={0} onChange={onChange} />
  );
  fireEvent.press(screen.getByText("Pass rate"));
  expect(onChange).toHaveBeenCalledWith(1);
});

test("DifficultyPips renders 5 pips with level filled", () => {
  render(<DifficultyPips level={3} />);
  expect(screen.getAllByTestId(/^pip/)).toHaveLength(5);
  expect(screen.getAllByTestId("pip-filled")).toHaveLength(3);
});
