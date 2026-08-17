import { fireEvent, render, screen } from "@testing-library/react-native";
import { WelcomeBanner } from "@/ui/WelcomeBanner";
import { colors } from "@/ui/theme";

const noop = () => {};

test("it says the account is ready rather than repeating the greeting", () => {
  render(<WelcomeBanner onBrowse={noop} onDismiss={noop} />);
  expect(screen.getByText("You're all set up")).toBeTruthy();
  // The large title above already said "Welcome, <name>".
  expect(screen.queryByText(/^Welcome/)).toBeNull();
});

test("its action is the way to the centres list", () => {
  const onBrowse = jest.fn();
  render(<WelcomeBanner onBrowse={onBrowse} onDismiss={noop} />);
  fireEvent.press(screen.getByText("Browse test centres"));
  expect(onBrowse).toHaveBeenCalledTimes(1);
});

test("it can be put away without going to centres", () => {
  const onDismiss = jest.fn();
  render(<WelcomeBanner onBrowse={noop} onDismiss={onDismiss} />);
  fireEvent.press(screen.getByLabelText("Dismiss welcome"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

// Green is the road; clay is you. A just-created account is about the person,
// and a second green button here would compete with the one in the card below
// for the same glance.
test("it is clay rather than green, so it does not compete with Start here", () => {
  render(<WelcomeBanner onBrowse={noop} onDismiss={noop} />);
  expect(screen.getByTestId("welcome-action")).toHaveStyle({ backgroundColor: colors.clay });
  expect(screen.getByTestId("welcome-banner")).toHaveStyle({ backgroundColor: colors.clayTint });
});
