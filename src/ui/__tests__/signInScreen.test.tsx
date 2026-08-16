import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Every screen test in this repo mocks expo-router — the real module wants a
// navigation context that a standalone render does not have. `Link` renders
// its children directly: with `asChild` that is the Pressable, and without it
// the string sits inside the Text it was already nested in.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));

// eslint-disable-next-line import/first
import SignIn from "../../../app/(auth)/sign-in";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";

const signIn = jest.fn();
const sendMagicLink = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ signIn, sendMagicLink } as never);
});

const fill = () => {
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
};

test("the screen names itself and offers both ways in", () => {
  render(<SignIn />);
  expect(screen.getByText("Welcome back.")).toBeTruthy();
  expect(screen.getByText("Email me a sign-in link")).toBeTruthy();
  expect(screen.getByText("Forgot your password?")).toBeTruthy();
});

// The store maps the message; the screen must render what it was handed and
// invent nothing.
test("a failed sign-in shows the sentence the store returned", async () => {
  signIn.mockResolvedValue("That email and password don't match. Check the password, or reset it below.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  expect(await screen.findByText(/don't match/)).toBeTruthy();
  expect(screen.queryByText(/Invalid login credentials/)).toBeNull();
});

// Retrying should not require dismissing anything. A stale failure sitting
// under a field you have already corrected reads as a second failure.
test("typing again clears the failure", async () => {
  signIn.mockResolvedValue("That email and password don't match. Check the password, or reset it below.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  await screen.findByText(/don't match/);
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter3");
  expect(screen.queryByText(/don't match/)).toBeNull();
});

// Defect 8: `notice` was never cleared, so a magic-link success sat under a
// later failure.
test("a sign-in failure clears an earlier magic-link notice", async () => {
  sendMagicLink.mockResolvedValue(null);
  signIn.mockResolvedValue("That email and password don't match. Check the password, or reset it below.");
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Email me a sign-in link"));
  await screen.findByText(/Check your email/);
  fireEvent.press(screen.getByText("Sign in"));
  await screen.findByText(/don't match/);
  expect(screen.queryByText(/Check your email/)).toBeNull();
});

test("the button reports itself busy and cannot be pressed twice", async () => {
  let release: (v: string | null) => void = () => {};
  signIn.mockReturnValue(new Promise((r) => { release = r; }));
  render(<SignIn />);
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  expect(await screen.findByText("Signing in…")).toBeTruthy();
  fireEvent.press(screen.getByText("Signing in…"));
  expect(signIn).toHaveBeenCalledTimes(1);
  await act(async () => { release(null); });
});

// Nothing should be submittable that cannot succeed.
test("the action waits for something worth submitting", async () => {
  render(<SignIn />);
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() => expect(signIn).not.toHaveBeenCalled());
  fill();
  fireEvent.press(screen.getByText("Sign in"));
  await waitFor(() => expect(signIn).toHaveBeenCalledWith("a@b.com", "hunter2hunter2"));
});
