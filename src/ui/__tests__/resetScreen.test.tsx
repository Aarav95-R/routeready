import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

// eslint-disable-next-line import/first
import Reset from "../../../app/(auth)/reset";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";

const sendPasswordReset = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ sendPasswordReset } as never);
});

test("it asks for the address and nothing else", () => {
  render(<Reset />);
  expect(screen.getByText("Reset your password.")).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("sending swaps the form for a confirmation", async () => {
  sendPasswordReset.mockResolvedValue(null);
  render(<Reset />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.press(screen.getByText("Send reset link"));
  expect(await screen.findByText("Reset link sent")).toBeTruthy();
  await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith("a@b.com"));
  expect(screen.queryByLabelText("Email address")).toBeNull();
});

// A confirmation that appears under a still-filled form reads as an error.
// The form must be gone, not merely annotated.
test("a failure keeps the form and states the reason", async () => {
  sendPasswordReset.mockResolvedValue("Too many emails just now. Wait a minute, then try again.");
  render(<Reset />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.press(screen.getByText("Send reset link"));
  expect(await screen.findByText(/Too many emails/)).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
});

test("the action waits for something that could be an address", async () => {
  render(<Reset />);
  fireEvent.press(screen.getByText("Send reset link"));
  await waitFor(() => expect(sendPasswordReset).not.toHaveBeenCalled());
});
