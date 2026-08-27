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

import { emitFix, failPositionWatch, resetLocationMock, setCurrentPosition, setLastKnownPosition } from "../../test/locationMock";
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
    await act(async () => { emitFix(p.lat, p.lng, { speedMps: 0 }); });
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

/**
 * Mount, wait until the car is actually on the start line, then begin.
 *
 * The preview card only offers "Start" once the last known position has
 * arrived and put the driver there; until then it offers "Guide me to the
 * start". mount() waits on the route name, which lands first, so reading the
 * button straight off the tree is a race - and one that only loses under
 * full-suite parallelism, which is why three tests here passed in isolation
 * and failed about one full run in five together.
 *
 * The practice suite hit exactly this and fixed it with a waitFor of its own;
 * this is the same fix, and the two should stay in step.
 */
const beginAtStart = async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  await drive([A, A, A]);
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Begin route" })); });
};

test("live preview arrival asks, and marks nothing until it is answered", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();

  await drive([A, A, A]);

  expect(screen.getByText("Ready to begin?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Begin route" })).toBeTruthy();
  // Nothing is scored against a driver who has not been told the test began.
  expect(useMockTest.getState().phase).toBe("idle");
  expect(useMockTest.getState().samples).toHaveLength(0);
});

test("the test begins only once the driver says so", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();

  await drive([A, A, A]);
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Begin route" })); });

  expect(useMockTest.getState().phase).toBe("running");
  expect(screen.queryByText("Ready to begin?")).toBeNull();
});

test("a delayed Begin refreshes the start fix before starting", async () => {
  await mount();
  await drive([A, A, A]);
  setCurrentPosition(A.lat, A.lng);
  const now = Date.now();
  const dateSpy = jest.spyOn(Date, "now").mockReturnValue(now + 10_000);
  try {
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Begin route" })); });
  } finally {
    dateSpy.mockRestore();
  }

  expect(useMockTest.getState().phase).toBe("running");
});

test("moving away from the confirmed start prevents Begin", async () => {
  await mount();
  await drive([A, A, A]);
  await drive([B]);

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Begin route" })); });

  expect(useMockTest.getState().phase).toBe("idle");
});

test("a live location failure stops the mock flow with a clear recovery message", async () => {
  await mount();

  await act(async () => { failPositionWatch("location unavailable"); });

  expect(screen.getByText("Location access is needed to mark a mock test.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry location" })).toBeTruthy();
  expect(useMockTest.getState().phase).toBe("idle");
});

test("retrying a watch failure resumes an active test lifecycle", async () => {
  await beginAtStart();
  await act(async () => { failPositionWatch("location unavailable"); });
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Retry location" })); });

  await drive([...LOOP, A, A]);

  expect(screen.getByRole("button", { name: "End route" })).toBeTruthy();
});

// A loop's finish is its start, so a radius-only check would score the test
// before the car had moved.
test("standing on the start line does not end the test", async () => {
  await beginAtStart();
  await drive([A, A, A]);

  expect(mockReplace).not.toHaveBeenCalled();
  expect(useMockTest.getState().phase).toBe("running");
});

test("inaccurate fixes never become mock-test evidence or advance completion", async () => {
  await beginAtStart();

  for (const p of LOOP) {
    await act(async () => { emitFix(p.lat, p.lng, { speedMps: 0, accuracyM: 80 }); });
  }

  expect(useMockTest.getState().samples).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "End route" })).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("closing the loop waits for an explicit end before showing the result", async () => {
  await beginAtStart();
  await drive([...LOOP, A, A]);

  expect(useMockTest.getState().phase).toBe("running");
  expect(useMockTest.getState().result).toBeNull();
  expect(screen.getByRole("button", { name: "End route" })).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "End route" })); });
  expect(mockReplace).toHaveBeenCalledWith("/route/route-1/result");
});

// routeComplete stays true once it is true, and the watch fires several times
// a second: without a latch this scores the test again and stacks the result
// screen on itself.
test("sitting at the finish scores the test exactly once", async () => {
  await beginAtStart();
  await drive([...LOOP, A, A]);
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "End route" })); });
  await drive([A, A, A, A]);

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
  await beginAtStart();

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

test("a large forward rejoin searches the full route and clears recovery", async () => {
  await beginAtStart();
  await drive(side(A, B, 5));
  await drive([
    { lat: 51.4975, lng: -0.0955 },
    { lat: 51.4972, lng: -0.0950 },
    { lat: 51.4970, lng: -0.0945 },
  ]);
  await drive([LOOP[39], LOOP[40]]);

  expect(screen.queryByText("Off route")).toBeNull();
  expect(useMockTest.getState().deviations).toHaveLength(1);
  expect(screen.getByTestId("source:trail").props.shape.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(40);
});

test("finishing while still off route flushes the open deviation", async () => {
  await beginAtStart();
  await drive(side(A, B, 6));
  await drive([
    { lat: 51.4975, lng: -0.0955 },
    { lat: 51.4972, lng: -0.0950 },
    { lat: 51.4970, lng: -0.0945 },
  ]);

  await act(async () => { fireEvent.press(screen.getByText("Finish test")); });

  expect(useMockTest.getState().deviations).toHaveLength(1);
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
