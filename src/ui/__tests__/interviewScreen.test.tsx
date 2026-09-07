import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";

jest.mock("@/services/centresRepo", () => ({
  listCentres: jest.fn().mockResolvedValue({
    stale: false,
    data: [
      { id: "c-1", name: "Mitcham", address: "London CR4", lat: 0, lng: 0, pass_rate: null, test_types: [], region: null },
      { id: "c-2", name: "Croydon", address: "London CR0", lat: 0, lng: 0, pass_rate: null, test_types: [], region: null },
    ],
  }),
}));

import Interview from "../../../app/(auth)/interview";
import { useSession } from "@/stores/sessionStore";

const saveInterview = jest.fn();
const signOut = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  saveInterview.mockResolvedValue(null);
  useSession.setState({ saveInterview, signOut } as never);
});

/** All four cards, leaving the flow on the last one with an answer chosen. */
const answerEverything = async () => {
  fireEvent.press(await screen.findByText("Mitcham"));
  fireEvent.press(await screen.findByText("Not booked yet"));
  fireEvent.press(await screen.findByText("Nearly ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));
  return screen.findByRole("button", { name: "Finish" });
};

test("it opens on the first question", async () => {
  render(<Interview />);
  expect(await screen.findByText("Where are you taking it?")).toBeTruthy();
});

/**
 * Four cards, not five. There is no account to make here — the person is
 * already signed in, which is the whole reason this screen exists — so the
 * last card finishes rather than continuing to a credentials form.
 */
test("it is four cards and the last one finishes", async () => {
  render(<Interview />);
  expect(await screen.findByText("1/4")).toBeTruthy();
  await answerEverything();
  expect(screen.getByText("4/4")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("finishing writes every answer under its stored name", async () => {
  render(<Interview />);
  fireEvent.press(await answerEverything());

  await waitFor(() => expect(saveInterview).toHaveBeenCalledWith({
    home_centre_id: "c-1",
    test_window: "not_booked",
    experience: "ready",
    focus: ["roundabout"],
  }));
});

/**
 * No name is written. The account already has one — Apple or Google supplied
 * it at sign-in — and `toMetadata` omits a blank rather than writing "", so
 * finishing this screen cannot blank out the greeting on Home.
 */
test("finishing does not overwrite the name the provider gave", async () => {
  render(<Interview />);
  fireEvent.press(await answerEverything());

  await waitFor(() => expect(saveInterview).toHaveBeenCalled());
  expect(saveInterview.mock.calls[0][0]).not.toHaveProperty("full_name");
});

/**
 * Nothing navigates. The written answers change `session`, which closes the
 * gate in `nextAuthRoute`, and the root layout moves them on — the same rule
 * every other auth screen follows.
 */
test("a finished interview navigates nowhere itself", async () => {
  render(<Interview />);
  fireEvent.press(await answerEverything());
  await waitFor(() => expect(saveInterview).toHaveBeenCalled());
  // Nothing to assert against a router because the screen never imports one.
  expect(screen.getByText("4/4")).toBeTruthy();
});

/**
 * The one failure that must never be silent. This write is the only thing
 * that opens the gate, so swallowing it would leave somebody tapping a
 * finished button on a screen that never lets them past, with nothing said.
 */
test("a failed save is stated, and the card stays", async () => {
  saveInterview.mockResolvedValue("No connection. We'll be here when you're back.");
  render(<Interview />);
  fireEvent.press(await answerEverything());

  expect(await screen.findByText(/No connection/)).toBeTruthy();
  expect(screen.getByText("4/4")).toBeTruthy();
});

/**
 * The escape hatch. Somebody whose centre is not on the list would otherwise
 * be held on this screen with no way back — signed in, gated, and unable to
 * reach anything.
 */
test("there is a way out from the first card", async () => {
  render(<Interview />);
  fireEvent.press(await screen.findByLabelText("Sign out"));
  expect(signOut).toHaveBeenCalled();
});

// Past the first card the back arrow is the more useful thing, and they are
// three taps from done.
test("the way out gives way to back once the flow is under way", async () => {
  render(<Interview />);
  fireEvent.press(await screen.findByText("Mitcham"));
  await screen.findByText("When's your test?");

  expect(screen.queryByLabelText("Sign out")).toBeNull();
  expect(screen.getByLabelText("Back")).toBeTruthy();
});

test("going back keeps what was already answered", async () => {
  render(<Interview />);
  fireEvent.press(await screen.findByText("Mitcham"));
  await screen.findByText("When's your test?");

  fireEvent.press(screen.getByLabelText("Back"));
  await screen.findByText("Where are you taking it?");
  expect(screen.getByRole("radio", { name: /Mitcham/ }).props.accessibilityState).toMatchObject({ checked: true });
});

/**
 * Android's hardware back is swallowed on the first card rather than passed
 * on. Sign-up lets it through there, because behind sign-up is the sign-in
 * screen; behind this one is nothing, so letting it through would close the
 * app on somebody who is signed in and one gate short of using it.
 */
test("Android's hardware back walks the cards and never closes the app", async () => {
  const add = jest.spyOn(BackHandler, "addEventListener");
  render(<Interview />);
  fireEvent.press(await screen.findByText("Mitcham"));
  await screen.findByText("When's your test?");

  // Re-read each time: the handler closes over the current step, so the screen
  // re-registers on every move.
  const press = () => (add.mock.calls.at(-1)?.[1] as () => boolean)();

  expect(press()).toBe(true);
  expect(await screen.findByText("Where are you taking it?")).toBeTruthy();

  // On the first card it is still swallowed — there is nowhere behind this.
  expect(press()).toBe(true);
  add.mockRestore();
});
