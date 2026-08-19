import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { LatLng } from "@/lib/geo";
import type { Route } from "@/types/db";

// Each test drives a real GPS track through the screen a fix at a time, so the
// file runs to about 12 s under full-suite parallelism.
jest.setTimeout(20000);

jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));
jest.mock("expo-location", () => require("../../test/locationMock"));
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));
jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  const { forwardRef } = require("react");
  const Sheet = forwardRef(({ children }: any, _ref: any) => <View>{children}</View>);
  Sheet.displayName = "BottomSheet";
  return { __esModule: true, default: Sheet, BottomSheetView: View };
});

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

const mockGetRoute = jest.fn();
jest.mock("@/services/routesRepo", () => ({ getRoute: (...a: unknown[]) => mockGetRoute(...a) }));

const mockFetchDirections = jest.fn();
jest.mock("@/services/directions", () => ({ fetchDirections: (...a: unknown[]) => mockFetchDirections(...a) }));

import { emitFix, resetLocationMock, setLastKnownPosition } from "../../test/locationMock";
import { buildNavSteps } from "@/lib/navsteps";
import Practice from "../../../app/route/[id]/practice";

// ── A closed loop, driven anticlockwise round a rectangle ──────────────────
//
// A rectangle rather than an out-and-back line: navSnap searches 30 vertices
// either side of the current one, and on a there-and-back route the return
// leg sits inside that window, so a fix can snap onto the wrong half.
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
  steps: buildNavSteps([
    osrm(A, "depart"), osrm(B, "turn"), osrm(C, "turn"), osrm(D, "turn"), osrm(A, "arrive", "", 0),
  ]),
};

// The drive to the start: a short straight run ending on the route's start.
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
  mockBack.mockClear();
  mockGetRoute.mockResolvedValue({ data: { route, hazards: [] }, stale: false });
  mockFetchDirections.mockResolvedValue(approach);
});

const mount = async () => {
  render(<Practice />);
  await waitFor(() => expect(screen.getByText("Route 3 · Sandpit Lane")).toBeTruthy());
};

test("arriving at the start asks rather than setting off on its own", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });
  await drive(APPROACH_LL);

  expect(screen.getByText("You're at the start line")).toBeTruthy();
  expect(screen.getByText("Begin practice drive")).toBeTruthy();
});

test("the drive begins only once the driver says so", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();

  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });
  await drive(APPROACH_LL);
  await act(async () => { fireEvent.press(screen.getByText("Begin practice drive")); });

  expect(screen.queryByText("You're at the start line")).toBeNull();
  expect(screen.getByText("Remaining")).toBeTruthy();
});

// The defect this whole change exists for: a loop's finish IS its start, so a
// radius-only check calls the drive over before the car has moved.
test("standing on the start line does not finish the route", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByText("Start")); });
  await drive([A, A, A]);

  expect(screen.queryByText("Route complete")).toBeNull();
});

test("driving the loop back round to the start finishes the route", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByText("Start")); });
  await drive(LOOP);

  expect(screen.getByText("Route complete")).toBeTruthy();
});

// Arrival used to be decided by walking the step index, which only moves when
// the driver comes within ADVANCE_RADIUS_M (25 m) of each manoeuvre in turn.
// OSRM puts a roundabout's manoeuvre at the middle of the roundabout, not on
// the lane, so one wide junction is enough to strand the index there — and
// with it, the end of the route.
test("a manoeuvre the driver never gets close to does not strand the drive", async () => {
  const OFF = { lat: 51.509, lng: -0.0885 }; // ~130 m off the driven line
  mockGetRoute.mockResolvedValue({
    data: {
      route: {
        ...route,
        steps: buildNavSteps([
          osrm(A, "depart"), osrm(B, "turn"), osrm(OFF, "roundabout"), osrm(D, "turn"), osrm(A, "arrive", "", 0),
        ]),
      },
      hazards: [],
    },
    stale: false,
  });
  setLastKnownPosition(A.lat, A.lng);
  await mount();

  await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByText("Start")); });
  await drive(LOOP);

  expect(screen.getByText("Route complete")).toBeTruthy();
});

// ── Off-route recovery ──────────────────────────────────────────────────────
//
// The loop runs west→east along the bottom edge (A→B) at lat 51.500. Leaving
// it means dropping south of that edge: 0.0006 of latitude is about 66 m, well
// past the 45 m entry threshold, and there is no other leg of the rectangle
// near enough for a fix to snap onto instead.
const ON_AB: LatLng[] = [A, { lat: 51.5, lng: -0.099 }, { lat: 51.5, lng: -0.098 }];
const OFF_AB: LatLng[] = [
  { lat: 51.4994, lng: -0.0975 },
  { lat: 51.4994, lng: -0.097 },
  { lat: 51.4994, lng: -0.0965 },
];

const beginAtStart = async () => {
  // The suite-wide beforeEach clears mockBack only, and these tests count
  // utterances — so the speech log has to start empty for each of them.
  (require("expo-speech").speak as jest.Mock).mockClear();
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  // Waited for rather than read straight off the tree. The preview card only
  // offers "Start" once the last known position has arrived and put the driver
  // on the start line; until then it offers "Guide me to the start". mount()
  // waits on the route name, which lands first, so reading immediately is a
  // race — and one that only loses under full-suite parallelism.
  await waitFor(() => expect(screen.getByText("Start")).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByText("Start")); });
};

const spoken = () => (require("expo-speech").speak as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as string);

test("a single wild fix is not enough to call the driver off route", async () => {
  await beginAtStart();
  await drive([...ON_AB, { lat: 51.4994, lng: -0.098 }, ...ON_AB]);

  expect(screen.queryByText("Off route")).toBeNull();
  expect(spoken().some((s) => s.includes("left the route"))).toBe(false);
});

test("three fixes clear of the line put the banner into its amber state", async () => {
  await beginAtStart();
  await drive([...ON_AB, ...OFF_AB]);

  expect(screen.getByText("Off route")).toBeTruthy();
});

test("leaving the route is announced exactly once, however long the driver stays off it", async () => {
  await beginAtStart();
  await drive([...ON_AB, ...OFF_AB, ...OFF_AB, ...OFF_AB]);

  const left = spoken().filter((s) => s.includes("left the route"));
  expect(left).toHaveLength(1);
});

test("getting back on the line clears the banner and says so", async () => {
  await beginAtStart();
  await drive([...ON_AB, ...OFF_AB]);
  expect(screen.getByText("Off route")).toBeTruthy();

  // Two fixes back on the road — EXIT_FIXES.
  await drive([{ lat: 51.5, lng: -0.096 }, { lat: 51.5, lng: -0.095 }]);

  expect(screen.queryByText("Off route")).toBeNull();
  expect(spoken()).toContain("Back on route.");
});

test("a driver who never leaves the route is never told anything about it", async () => {
  await beginAtStart();
  await drive(LOOP.slice(0, 20));

  expect(screen.queryByText("Off route")).toBeNull();
  expect(spoken().some((s) => s.includes("left the route") || s === "Back on route.")).toBe(false);
});
