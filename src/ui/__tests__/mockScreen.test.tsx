import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { LatLng } from "@/lib/geo";
import type { Route } from "@/types/db";

jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));
jest.mock("expo-location", () => require("../../test/locationMock"));
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
const mockKeepAwake = jest.fn();
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => mockKeepAwake() }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));
jest.mock("@gorhom/bottom-sheet", () => {
  const { View, ScrollView } = require("react-native");
  const { forwardRef } = require("react");
  const Sheet = forwardRef(({ children }: any, _ref: any) => <View>{children}</View>);
  Sheet.displayName = "BottomSheet";
  return { __esModule: true, default: Sheet, BottomSheetScrollView: ScrollView };
});

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }),
}));

const mockGetRoute = jest.fn();
jest.mock("@/services/routesRepo", () => ({ getRoute: (...a: unknown[]) => mockGetRoute(...a) }));

const mockFetchDirections = jest.fn();
jest.mock("@/services/directions", () => ({ fetchDirections: (...a: unknown[]) => mockFetchDirections(...a) }));

import { emitFix, resetLocationMock, setLastKnownPosition } from "../../test/locationMock";
import { buildNavSteps } from "@/lib/navsteps";
import { useMockTest } from "@/stores/mockTestStore";
import Mock from "../../../app/route/[id]/mock";

// The same closed rectangle the practice suite drives — see the note there on
// why a rectangle rather than an out-and-back line.
const side = (from: LatLng, to: LatLng, n: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({
    lat: from.lat + ((to.lat - from.lat) * (i + 1)) / n,
    lng: from.lng + ((to.lng - from.lng) * (i + 1)) / n,
  }));

const A = { lat: 51.500, lng: -0.100 };
const B = { lat: 51.500, lng: -0.090 };
const C = { lat: 51.508, lng: -0.090 };
const D = { lat: 51.508, lng: -0.100 };
const LOOP: LatLng[] = [A, ...side(A, B, 10), ...side(B, C, 10), ...side(C, D, 10), ...side(D, A, 10)];

const osrm = (p: LatLng, type: string, name = "Test Road", distance = 200) =>
  ({ name, distance, maneuver: { type, location: [p.lng, p.lat] as [number, number] } });

const route: Route = {
  id: "route-1", centre_id: "centre-1", name: "Route 3 · Sandpit Lane",
  geometry: { type: "LineString", coordinates: LOOP.map((p) => [p.lng, p.lat]) },
  estimated_minutes: 14, distance_km: 4.2, difficulty: 3,
  speed_profile: [], observation_zones: [],
  steps: buildNavSteps([osrm(A, "depart"), osrm(B, "turn"), osrm(A, "arrive", "", 0)]),
};

const APPROACH_LL: LatLng[] = side({ lat: 51.4980, lng: -0.100 }, A, 12);
const approach = {
  coords: APPROACH_LL,
  steps: buildNavSteps([osrm(APPROACH_LL[0], "depart"), osrm(A, "arrive", "", 0)]),
  distanceM: 220,
};

const drive = async (path: LatLng[]) => {
  for (const p of path) {
    await act(async () => { emitFix(p.lat, p.lng, 10); });
  }
};

beforeEach(() => {
  resetLocationMock();
  mockReplace.mockClear();
  useMockTest.getState().reset();
  mockGetRoute.mockResolvedValue({ data: { route, hazards: [] }, stale: false });
  mockFetchDirections.mockResolvedValue(approach);
});

const mount = async () => {
  render(<Mock />);
  await waitFor(() => expect(screen.getByText("Route 3 · Sandpit Lane")).toBeTruthy());
};

test("arriving at the start asks, and marks nothing until it is answered", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });
  await drive(APPROACH_LL);

  expect(screen.getByText("You're at the start line")).toBeTruthy();
  expect(screen.getByText("Begin mock test")).toBeTruthy();
  // Nothing is scored against a driver who has not been told the test began.
  expect(useMockTest.getState().phase).toBe("idle");
  expect(useMockTest.getState().samples).toHaveLength(0);
});

test("the test begins only once the driver says so", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });
  await drive(APPROACH_LL);
  await act(async () => { fireEvent.press(screen.getByText("Begin mock test")); });

  expect(useMockTest.getState().phase).toBe("running");
  expect(screen.queryByText("You're at the start line")).toBeNull();
});

// A loop's finish is its start, so a radius-only check would score the test
// before the car had moved.
test("standing on the start line does not end the test", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Start")); });
  await drive([A, A, A]);

  expect(mockReplace).not.toHaveBeenCalled();
  expect(useMockTest.getState().phase).toBe("running");
});

test("closing the loop scores the test and shows the result, with no tap", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Start")); });
  await drive(LOOP);

  expect(useMockTest.getState().phase).toBe("finished");
  expect(useMockTest.getState().result).not.toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/route/route-1/result");
});

// routeComplete stays true once it is true, and the watch fires several times
// a second: without a latch this scores the test again and stacks the result
// screen on itself.
test("sitting at the finish scores the test exactly once", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Start")); });
  await drive([...LOOP, A, A, A, A]);

  expect(mockReplace).toHaveBeenCalledTimes(1);
});

// A mock test runs for tens of minutes with the phone mounted and untouched,
// which is exactly the condition iOS auto-lock exists to end. The assertion is on
// the hook rather than on any pixel because there is nothing on screen to look at:
// a released wake lock looks identical right up until the display goes black.
test("the screen is held awake for the length of the drive", async () => {
  mockKeepAwake.mockClear();
  await mount();

  expect(mockKeepAwake).toHaveBeenCalled();
});

// A deviation is written to user_progress - a server table, keyed to a user
// id, holding rows that outlive the drive. It used to carry the raw GPS fix
// the driver was sitting at, which is a real position off any public route,
// linked to a named account, that nothing ever read back: the result screen
// uses the count and skippedM and nothing else. atIdx indexes the route's own
// published geometry and is what a map pin would be drawn from, so it stays.
//
// Asserted on the exact key set rather than on the two absent names, so that
// a future field carrying a position cannot be added without this failing.
test("leaving the route records no GPS position, because none is ever read", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByText("Start")); });

  // Along the first side, three fixes well clear of it, then back on.
  await drive(side(A, B, 6));
  await drive([
    { lat: 51.4975, lng: -0.0955 },
    { lat: 51.4972, lng: -0.0950 },
    { lat: 51.4970, lng: -0.0945 },
  ]);
  await drive([{ lat: 51.5, lng: -0.094 }, { lat: 51.5, lng: -0.0935 }]);

  const [deviation] = useMockTest.getState().deviations;
  expect(deviation).toBeDefined();
  expect(Object.keys(deviation).sort()).toEqual(["atIdx", "seconds", "skippedM"]);
});
