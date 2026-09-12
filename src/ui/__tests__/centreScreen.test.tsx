// @gorhom/bottom-sheet needs native measurement jsdom cannot give it, so this
// screen's suite carries the same file-level mock paywallSheet.test.tsx does
// — the PaywallSheet it renders pulls the real library in otherwise.
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
  offers: jest.fn().mockResolvedValue([]),
}));

// A stand-in for the same reason the bottom-sheet mock above exists: this
// suite needs to drive `onSwipeableOpen` directly, not simulate a real pan
// gesture. The two Pressables give each row's swipe-left and swipe-right a
// fixed, addressable testID rather than requiring gesture-handler's actual
// gesture machinery under jsdom.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const { View, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({ testID, onSwipeableOpen, children }: any) => (
      <View>
        <Pressable testID={`${testID}-left`} onPress={() => onSwipeableOpen?.("left")} />
        <Pressable testID={`${testID}-right`} onPress={() => onSwipeableOpen?.("right")} />
        {children}
      </View>
    ),
  };
});

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "c1" }),
}));

jest.mock("@/services/centresRepo", () => ({ listCentres: jest.fn() }));
jest.mock("@/services/routesRepo", () => ({ listRoutesByCentre: jest.fn() }));
jest.mock("@/services/progressRepo", () => ({ listProgressByCentre: jest.fn() }));
jest.mock("@/services/favouritesRepo", () => ({
  listFavouriteRouteIds: jest.fn(),
  toggleFavourite: jest.fn(),
}));

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { listCentres } from "@/services/centresRepo";
import { listFavouriteRouteIds, toggleFavourite } from "@/services/favouritesRepo";
import { listProgressByCentre } from "@/services/progressRepo";
import { listRoutesByCentre } from "@/services/routesRepo";
import { useEntitlement } from "@/stores/entitlement";
import type { Centre, Route } from "@/types/db";
import CentreDetail from "../../../app/centre/[id]";

const mockListCentres = listCentres as jest.MockedFunction<typeof listCentres>;
const mockListRoutes = listRoutesByCentre as jest.MockedFunction<typeof listRoutesByCentre>;
const mockListProgress = listProgressByCentre as jest.MockedFunction<typeof listProgressByCentre>;
const mockListFavourites = listFavouriteRouteIds as jest.MockedFunction<typeof listFavouriteRouteIds>;
const mockToggleFavourite = toggleFavourite as jest.MockedFunction<typeof toggleFavourite>;

const centre: Centre = {
  id: "c1", name: "Wood Green", address: "1 Test Road", lat: 51.6, lng: -0.11,
  pass_rate: 48.2, test_types: ["car"], region: "London",
};

const geometry = {
  type: "LineString" as const,
  coordinates: [[-0.25, 51.6], [-0.24, 51.605], [-0.23, 51.61], [-0.25, 51.6]] as [number, number][],
};

const route = (id: string, name: string, is_free: boolean): Route => ({
  id, centre_id: "c1", name, geometry,
  estimated_minutes: 18, distance_km: 6.2, difficulty: 2,
  speed_profile: [{ startIdx: 0, endIdx: 3, limitMph: 30 }],
  observation_zones: [],
  is_free,
});

const routes: Route[] = [
  route("r1", "Route 1 · Bounds Green loop", true),
  route("r2", "Route 2 · Alexandra Park loop", false),
  route("r3", "Route 3 · Muswell Hill loop", false),
];

beforeEach(() => {
  mockRouterPush.mockClear();
  useEntitlement.setState({ status: "lapsed" } as never);
  mockListCentres.mockResolvedValue({ data: [centre], stale: false });
  mockListRoutes.mockResolvedValue({ data: routes, stale: false });
  mockListProgress.mockResolvedValue({ data: {}, stale: false });
  mockListFavourites.mockResolvedValue([]);
  mockToggleFavourite.mockResolvedValue(undefined);
});

test("locks every route but the free one for a non-subscriber", async () => {
  const { findAllByText } = render(<CentreDetail />);
  expect(await findAllByText("Unlock to drive this route")).toHaveLength(2);
});

test("shows one unlock panel counting what is locked", async () => {
  const { findByText } = render(<CentreDetail />);
  expect(await findByText("2 more routes here")).toBeTruthy();
});

test("a subscriber sees no locks and no panel", async () => {
  useEntitlement.setState({ status: "active" } as never);
  const { queryByText, findByText } = render(<CentreDetail />);
  await findByText("Bounds Green loop");
  expect(queryByText("Unlock to drive this route")).toBeNull();
  expect(queryByText(/more routes here/)).toBeNull();
});

// The PaywallSheet test double (matching paywallSheet.test.tsx) renders its
// content regardless of the `visible` prop, so a headline assertion here
// would be true from the very first render, before any tap — not evidence
// of anything. The assertion that actually distinguishes a locked tap from
// a no-op is that the drive screen was never reached.
test("tapping a locked route opens the paywall instead of the route", async () => {
  const { findByLabelText } = render(<CentreDetail />);
  fireEvent.press(await findByLabelText(/Alexandra/i));
  expect(mockRouterPush).not.toHaveBeenCalled();
});

// Complements the test above: proves the branch actually goes both ways,
// rather than `onOpen` simply never pushing at all.
test("tapping the free route still reaches the drive screen", async () => {
  const { findByLabelText } = render(<CentreDetail />);
  fireEvent.press(await findByLabelText(/Bounds Green/i));
  expect(mockRouterPush).toHaveBeenCalledWith("/route/r1/start");
});

// Both card taps a locked route can receive — the card body and its own
// Start button — must lead to the paywall, never the drive screen. Routes
// render in fixture order (r1 free, r2 and r3 locked), so index 1 is the
// first locked card's Start button.
test("the Start button on a locked route also opens the paywall", async () => {
  const { findAllByText, getAllByText } = render(<CentreDetail />);
  await findAllByText("Unlock to drive this route");
  fireEvent.press(getAllByText("Start")[1]);
  expect(mockRouterPush).not.toHaveBeenCalled();
});

// The swipe-left shortcut reaches the same drive screen the card's own tap
// does, so it owes the same gate — otherwise it would be a way around the
// paywall that never shows up on the card itself.
test("swipe-left on a locked route does not reach the drive screen", async () => {
  const { findByTestId } = render(<CentreDetail />);
  fireEvent.press(await findByTestId("swipe-r2-left"));
  expect(mockRouterPush).not.toHaveBeenCalled();
});

test("swipe-left on the free route still reaches the drive screen", async () => {
  const { findByTestId } = render(<CentreDetail />);
  fireEvent.press(await findByTestId("swipe-r1-left"));
  expect(mockRouterPush).toHaveBeenCalledWith("/route/r1/start");
});

// RouteCard hides the favourite star on a locked route because favouriting a
// route you cannot open is a promise the app cannot keep. The swipe-right
// shortcut owes the same rule: it must not toggle a favourite behind the
// card's back, and it must not open the paywall either — a paywall prompt in
// response to a favourite gesture is a non-sequitur.
test("swipe-right on a locked route does nothing", async () => {
  const { findByTestId } = render(<CentreDetail />);
  fireEvent.press(await findByTestId("swipe-r2-right"));
  expect(mockToggleFavourite).not.toHaveBeenCalled();
  expect(mockRouterPush).not.toHaveBeenCalled();
});

test("swipe-right on the free route still toggles the favourite", async () => {
  const { findByTestId } = render(<CentreDetail />);
  fireEvent.press(await findByTestId("swipe-r1-right"));
  await waitFor(() => expect(mockToggleFavourite).toHaveBeenCalledWith("r1"));
});

