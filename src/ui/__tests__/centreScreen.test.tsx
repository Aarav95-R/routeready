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

import { fireEvent, render } from "@testing-library/react-native";
import { listCentres } from "@/services/centresRepo";
import { listFavouriteRouteIds } from "@/services/favouritesRepo";
import { listProgressByCentre } from "@/services/progressRepo";
import { listRoutesByCentre } from "@/services/routesRepo";
import { useEntitlement } from "@/stores/entitlement";
import type { Centre, Route } from "@/types/db";
import CentreDetail from "../../../app/centre/[id]";

const mockListCentres = listCentres as jest.MockedFunction<typeof listCentres>;
const mockListRoutes = listRoutesByCentre as jest.MockedFunction<typeof listRoutesByCentre>;
const mockListProgress = listProgressByCentre as jest.MockedFunction<typeof listProgressByCentre>;
const mockListFavourites = listFavouriteRouteIds as jest.MockedFunction<typeof listFavouriteRouteIds>;

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

test("tapping a locked route opens the paywall instead of the route", async () => {
  const { findByLabelText, findByText } = render(<CentreDetail />);
  fireEvent.press(await findByLabelText(/Alexandra/i));
  expect(await findByText(/more routes at/)).toBeTruthy();
  expect(mockRouterPush).not.toHaveBeenCalled();
});

// The PaywallSheet test double (matching paywallSheet.test.tsx) renders its
// content regardless of the `visible` prop, so the assertion above alone
// cannot distinguish "opened the sheet" from "the sheet was always in the
// tree". This is the assertion that actually distinguishes a locked tap from
// a free one: the free route must still reach the drive screen.
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
