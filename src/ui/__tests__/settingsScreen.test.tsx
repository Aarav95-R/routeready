import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));

import { useSession } from "@/stores/sessionStore";
import { useDevPreview } from "@/stores/devPreview";
import Settings from "../../../app/settings";

const signedInAs = (email: string, full_name?: string) =>
  useSession.setState({
    session: { user: { id: "u1", email, user_metadata: full_name ? { full_name } : {} } } as never,
    initialized: true,
  });

/** The destructive button on the confirmation the screen just raised. */
const confirmButton = (spy: jest.SpyInstance) => {
  const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  return buttons.find((b) => b.text === "Sign out")!;
};

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  signedInAs("sumeet.raheja@yahoo.com");
  useDevPreview.setState({ firstRun: false });
});

test("the account you are about to leave is named on the screen", () => {
  render(<Settings />);
  expect(screen.getByText("sumeet.raheja@yahoo.com")).toBeTruthy();
  expect(screen.getByTestId("account-monogram")).toHaveTextContent("SR");
});

// An address with no name in it must not produce a monogram of digits.
test("an address with no initials to take shows a person instead", () => {
  signedInAs("123456@example.com");
  render(<Settings />);
  expect(screen.queryByTestId("account-monogram")).toBeNull();
  expect(screen.getByTestId("account-icon")).toBeTruthy();
});

test("the build you are running is on the screen", () => {
  render(<Settings />);
  expect(screen.getByText("1.0.0")).toBeTruthy();
});

// One tap must not end the session — the door locks behind you.
test("signing out asks before it does anything", () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<Settings />);

  fireEvent.press(screen.getByText("Sign out"));

  expect(spy).toHaveBeenCalled();
  expect(useSession.getState().session).not.toBeNull();
  spy.mockRestore();
});

test("confirming ends the session", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<Settings />);

  fireEvent.press(screen.getByText("Sign out"));
  confirmButton(spy).onPress!();

  await waitFor(() => expect(useSession.getState().session).toBeNull());
  spy.mockRestore();
});

// The confirmation is the last thing standing between a learner and their
// account, so its wording is behaviour, not decoration.
test("the confirmation says what is and is not lost", () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<Settings />);

  fireEvent.press(screen.getByText("Sign out"));

  const [, message, buttons] = spy.mock.calls[0] as [string, string, { text: string; style?: string }[]];
  expect(message).toMatch(/stay on your account/);
  expect(buttons.map((b) => b.text)).toEqual(["Cancel", "Sign out"]);
  expect(buttons[1].style).toBe("destructive");
  spy.mockRestore();
});

// A typed name beats anything guessable from an address.
test("a name on the account supplies the monogram", () => {
  signedInAs("sumeetraheja@yahoo.com", "Sumeet Raheja");
  render(<Settings />);
  expect(screen.getByTestId("account-monogram")).toHaveTextContent("SR");
});

test("the name already on the account is what the field shows", () => {
  signedInAs("a@b.com", "Sumeet Raheja");
  render(<Settings />);
  expect(screen.getByTestId("name-field").props.value).toBe("Sumeet Raheja");
});

// This is the only way an account made before sign-up asked for a name can
// ever get one.
test("a name typed here is saved to the account", async () => {
  const setName = jest.fn().mockResolvedValue(null);
  useSession.setState({ setName });
  render(<Settings />);

  fireEvent.changeText(screen.getByTestId("name-field"), "Sumeet");
  fireEvent(screen.getByTestId("name-field"), "blur");

  await waitFor(() => expect(setName).toHaveBeenCalledWith("Sumeet"));
});

// Typing and leaving without changing anything must not write.
test("leaving the field untouched saves nothing", () => {
  const setName = jest.fn().mockResolvedValue(null);
  signedInAs("a@b.com", "Sumeet");
  useSession.setState({ setName });
  render(<Settings />);

  fireEvent(screen.getByTestId("name-field"), "blur");
  expect(setName).not.toHaveBeenCalled();
});

test("a name that fails to save says so and puts the field back", async () => {
  const setName = jest.fn().mockResolvedValue("Network request failed");
  signedInAs("a@b.com", "Sumeet");
  useSession.setState({ setName });
  render(<Settings />);

  fireEvent.changeText(screen.getByTestId("name-field"), "Sumeet Raheja");
  fireEvent(screen.getByTestId("name-field"), "blur");

  expect(await screen.findByText("Network request failed")).toBeTruthy();
  expect(screen.getByTestId("name-field").props.value).toBe("Sumeet");
});

test("the back control returns to where you came from", () => {
  render(<Settings />);
  fireEvent.press(screen.getByLabelText("Back"));
  expect(mockBack).toHaveBeenCalled();
});

// The first-run home screen is unreachable from an account that has driven
// anything, which is every account belonging to whoever is building it. This
// is the way back to it, and it exists only in a development build.
test("a development build can turn the first-run screen back on", () => {
  render(<Settings />);
  fireEvent.press(screen.getByTestId("preview-first-run"));
  expect(useDevPreview.getState().firstRun).toBe(true);
});

// Deletion lives on its own screen, not behind an alert raised from here. The
// consequences need reading, and an alert is not a place anybody reads.
test("the way to delete the account is on this screen", () => {
  render(<Settings />);
  expect(screen.getByText("Delete account")).toBeTruthy();
});

test("deleting opens its own screen rather than acting from here", () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<Settings />);

  fireEvent.press(screen.getByText("Delete account"));

  expect(mockPush).toHaveBeenCalledWith("/delete-account");
  expect(spy).not.toHaveBeenCalled();
  expect(useSession.getState().session).not.toBeNull();
  spy.mockRestore();
});
