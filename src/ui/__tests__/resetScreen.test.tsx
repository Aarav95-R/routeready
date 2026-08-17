import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }) }));

import Reset from "../../../app/(auth)/reset";
import { useSession } from "@/stores/sessionStore";

const sendPasswordReset = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  sendPasswordReset.mockResolvedValue(null);
  useSession.setState({ sendPasswordReset } as never);
});

const ask = (email = "sam@example.com") => {
  fireEvent.changeText(screen.getByLabelText("Email address"), email);
  fireEvent.press(screen.getByRole("button", { name: "Send the link" }));
};

test("it asks Supabase for a reset link", async () => {
  render(<Reset />);
  ask("  sam@example.com ");
  await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith("sam@example.com"));
});

/**
 * The sent state replaces the form rather than annotating it. The old sign-up
 * screen put its success message in the same slot as its error, under four
 * fields still holding a password, where it read as a failure.
 */
test("once sent, the form is gone and the next step is named", async () => {
  render(<Reset />);
  ask();
  expect(await screen.findByText(/check your inbox/i)).toBeTruthy();
  expect(screen.queryByLabelText("Email address")).toBeNull();
});

test("the address it went to is repeated back, so a typo is visible", async () => {
  render(<Reset />);
  ask("sam@example.com");
  expect(await screen.findByText(/sam@example\.com/)).toBeTruthy();
});

test("a refused request states the reason and keeps the form", async () => {
  sendPasswordReset.mockResolvedValue("Too many tries just now. Give it a minute and go again.");
  render(<Reset />);
  ask();
  expect(await screen.findByText(/give it a minute/i)).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
});

test("nothing is sent to an empty address", () => {
  render(<Reset />);
  fireEvent.press(screen.getByRole("button", { name: "Send the link" }));
  expect(sendPasswordReset).not.toHaveBeenCalled();
});

test("there is a way back to signing in", () => {
  render(<Reset />);
  fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(mockBack).toHaveBeenCalled();
});
