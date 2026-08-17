import { fireEvent, render, screen } from "@testing-library/react-native";
import { DriveModeRow } from "../DriveModeRow";

const setup = (over: Partial<React.ComponentProps<typeof DriveModeRow>> = {}) =>
  render(
    <DriveModeRow
      mode="practice" title="Practice drive" description="Guided the whole way."
      onPress={() => {}}
      {...over}
    />
  );

test("says what the mode is and what it does", () => {
  setup();
  expect(screen.getByText("Practice drive")).toBeTruthy();
  expect(screen.getByText("Guided the whole way.")).toBeTruthy();
});

test("the tint is the mode's own, so the two rows are told apart before they are read", () => {
  setup();
  expect(screen.getByTestId("mode-icon-practice")).toBeTruthy();
  expect(screen.queryByTestId("mode-icon-test")).toBeNull();
});

test("history is shown when the route has any", () => {
  setup({ mode: "test", title: "Mock test", history: "You've taken this twice — your best is 82" });
  expect(screen.getByText("You've taken this twice — your best is 82")).toBeTruthy();
});

// A learner with no attempts should not be told off for it — the line is
// dropped rather than replaced with an empty state.
test("no history means no line at all", () => {
  setup({ mode: "test", history: null });
  expect(screen.queryByText(/your best is/)).toBeNull();
});

test("pressing the row hands back to the caller", () => {
  const onPress = jest.fn();
  setup({ onPress });
  fireEvent.press(screen.getByText("Practice drive"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
