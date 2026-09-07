jest.mock("expo-apple-authentication", () => {
  const { Pressable, Text } = require("react-native");
  return {
    // Stands in for the native button, which renders nothing under test. The
    // real one takes the same three props this asserts on.
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Continue with Apple" onPress={onPress}>
        <Text>Continue with Apple</Text>
      </Pressable>
    ),
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});
jest.mock("@/lib/socialAuth", () => ({ appleAvailable: jest.fn(), googleConfigured: jest.fn(() => true) }));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { appleAvailable, googleConfigured } from "@/lib/socialAuth";
import { SocialAuthButtons } from "../SocialAuthButtons";

const available = appleAvailable as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  available.mockResolvedValue(true);
  (googleConfigured as jest.Mock).mockReturnValue(true);
});

test("both providers are offered on a device that supports Apple", async () => {
  render(<SocialAuthButtons onPress={jest.fn()} busy={null} />);
  await waitFor(() => expect(screen.getByLabelText("Continue with Apple")).toBeTruthy());
  expect(screen.getByLabelText("Continue with Google")).toBeTruthy();
});

/**
 * The Apple button is drawn only once the device has said it can honour it —
 * false on Android, and on iOS below 13. Google is not gated on that, so the
 * screen never ends up with an empty divider under it.
 */
test("a device that cannot do Apple still gets Google", async () => {
  available.mockResolvedValue(false);
  render(<SocialAuthButtons onPress={jest.fn()} busy={null} />);

  await waitFor(() => expect(screen.getByLabelText("Continue with Google")).toBeTruthy());
  expect(screen.queryByLabelText("Continue with Apple")).toBeNull();
});

test("tapping a provider says which one", async () => {
  const onPress = jest.fn();
  render(<SocialAuthButtons onPress={onPress} busy={null} />);

  await waitFor(() => expect(screen.getByLabelText("Continue with Google")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Continue with Google"));
  expect(onPress).toHaveBeenCalledWith("google");

  fireEvent.press(screen.getByLabelText("Continue with Apple"));
  expect(onPress).toHaveBeenCalledWith("apple");
});

/**
 * One sheet at a time. Both buttons refuse while either is in flight —
 * opening Google's sheet on top of Apple's would leave two exchanges racing
 * for the same session, and the loser would set a session over the winner's.
 */
test("neither button fires while a sheet is already open", async () => {
  const onPress = jest.fn();
  render(<SocialAuthButtons onPress={onPress} busy="apple" />);

  await waitFor(() => expect(screen.getByLabelText("Continue with Google")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Continue with Google"));
  expect(onPress).not.toHaveBeenCalled();
});

test("the provider being waited on is the one showing a spinner", async () => {
  render(<SocialAuthButtons onPress={jest.fn()} busy="google" />);
  await waitFor(() => expect(screen.getByTestId("google-spinner")).toBeTruthy());
});

/**
 * The check is asynchronous and the screen it sits on can be left before it
 * answers — a `setState` on an unmounted component is the classic way that
 * shows up as a warning in a log nobody reads.
 */
test("an answer arriving after the screen is gone sets nothing", async () => {
  let answer: (v: boolean) => void = () => {};
  available.mockReturnValueOnce(new Promise<boolean>((r) => { answer = r; }));

  const view = render(<SocialAuthButtons onPress={jest.fn()} busy={null} />);
  view.unmount();
  await act(async () => { answer(true); });
});

/**
 * ── A door the build cannot open ──────────────────────────────────────────
 *
 * Google's config plugin is left out of `app.config.js` when the iOS client
 * ID is absent — it validates that option and throws, so including it would
 * break every build made before the console setup was finished. A build
 * without the plugin has no URL scheme for the sheet's result and cannot do
 * Google sign-in at all, so the button is withheld rather than left to fail
 * on the far side of a sheet.
 */
test("a build without Google credentials does not offer Google", async () => {
  (googleConfigured as jest.Mock).mockReturnValue(false);
  render(<SocialAuthButtons onPress={jest.fn()} busy={null} />);

  await waitFor(() => expect(screen.getByLabelText("Continue with Apple")).toBeTruthy());
  expect(screen.queryByLabelText("Continue with Google")).toBeNull();
});
