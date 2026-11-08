import { Alert, Linking } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));

// Settings renders the paywall sheet for the not-subscribed case, and the real
// @gorhom/bottom-sheet needs native measurement jsdom cannot give it. Same
// file-level mock paywallSheet.test.tsx declares, for the same reason.
jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  const { forwardRef } = require("react");
  const Sheet = forwardRef(({ children }: any, _ref: any) => <View>{children}</View>);
  Sheet.displayName = "BottomSheet";
  return { __esModule: true, default: Sheet, BottomSheetView: View, BottomSheetBackdrop: () => null };
});

jest.mock("@/services/purchases", () => ({
  offers: jest.fn().mockResolvedValue([
    { plan: "weekly", priceString: "£2.99" },
    { plan: "monthly", priceString: "£9.99" },
  ]),
}));

import { useSession } from "@/stores/sessionStore";
import { useDevPreview } from "@/stores/devPreview";
import { useEntitlement } from "@/stores/entitlement";
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

/** The stores' own actions, put back after any test that stands in for them. */
const realSignOut = useSession.getState().signOut;
const realRestore = useEntitlement.getState().restore;

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  signedInAs("sumeet.raheja@yahoo.com");
  useDevPreview.setState({ firstRun: false });
  useSession.setState({ signOut: realSignOut });
  useEntitlement.setState({
    status: "unknown", product: null, renewsAt: null, restore: realRestore,
  });
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
  // Confirming now moves the button into its busy state as well as calling the
  // store, so the press is a render the test has to own.
  act(() => { confirmButton(spy).onPress!(); });

  await waitFor(() => expect(useSession.getState().session).toBeNull());
  spy.mockRestore();
});

/**
 * Signing out is never instant — the store tells the server first and waits up
 * to SIGN_OUT_GRACE_MS for an answer — and that wait is time somebody spends
 * looking at this screen. Until now the button spent it looking untouched: no
 * spinner, no label change, nothing disabled, because `void signOut()` threw
 * the promise away. Against an Auth service answering in tens of seconds, a
 * button that sits there unchanged is one people tap again, and again.
 */
test("the sign-out button says it is working while it waits", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  let finish!: () => void;
  useSession.setState({ signOut: () => new Promise<void>((resolve) => { finish = resolve; }) });

  render(<Settings />);
  fireEvent.press(screen.getByText("Sign out"));
  act(() => { confirmButton(spy).onPress!(); });

  const button = await screen.findByTestId("sign-out-button");
  expect(screen.getByText("Signing out…")).toBeTruthy();
  expect(button).toBeDisabled();

  await act(async () => { finish(); });
  spy.mockRestore();
});

// A second tap while the first is still in flight must not start a second
// sign-out — the alert is raised by the same press handler the spinner is
// meant to be refusing.
test("a busy sign-out button refuses another tap", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  let finish!: () => void;
  const signOut = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  useSession.setState({ signOut });

  render(<Settings />);
  fireEvent.press(screen.getByText("Sign out"));
  act(() => { confirmButton(spy).onPress!(); });
  await screen.findByText("Signing out…");

  fireEvent.press(screen.getByTestId("sign-out-button"));

  expect(spy).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledTimes(1);

  await act(async () => { finish(); });
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

// ── The subscription group ────────────────────────────────────────────────
//
// Settings renders the paywall sheet for the not-subscribed case, and the
// sheet needs @gorhom/bottom-sheet, which the real library cannot give under
// jsdom. Same file-level mock paywallSheet.test.tsx declares, for the same
// reason. See task-7-sheet-notes.md.

test("an active subscription shows its plan and renewal date", async () => {
  useEntitlement.setState({
    status: "active", product: "routeready_monthly", renewsAt: "2026-10-12T00:00:00Z",
  });
  render(<Settings />);
  expect(await screen.findByText("Monthly")).toBeTruthy();
  expect(screen.getByText("Renews 12 October")).toBeTruthy();
});

// The live product identifier really is capitalised this way, and cannot be
// renamed — so this is the string Settings will actually be handed.
test("a capitalised store identifier still reads as a plan name", async () => {
  useEntitlement.setState({
    status: "active", product: "Routeready_weekly", renewsAt: "2026-10-12T00:00:00Z",
  });
  render(<Settings />);
  expect(await screen.findByText("Weekly")).toBeTruthy();
});

test("a subscriber is sent to the App Store to manage it", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
  useEntitlement.setState({
    status: "active", product: "routeready_monthly", renewsAt: "2026-10-12T00:00:00Z",
  });
  render(<Settings />);
  fireEvent.press(await screen.findByText("Manage subscription"));
  expect(openURL).toHaveBeenCalledWith("https://apps.apple.com/account/subscriptions");
  openURL.mockRestore();
});

test("a non-subscriber is offered the way in", async () => {
  useEntitlement.setState({ status: "lapsed", product: null, renewsAt: null });
  render(<Settings />);
  expect(await screen.findByText("Unlock all routes")).toBeTruthy();
});

/**
 * App Review requires restore to be findable whether or not the person is
 * currently subscribed — somebody reinstalling has no subscription *on this
 * device*, which is the entire case restore exists for.
 */
test("restore is offered in both states", async () => {
  useEntitlement.setState({ status: "lapsed", product: null, renewsAt: null });
  const lapsed = render(<Settings />);
  expect(await lapsed.findByText("Restore purchases")).toBeTruthy();
  lapsed.unmount();

  useEntitlement.setState({
    status: "active", product: "routeready_monthly", renewsAt: "2026-10-12T00:00:00Z",
  });
  const active = render(<Settings />);
  expect(await active.findByText("Restore purchases")).toBeTruthy();
});

test("restore reports when there is nothing to restore", async () => {
  const restore = jest.fn().mockResolvedValue("No subscription found on this Apple ID.");
  useEntitlement.setState({ status: "lapsed", product: null, renewsAt: null, restore } as never);
  render(<Settings />);
  fireEvent.press(await screen.findByText("Restore purchases"));
  await waitFor(() =>
    expect(screen.getByText("No subscription found on this Apple ID.")).toBeTruthy());
});

test("a successful restore says nothing rather than reporting an error", async () => {
  const restore = jest.fn().mockResolvedValue(null);
  useEntitlement.setState({ status: "lapsed", product: null, renewsAt: null, restore } as never);
  render(<Settings />);
  fireEvent.press(await screen.findByText("Restore purchases"));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("No subscription found on this Apple ID.")).toBeNull();
});
