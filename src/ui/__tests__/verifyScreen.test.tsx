import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ email: "sam@example.com", type: "signup" }),
}));

import Verify from "../../../app/(auth)/verify";
import { useSession } from "@/stores/sessionStore";

const verifyCode = jest.fn();
const resendCode = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  verifyCode.mockResolvedValue(null);
  resendCode.mockResolvedValue(null);
  useSession.setState({ verifyCode, resendCode } as never);
});

const type = (code: string) =>
  fireEvent.changeText(screen.getByLabelText("Verification code"), code);

test("the address the code went to is on screen", () => {
  render(<Verify />);
  expect(screen.getByText(/sam@example\.com/)).toBeTruthy();
});

/**
 * Six digits is the whole form. Making somebody reach for a separate button
 * after the last digit is a tap that carries no information.
 */
test("a full code verifies without a further tap", async () => {
  render(<Verify />);
  type("418302");
  await waitFor(() =>
    expect(verifyCode).toHaveBeenCalledWith("sam@example.com", "418302", "signup"));
});

test("an incomplete code verifies nothing", () => {
  render(<Verify />);
  type("4183");
  expect(verifyCode).not.toHaveBeenCalled();
});

test("a refused code says why and keeps the digits on screen", async () => {
  verifyCode.mockResolvedValue("That code isn't right. Check the email and try again.");
  render(<Verify />);
  type("418302");
  expect(await screen.findByText(/isn't right/i)).toBeTruthy();
  expect(screen.getByTestId("code-box-0")).toHaveTextContent("4");
});

// Two verifies for one code is a wasted attempt against the rate limit, and
// the second one always fails — the first spent the code.
test("a code in flight is not sent twice", async () => {
  verifyCode.mockReturnValue(new Promise(() => {}));
  render(<Verify />);
  type("418302");
  type("418302");
  await waitFor(() => expect(verifyCode).toHaveBeenCalledTimes(1));
});

test("a new code can be asked for", async () => {
  render(<Verify />);
  fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
  await waitFor(() => expect(resendCode).toHaveBeenCalledWith("sam@example.com", "signup"));
});

test("a refused resend states the reason", async () => {
  resendCode.mockResolvedValue("Too many tries just now. Give it a minute and go again.");
  render(<Verify />);
  fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
  expect(await screen.findByText(/give it a minute/i)).toBeTruthy();
});
