// @gorhom/bottom-sheet is not globally mocked (jest.setup.js has no entry for
// it) and the real library needs native measurement that jsdom cannot give
// it. practiceScreen.test.tsx and mockScreen.test.tsx each declare this same
// file-level mock for that reason; this is that shape, extended with the
// backdrop export PaywallSheet renders. See task-7-sheet-notes.md: Jest
// cannot see sheet position either way, mocked or not.
jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  const { forwardRef } = require("react");
  const Sheet = forwardRef(({ children }: any, _ref: any) => <View>{children}</View>);
  Sheet.displayName = "BottomSheet";
  return {
    __esModule: true,
    default: Sheet,
    BottomSheetView: View,
    BottomSheetBackdrop: () => null,
  };
});

jest.mock("@/services/purchases", () => ({
  offers: jest.fn().mockResolvedValue([
    { plan: "weekly", priceString: "£3.00" },
    { plan: "monthly", priceString: "£9.00" },
  ]),
}));

import { Linking } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { PaywallSheet } from "../PaywallSheet";
import { offers } from "@/services/purchases";
import { useEntitlement } from "@/stores/entitlement";

const props = {
  visible: true, centreName: "Wood Green", lockedCount: 9,
  testWindow: "two_weeks" as const, onDismiss: jest.fn(),
};

test("shows prices from the store, never our own numerals", async () => {
  const { getByText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("£3.00")).toBeTruthy());
  expect(getByText("£9.00")).toBeTruthy();
});

test("names the centre in the headline", async () => {
  const { getByText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("Nine more routes at Wood Green")).toBeTruthy());
});

test("a two-week test window pre-selects weekly", async () => {
  const { getByLabelText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByLabelText("Weekly plan").props.accessibilityState.selected).toBe(true));
});

test("buying calls the store with the selected plan", async () => {
  const purchase = jest.fn().mockResolvedValue(null);
  useEntitlement.setState({ purchase } as never);
  const { getByText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("£3.00")).toBeTruthy());
  fireEvent.press(getByText("Unlock all routes"));
  await waitFor(() => expect(purchase).toHaveBeenCalledWith("weekly"));
});

test("a failed purchase shows the sentence and leaves the sheet open", async () => {
  const purchase = jest.fn().mockResolvedValue("That didn't go through. Nothing has been charged.");
  const onDismiss = jest.fn();
  useEntitlement.setState({ purchase } as never);
  const { getByText } = render(<PaywallSheet {...props} onDismiss={onDismiss} />);
  await waitFor(() => expect(getByText("£3.00")).toBeTruthy());
  fireEvent.press(getByText("Unlock all routes"));
  await waitFor(() => expect(getByText("That didn't go through. Nothing has been charged.")).toBeTruthy());
  expect(onDismiss).not.toHaveBeenCalled();
});

test("restore is always offered", async () => {
  const { getByText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("Restore purchases")).toBeTruthy());
});

test("pressing Restore purchases calls the store's restore", async () => {
  const restore = jest.fn().mockResolvedValue(null);
  useEntitlement.setState({ restore } as never);
  const { getByText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("£3.00")).toBeTruthy());
  fireEvent.press(getByText("Restore purchases"));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
});

test("Terms and Privacy are offered and open the real routeready-site pages", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
  const { getByText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("£3.00")).toBeTruthy());

  expect(getByText("Terms")).toBeTruthy();
  expect(getByText("Privacy")).toBeTruthy();

  fireEvent.press(getByText("Terms"));
  expect(openURL).toHaveBeenCalledWith("https://aarav95-r.github.io/routeready-site/terms.html");

  fireEvent.press(getByText("Privacy"));
  expect(openURL).toHaveBeenCalledWith("https://aarav95-r.github.io/routeready-site/privacy.html");

  openURL.mockRestore();
});

test("offers() resolving to nothing — today's real behaviour, before Task 10 — disables the CTA", async () => {
  (offers as jest.Mock).mockResolvedValueOnce([]);
  const { getByText, getByLabelText } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("Prices unavailable")).toBeTruthy());
  expect(getByLabelText("Unlock all routes").props.accessibilityState.disabled).toBe(true);
});

// The two below pin the reset-on-reopen behaviour. The sheet is kept mounted
// by its caller and reopened, so without an explicit reset a second opening
// would inherit the first's chosen plan and its failed-purchase sentence.
// Nothing asserted them until now, which made the effect doing the resetting
// unsafe to touch.
test("reopening restores the test window's default plan, not the last one picked", async () => {
  const { getByLabelText, rerender } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByLabelText("Weekly plan").props.accessibilityState.selected).toBe(true));

  fireEvent.press(getByLabelText("Monthly plan"));
  await waitFor(() => expect(getByLabelText("Monthly plan").props.accessibilityState.selected).toBe(true));

  rerender(<PaywallSheet {...props} visible={false} />);
  rerender(<PaywallSheet {...props} visible />);

  await waitFor(() => expect(getByLabelText("Weekly plan").props.accessibilityState.selected).toBe(true));
});

test("reopening clears the previous attempt's failure", async () => {
  const message = "That didn't go through. Nothing has been charged.";
  useEntitlement.setState({ purchase: jest.fn().mockResolvedValue(message) } as never);
  const { getByText, queryByText, rerender } = render(<PaywallSheet {...props} />);
  await waitFor(() => expect(getByText("£3.00")).toBeTruthy());

  fireEvent.press(getByText("Unlock all routes"));
  await waitFor(() => expect(getByText(message)).toBeTruthy());

  rerender(<PaywallSheet {...props} visible={false} />);
  rerender(<PaywallSheet {...props} visible />);

  await waitFor(() => expect(queryByText(message)).toBeNull());
});
