import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace }),
}));

import { useSession } from "@/stores/sessionStore";
import DeleteAccount from "../../../app/delete-account";

const signedInAs = (email: string) =>
  useSession.setState({
    session: { user: { id: "u1", email, user_metadata: {} } } as never,
    initialized: true,
  });

/** The destructive button on the confirmation the screen just raised. */
const confirmButton = (spy: jest.SpyInstance) => {
  const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  return buttons.find((b) => b.text === "Delete")!;
};

let deleteAccount: jest.Mock;

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  signedInAs("sumeetraheja@yahoo.com");
  deleteAccount = jest.fn().mockResolvedValue(null);
  useSession.setState({ deleteAccount });
});

// On a shared phone the one thing worth being certain of before tapping a red
// button is *which* account is about to go.
test("the account about to be deleted is named on the screen", () => {
  render(<DeleteAccount />);
  expect(screen.getByText("sumeetraheja@yahoo.com")).toBeTruthy();
});

// A list a person can check against what they think they have. The alert
// cannot do this job — it is four lines and it is read in a hurry.
test("what goes is spelled out before anything can be tapped", () => {
  render(<DeleteAccount />);
  expect(screen.getByText("Your email and name")).toBeTruthy();
  expect(screen.getByText("Every mock test")).toBeTruthy();
  expect(screen.getByText("Your favourite routes")).toBeTruthy();
});

test("the screen says plainly that it cannot be undone", () => {
  render(<DeleteAccount />);
  expect(screen.getByText(/can't undo this/i)).toBeTruthy();
});

// One tap must never delete an account.
test("the button asks before it does anything", () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));

  expect(spy).toHaveBeenCalled();
  expect(deleteAccount).not.toHaveBeenCalled();
  spy.mockRestore();
});

test("the confirmation offers Cancel first and Delete as destructive", () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));

  const [, , buttons] = spy.mock.calls[0] as [string, string, { text: string; style?: string }[]];
  expect(buttons.map((b) => b.text)).toEqual(["Cancel", "Delete"]);
  expect(buttons[1].style).toBe("destructive");
  spy.mockRestore();
});

test("confirming deletes the account", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));
  await act(async () => { confirmButton(spy).onPress!(); });

  await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
  spy.mockRestore();
});

// The root layout redirects the moment `session` goes null. A router call
// racing that effect is how you get two navigations for one tap — the same
// reason the sign-out button navigates nowhere either.
test("a successful deletion navigates nowhere itself", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));
  await act(async () => { confirmButton(spy).onPress!(); });

  await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  spy.mockRestore();
});

// The asymmetry, at the screen. Nothing was destroyed, so nothing about the
// screen may suggest otherwise.
test("a failed deletion stays on the screen and says what happened", async () => {
  deleteAccount.mockResolvedValue(
    "Deleting your account needs a connection. Nothing has been removed — try again when you're back online."
  );
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));
  await act(async () => { confirmButton(spy).onPress!(); });

  expect(await screen.findByText(/nothing has been removed/i)).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
  spy.mockRestore();
});

// A second tap while the first is in flight would raise a second alert over
// a deletion already happening.
test("the button cannot be pressed twice while it is working", async () => {
  let release: (v: string | null) => void = () => {};
  deleteAccount.mockReturnValue(new Promise<string | null>((r) => { release = r; }));
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));
  await act(async () => { confirmButton(spy).onPress!(); });

  await waitFor(() => expect(screen.getByText("Deleting…")).toBeTruthy());
  fireEvent.press(screen.getByTestId("delete-account-button"));
  expect(spy).toHaveBeenCalledTimes(1);

  release(null);
  spy.mockRestore();
});

// A retry has to be possible: the failure it is most likely to hit is a train
// going into a tunnel.
test("a failure leaves the button usable for another go", async () => {
  deleteAccount.mockResolvedValue("Your account could not be deleted, and nothing has been removed.");
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DeleteAccount />);

  fireEvent.press(screen.getByText("Delete my account"));
  await act(async () => { confirmButton(spy).onPress!(); });
  await screen.findByText(/nothing has been removed/i);

  fireEvent.press(screen.getByText("Delete my account"));
  expect(spy).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});

test("the back control returns to the account screen", () => {
  render(<DeleteAccount />);
  fireEvent.press(screen.getByLabelText("Back"));
  expect(mockBack).toHaveBeenCalled();
});

/**
 * Deleting the Supabase account does nothing to an Apple subscription — Apple
 * owns that, and it renews whether or not the account it was bought for still
 * exists. Somebody who deletes expecting the billing to stop with it finds out
 * a month later, by being charged. The warning belongs on the screen rather
 * than in the confirmation alert, for the reason this screen exists at all:
 * nobody reads an alert.
 */
test("the screen says deleting does not cancel the subscription", () => {
  signedInAs("sumeet.raheja@yahoo.com");
  render(<DeleteAccount />);
  expect(
    screen.getByText(/Deleting your account does not cancel your subscription/),
  ).toBeTruthy();
});
