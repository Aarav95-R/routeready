import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }) }));

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
  fireEvent.press(screen.getByRole("button", { name: "Send the code" }));
};

test("it asks Supabase for a reset link", async () => {
  render(<Reset />);
  ask("  sam@example.com ");
  await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith("sam@example.com"));
});

// The screen no longer has a terminal "check your inbox" state — the code has
// to be typed somewhere, and that somewhere is the verify screen.
test("once sent it goes to the code screen, carrying the address", async () => {
  render(<Reset />);
  ask("sam@example.com");
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(auth)/verify",
    params: { email: "sam@example.com", type: "recovery" },
  }));
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
  fireEvent.press(screen.getByRole("button", { name: "Send the code" }));
  expect(sendPasswordReset).not.toHaveBeenCalled();
});

test("there is a way back to signing in", () => {
  render(<Reset />);
  fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(mockBack).toHaveBeenCalled();
});
