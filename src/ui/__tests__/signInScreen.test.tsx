import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));

import SignIn from "../../../app/(auth)/sign-in";
import { useSession } from "@/stores/sessionStore";

const signIn = jest.fn();
const sendMagicLink = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  signIn.mockResolvedValue(null);
  sendMagicLink.mockResolvedValue(null);
  useSession.setState({ signIn, sendMagicLink } as never);
});

const fill = (email = "sam@example.com", password = "hunter2hunter2") => {
  fireEvent.changeText(screen.getByLabelText("Email address"), email);
  fireEvent.changeText(screen.getByLabelText("Password"), password);
};

test("it signs in with what was typed, trimmed", async () => {
  render(<SignIn />);
  fill("  sam@example.com  ");
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(signIn).toHaveBeenCalledWith("sam@example.com", "hunter2hunter2"));
});

/**
 * The store maps Supabase's message to a sentence; this asserts the screen
 * renders what it is given rather than reaching for `error.message` itself,
 * which is what it used to do.
 */
test("a refused sign-in states the reason it was given", async () => {
  signIn.mockResolvedValue("That email and password don't match. Try again, or reset your password.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText(/don't match/)).toBeTruthy();
});

// Being told off while you are fixing the thing you were told off about is
// noise.
test("typing again clears the failure", async () => {
  signIn.mockResolvedValue("That email and password don't match. Try again, or reset your password.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText(/don't match/);

  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter3");
  expect(screen.queryByText(/don't match/)).toBeNull();
});

test("the button will not fire twice while the first attempt is in flight", async () => {
  let release: (value: string | null) => void = () => {};
  signIn.mockReturnValue(new Promise<string | null>((r) => { release = r; }));
  render(<SignIn />);
  fill();

  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Signing in…");
  fireEvent.press(screen.getByRole("button", { name: "Signing in…" }));
  expect(signIn).toHaveBeenCalledTimes(1);

  release(null);
});

/**
 * The most serious gap on the old screen. `resetPasswordForEmail` was wired
 * nowhere, so an account whose password was mistyped at sign-up could not be
 * recovered in the app at all — and the magic link, the only way back in, was
 * presented as a convenience rather than as a rescue.
 */
test("there is a way back in when the password is gone", () => {
  render(<SignIn />);
  fireEvent.press(screen.getByRole("button", { name: "Forgot your password?" }));
  expect(mockPush).toHaveBeenCalledWith("/(auth)/reset");
});

test("a sign-in link can be sent instead, and says it was", async () => {
  render(<SignIn />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "sam@example.com");
  fireEvent.press(screen.getByRole("button", { name: "Email me a sign-in link" }));
  await waitFor(() => expect(sendMagicLink).toHaveBeenCalledWith("sam@example.com"));
  expect(await screen.findByText(/check your email/i)).toBeTruthy();
});

test("a link cannot be sent to an empty address", () => {
  render(<SignIn />);
  fireEvent.press(screen.getByRole("button", { name: "Email me a sign-in link" }));
  expect(sendMagicLink).not.toHaveBeenCalled();
});

/**
 * Send a link, then fail a sign-in, and the old screen left the success
 * message sitting under the failure: each handler cleared `error` and neither
 * cleared `notice`.
 */
test("a later failure clears the earlier success message", async () => {
  render(<SignIn />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "sam@example.com");
  fireEvent.press(screen.getByRole("button", { name: "Email me a sign-in link" }));
  await screen.findByText(/check your email/i);

  signIn.mockResolvedValue("That email and password don't match. Try again, or reset your password.");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

  await screen.findByText(/don't match/);
  expect(screen.queryByText(/check your email/i)).toBeNull();
});

test("there is a way to make an account from here", () => {
  render(<SignIn />);
  fireEvent.press(screen.getByRole("button", { name: "Create an account" }));
  expect(mockPush).toHaveBeenCalledWith("/(auth)/sign-up");
});
