import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: mockPush }),
}));

jest.mock("@/services/centresRepo", () => ({
  listCentres: jest.fn().mockResolvedValue({
    stale: false,
    data: [
      { id: "c-1", name: "Mitcham", address: "London CR4", lat: 0, lng: 0, pass_rate: null, test_types: [], region: null },
      { id: "c-2", name: "Croydon", address: "London CR0", lat: 0, lng: 0, pass_rate: null, test_types: [], region: null },
    ],
  }),
}));

// Only `appleAvailable` is reached from this screen; the sheets are the
// store's business, and the store is stubbed below.
jest.mock("@/lib/socialAuth", () => ({ appleAvailable: jest.fn().mockResolvedValue(false), googleConfigured: () => true }));
jest.mock("expo-apple-authentication", () => {
  const { Pressable, Text } = require("react-native");
  return {
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Continue with Apple" onPress={onPress}>
        <Text>Continue with Apple</Text>
      </Pressable>
    ),
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

import SignUp from "../../../app/(auth)/sign-up";
import { useSession } from "@/stores/sessionStore";
import { appleAvailable } from "@/lib/socialAuth";

const signUp = jest.fn();
const signInWithProvider = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  signUp.mockResolvedValue(null);
  signInWithProvider.mockResolvedValue(null);
  // Off unless a test is about it — see the note in signInScreen.test.tsx.
  (appleAvailable as jest.Mock).mockResolvedValue(false);
  useSession.setState({ signUp, signInWithProvider } as never);
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

// The screen used to end on its own "Check your inbox" panel. There is now a
// code to type, so the flow continues on the verify screen instead of stopping.
test("a created account goes to the code screen", async () => {
  render(<SignUp />);
  await answerEverything();
  fillCredentials();
  fireEvent.press(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(auth)/verify",
    params: { email: "sam@example.com", type: "signup" },
  }));
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

/**
 * ── The account card's other door ─────────────────────────────────────────
 *
 * The interview comes first for everybody, provider or not. That is the whole
 * reason these buttons live on card 5 rather than only on the sign-in screen:
 * a social sign-up answers the same four questions, and the answers ride along
 * on the same `toMetadata` call a password sign-up uses.
 */
describe("continuing with a provider", () => {
  beforeEach(() => {
    signInWithProvider.mockResolvedValue(null);
    (appleAvailable as jest.Mock).mockResolvedValue(true);
  });

  test("the interview's answers go with the provider sign-in", async () => {
    render(<SignUp />);
    await answerEverything();

    fireEvent.press(await screen.findByLabelText("Continue with Apple"));
    await waitFor(() => expect(signInWithProvider).toHaveBeenCalledWith("apple", {
      home_centre_id: "c-1",
      test_window: "not_booked",
      experience: "ready",
      focus: ["roundabout"],
    }));
  });

  // A name typed on this card outranks whatever the provider offers, and it
  // travels the same way every other answer does.
  test("a name typed on the card travels with the answers", async () => {
    render(<SignUp />);
    await answerEverything();
    fireEvent.changeText(screen.getByLabelText("First name (optional)"), "Sam");

    fireEvent.press(await screen.findByLabelText("Continue with Google"));
    await waitFor(() =>
      expect(signInWithProvider).toHaveBeenCalledWith("google", expect.objectContaining({ full_name: "Sam" })),
    );
  });

  /**
   * A password sign-up has a code to enter, so `create` pushes to the verify
   * screen. A provider hands back a live session instead, and the root layout
   * is what acts on that — so this path navigates nowhere itself.
   */
  test("a provider sign-up does not route to the code screen", async () => {
    render(<SignUp />);
    await answerEverything();

    fireEvent.press(await screen.findByLabelText("Continue with Apple"));
    await waitFor(() => expect(signInWithProvider).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a refused provider sign-up states the reason on the card", async () => {
    signInWithProvider.mockResolvedValue("That sign-in didn't go through. Try again, or use your email.");
    render(<SignUp />);
    await answerEverything();

    fireEvent.press(await screen.findByLabelText("Continue with Google"));
    expect(await screen.findByText(/didn't go through/)).toBeTruthy();
  });

  // Cancelling is not failing, here as on the sign-in screen: the store
  // reports it as null, the same as success, and the card says nothing.
  test("changing your mind leaves the card as it was", async () => {
    render(<SignUp />);
    await answerEverything();

    fireEvent.press(await screen.findByLabelText("Continue with Google"));
    await waitFor(() => expect(signInWithProvider).toHaveBeenCalled());
    expect(screen.queryByText(/didn't/)).toBeNull();
  });
});
