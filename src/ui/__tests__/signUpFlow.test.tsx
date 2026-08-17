import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
}));

jest.mock("@/services/centresRepo", () => ({
  listCentres: jest.fn().mockResolvedValue({
    stale: false,
    data: [
      { id: "c-1", name: "Mitcham", address: "London CR4", lat: 0, lng: 0, pass_rate: null, pass_rate_history: [], test_types: [], region: null },
      { id: "c-2", name: "Croydon", address: "London CR0", lat: 0, lng: 0, pass_rate: null, pass_rate_history: [], test_types: [], region: null },
    ],
  }),
}));

import SignUp from "../../../app/(auth)/sign-up";
import { useSession } from "@/stores/sessionStore";

const signUp = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  signUp.mockResolvedValue(null);
  useSession.setState({ signUp } as never);
});

/** Cards 1–4, leaving the flow on the account card. */
const answerEverything = async () => {
  fireEvent.press(await screen.findByText("Mitcham"));
  fireEvent.press(await screen.findByText("Not booked yet"));
  fireEvent.press(await screen.findByText("Nearly ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));
  fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  return screen.findByText("Almost there.");
};

const fillCredentials = () => {
  fireEvent.changeText(screen.getByLabelText("Email address"), "sam@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
};

test("it opens on a question, not on a form", async () => {
  render(<SignUp />);
  expect(await screen.findByText("Where are you taking it?")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

// `test_centres` grants select to anon, so the list loads with no session —
// which is what makes asking before the account exists possible at all.
test("the centre list arrives without anyone being signed in", async () => {
  render(<SignUp />);
  expect(await screen.findByText("Mitcham")).toBeTruthy();
  expect(screen.getByText("Croydon")).toBeTruthy();
});

test("the centre list is searchable", async () => {
  render(<SignUp />);
  await screen.findByText("Mitcham");
  fireEvent.changeText(screen.getByLabelText("Search test centres"), "croy");
  expect(screen.getByText("Croydon")).toBeTruthy();
  expect(screen.queryByText("Mitcham")).toBeNull();
});

test("a single-answer card moves on by itself", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mitcham"));
  expect(await screen.findByText("When's your test?")).toBeTruthy();
});

/**
 * A card that jumped on the first tap could never take a second, so the
 * weak-spots card waits for the button. This is the difference that makes it
 * the only question card with an action on it.
 */
test("the weak-spots card waits, because two answers are allowed", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mitcham"));
  fireEvent.press(await screen.findByText("Not booked yet"));
  fireEvent.press(await screen.findByText("Nearly ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));

  expect(screen.getByText("What trips you up?")).toBeTruthy();
  fireEvent.press(screen.getByText("Narrow roads"));
  expect(screen.getByRole("checkbox", { name: /Roundabouts/ }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByRole("checkbox", { name: /Narrow roads/ }).props.accessibilityState).toMatchObject({ checked: true });
});

test("a third weak spot pushes the first one off rather than being refused", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mitcham"));
  fireEvent.press(await screen.findByText("Not booked yet"));
  fireEvent.press(await screen.findByText("Nearly ready"));
  await screen.findByText("What trips you up?");

  fireEvent.press(screen.getByText("Roundabouts"));
  fireEvent.press(screen.getByText("Narrow roads"));
  fireEvent.press(screen.getByText("Pedestrian crossings"));

  expect(screen.getByRole("checkbox", { name: /Roundabouts/ }).props.accessibilityState).toMatchObject({ checked: false });
  expect(screen.getByRole("checkbox", { name: /Pedestrian crossings/ }).props.accessibilityState).toMatchObject({ checked: true });
});

test("the weak-spots card will not continue with nothing chosen", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mitcham"));
  fireEvent.press(await screen.findByText("Not booked yet"));
  fireEvent.press(await screen.findByText("Nearly ready"));
  await screen.findByText("What trips you up?");

  fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("What trips you up?")).toBeTruthy();
});

test("going back keeps what was already answered", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mitcham"));
  await screen.findByText("When's your test?");

  fireEvent.press(screen.getByRole("button", { name: "Back" }));
  await screen.findByText("Where are you taking it?");
  expect(screen.getByRole("radio", { name: /Mitcham/ }).props.accessibilityState).toMatchObject({ checked: true });
});

/**
 * Android's hardware back was harmless while sign-up was one form. Once the
 * screen holds four answers, an uncaught press discards all of them.
 */
test("Android's hardware back walks the cards rather than leaving", async () => {
  const add = jest.spyOn(BackHandler, "addEventListener");
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mitcham"));
  await screen.findByText("When's your test?");

  // Re-read it each time: the handler closes over the current step, so the
  // screen re-registers on every move. Holding the first one would be testing
  // a listener the app has already replaced.
  const press = () => (add.mock.calls.at(-1)?.[1] as () => boolean)();

  expect(press()).toBe(true);
  expect(await screen.findByText("Where are you taking it?")).toBeTruthy();

  // On the first card there is nothing to go back to, so the press is left
  // alone and the flow is allowed to close.
  expect(press()).toBe(false);
  add.mockRestore();
});

test("the account card will not submit until both passwords match", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("Email address"), "sam@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(signUp).not.toHaveBeenCalled());

  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(signUp).toHaveBeenCalled());
});

test("there is nothing to confirm until there is a password worth confirming", async () => {
  render(<SignUp />);
  await answerEverything();
  expect(screen.queryByLabelText("Confirm password")).toBeNull();
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  expect(screen.getByLabelText("Confirm password")).toBeTruthy();
});

/**
 * The contract, and the reason this file exists. Everything the four cards
 * collected has to arrive under the names the selectors and Home will look
 * for — this is the one assertion that would catch a renamed key.
 */
test("every answer reaches signUp under its stored name", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("First name (optional)"), "Sam");
  fillCredentials();
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => expect(signUp).toHaveBeenCalledWith("sam@example.com", "hunter2hunter2", {
    full_name: "Sam",
    home_centre_id: "c-1",
    test_window: "not_booked",
    experience: "ready",
    focus: ["roundabout"],
  }));
});

test("success replaces the form rather than annotating it", async () => {
  render(<SignUp />);
  await answerEverything();
  fillCredentials();
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText("Check your inbox")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("a rejected sign-up keeps the form and states the reason", async () => {
  signUp.mockResolvedValue("There's already an account on that email. Sign in instead?");
  render(<SignUp />);
  await answerEverything();
  fillCredentials();
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText(/already an account/)).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
});
