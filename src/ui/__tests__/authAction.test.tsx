import { fireEvent, render, screen } from "@testing-library/react-native";
import { AuthAction } from "../AuthAction";

const action = (props: Partial<React.ComponentProps<typeof AuthAction>> = {}) =>
  render(<AuthAction label="Sign in" onPress={jest.fn()} {...props} />);

test("it presses", () => {
  const onPress = jest.fn();
  action({ onPress });
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(onPress).toHaveBeenCalled();
});

test("a disabled action does nothing, and says so to a screen reader", () => {
  const onPress = jest.fn();
  action({ onPress, enabled: false });
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(onPress).not.toHaveBeenCalled();
  expect(screen.getByRole("button").props.accessibilityState).toMatchObject({ disabled: true });
});

/**
 * Busy is not the same as disabled, even though both refuse the tap. The label
 * changes to say what is happening and a spinner reports that something still
 * is — a button that only greys out looks like it failed.
 */
test("while busy it says what it is doing and refuses a second tap", () => {
  const onPress = jest.fn();
  action({ onPress, busy: true, busyLabel: "Signing in…" });
  expect(screen.getByText("Signing in…")).toBeTruthy();
  expect(screen.getByTestId("action-spinner")).toBeTruthy();
  fireEvent.press(screen.getByRole("button"));
  expect(onPress).not.toHaveBeenCalled();
});

test("there is no spinner when there is nothing to wait for", () => {
  action();
  expect(screen.queryByTestId("action-spinner")).toBeNull();
});
