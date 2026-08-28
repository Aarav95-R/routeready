import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockParams: { email?: string; type?: string } = { email: "sam@example.com", type: "signup" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import Verify from "../../../app/(auth)/verify";
import { useSession } from "@/stores/sessionStore";

const verifyCode = jest.fn();
const resendCode = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.email = "sam@example.com";
  mockParams.type = "signup";
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

/**
 * Trace: tap 1 sends, tap 2 (before the first answers) also sends. Tap 1
 * resolves and clears the code. Tap 2 then resolves into `max_frequency`'s
 * 60s window and reports "Too many tries", which overwrites the notice —
 * a successful resend told as a failure, with the typed digits wiped, on a
 * screen someone only reached because something already went wrong. The
 * guard exists so the second tap never reaches `resendCode` at all.
 */
// The subtitle already says "We've sent a six-digit code…", so the notice
// this guards is matched by its exact sentence rather than a loose /sent/i.
const NOTICE = "Sent. Check your email again.";

test("a double-tapped resend does not report success as failure", async () => {
  let resolveFirst: (value: string | null) => void = () => {};
  resendCode.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));
  render(<Verify />);
  const button = screen.getByRole("button", { name: "Send a new code" });

  fireEvent.press(button);
  fireEvent.press(button);
  expect(resendCode).toHaveBeenCalledTimes(1);

  resolveFirst(null);
  expect(await screen.findByText(NOTICE)).toBeTruthy();
  expect(screen.queryByText(/too many tries/i)).toBeNull();
});

// "Sent." is a claim about the past the moment typing resumes — leaving it up
// while a new code is being typed says something that is no longer true.
test("typing after a resend clears the stale notice", async () => {
  render(<Verify />);
  fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
  await screen.findByText(NOTICE);

  type("4");
  expect(screen.queryByText(NOTICE)).toBeNull();
});

/**
 * `type` arrives as a route param and the `routeready` URL scheme is still
 * registered, so a crafted deep link can put any string there. It must not
 * reach `verifyCode`/`resendCode` unvalidated — this is the screen boundary
 * that narrows it, falling back to the same default a bare push uses.
 */
test("an unrecognised type param falls back to signup rather than reaching the store raw", async () => {
  mockParams.type = "javascript:alert(1)";
  render(<Verify />);
  type("418302");
  await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("sam@example.com", "418302", "signup"));
});
