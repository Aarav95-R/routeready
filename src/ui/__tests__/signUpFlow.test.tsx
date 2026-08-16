import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/services/centresRepo", () => ({
  listCentres: jest.fn().mockResolvedValue({
    data: [
      { id: "c-1", name: "Mill Hill", address: "London NW7", lat: 0, lng: 0, pass_rate: null, pass_rate_history: [], test_types: [], region: null },
      { id: "c-2", name: "Barnet", address: "London EN5", lat: 0, lng: 0, pass_rate: null, pass_rate_history: [], test_types: [], region: null },
    ],
    stale: false,
  }),
}));

// eslint-disable-next-line import/first
import SignUp from "../../../app/(auth)/sign-up";
// eslint-disable-next-line import/first
import { useSession } from "@/stores/sessionStore";

const signUp = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  signUp.mockResolvedValue(null);
  useSession.setState({ signUp } as never);
});

/** Cards 1–4, leaving the flow on the account card. */
const answerEverything = async () => {
  fireEvent.press(await screen.findByText("Mill Hill"));
  fireEvent.press(await screen.findByText("Not yet"));
  fireEvent.press(await screen.findByText("Nearly test-ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));
  fireEvent.press(screen.getByText("Continue"));
  return screen.findByText("Last thing.");
};

const fillCredentials = () => {
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
};

test("it opens on the first question, not on a form", async () => {
  render(<SignUp />);
  expect(await screen.findByText("Where are you testing?")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("the centre list is searchable", async () => {
  render(<SignUp />);
  await screen.findByText("Mill Hill");
  fireEvent.changeText(screen.getByLabelText("Search centres"), "barn");
  expect(screen.getByText("Barnet")).toBeTruthy();
  expect(screen.queryByText("Mill Hill")).toBeNull();
});

// Cards 1-3 advance themselves; a multi-select cannot, or a second choice
// would be impossible.
test("choosing a centre moves on by itself", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mill Hill"));
  expect(await screen.findByText("Have you booked it?")).toBeTruthy();
});

test("the weak-spots card waits, because two answers are allowed", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mill Hill"));
  fireEvent.press(await screen.findByText("Not yet"));
  fireEvent.press(await screen.findByText("Nearly test-ready"));
  fireEvent.press(await screen.findByText("Roundabouts"));
  expect(screen.getByText("Roundabouts")).toBeTruthy();
  expect(screen.queryByText("Last thing.")).toBeNull();
});

test("going back keeps what was already answered", async () => {
  render(<SignUp />);
  fireEvent.press(await screen.findByText("Mill Hill"));
  await screen.findByText("Have you booked it?");
  fireEvent.press(screen.getByLabelText("Back"));
  expect(await screen.findByText("Where are you testing?")).toBeTruthy();
  fireEvent.press(screen.getByText("Mill Hill"));
  expect(await screen.findByText("Have you booked it?")).toBeTruthy();
});

test("the account card will not submit until both passwords match", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("Email address"), "a@b.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));
  await waitFor(() => expect(signUp).not.toHaveBeenCalled());
  fireEvent.changeText(screen.getByLabelText("Confirm password"), "hunter2hunter2");
  fireEvent.press(screen.getByText("Create account"));
  await waitFor(() => expect(signUp).toHaveBeenCalled());
});

// The contract, and the reason this file exists. Everything the four cards
// collected must arrive under the names the schema and the selectors expect.
test("every answer reaches signUp under its stored name", async () => {
  render(<SignUp />);
  await answerEverything();
  fireEvent.changeText(screen.getByLabelText("First name (optional)"), "Sumeet");
  fillCredentials();
  fireEvent.press(screen.getByText("Create account"));

  await waitFor(() => expect(signUp).toHaveBeenCalledWith("a@b.com", "hunter2hunter2", {
    full_name: "Sumeet",
    home_centre_id: "c-1",
    test_date: null,
    experience: "ready",
    focus: ["roundabout"],
  }));
});

test("success replaces the form rather than annotating it", async () => {
  render(<SignUp />);
  await answerEverything();
  fillCredentials();
  fireEvent.press(screen.getByText("Create account"));
  expect(await screen.findByText("Check your email")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

test("a rejected sign-up keeps the form and states the reason", async () => {
  signUp.mockResolvedValue("There's already an account with that email. Sign in instead, or reset the password.");
  render(<SignUp />);
  await answerEverything();
  fillCredentials();
  fireEvent.press(screen.getByText("Create account"));
  expect(await screen.findByText(/already an account/)).toBeTruthy();
  expect(screen.getByLabelText("Email address")).toBeTruthy();
});
