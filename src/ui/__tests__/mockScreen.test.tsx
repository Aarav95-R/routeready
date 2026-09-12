import { Alert } from "react-native";
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
// The sheet is replaced by a plain View, which renders every child whatever
// position the real sheet would be at — so nothing in this file can observe
// where the sheet actually sits. The props it was handed are captured instead,
// because those are what decide that, and getting them wrong once left the
// marking surface off screen with the whole suite still green.
type SheetProps = { index?: number; snapPoints?: unknown; enableDynamicSizing?: boolean; onChange?: (i: number) => void };
const mockSheetProps: { current: SheetProps | null } = { current: null };
jest.mock("@gorhom/bottom-sheet", () => {
  const { View, ScrollView } = require("react-native");
  const { forwardRef } = require("react");
  const Sheet = forwardRef(({ children, ...rest }: any, _ref: any) => {
    mockSheetProps.current = rest;
    return <View>{children}</View>;
  });
  Sheet.displayName = "BottomSheet";
  return { __esModule: true, default: Sheet, BottomSheetScrollView: ScrollView };
});

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace, dismissTo: mockDismissTo }),
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
  speed_profile: [], observation_zones: [], is_free: true,
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
  mockDismissTo.mockClear();
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
  expect(useMockTest.getState().marks).toHaveLength(0);
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

// Fixes stopped being evidence when the score became the mark sheet, but they
// still drive the route cursor — an inaccurate one must not walk the drive to
// its finish.
test("inaccurate fixes never advance the drive to completion", async () => {
  await beginAtStart();

  for (const p of LOOP) {
    await act(async () => { emitFix(p.lat, p.lng, { speedMps: 0, accuracyM: 80 }); });
  }

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

  await act(async () => { mockSheetProps.current?.onChange?.(1); });
  await act(async () => { fireEvent.press(screen.getByTestId("finish-test")); });

  expect(useMockTest.getState().deviations).toHaveLength(1);
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

// Two ways out of a mock test that never reach the result screen, and one of
// them has to ask: every fault marked since the start line goes with it.
test("exiting a mock test in progress asks before it goes", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await beginAtStart();
  await act(async () => { useMockTest.getState().addMark("control", "minor"); });

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Exit mock test" })); });

  // Asked, and nothing happened until it is answered.
  expect(alert).toHaveBeenCalled();
  expect(mockDismissTo).not.toHaveBeenCalled();
  expect(useMockTest.getState().phase).toBe("running");
  expect(useMockTest.getState().marks).toHaveLength(1);
  alert.mockRestore();
});

test("confirming the exit empties the store and lands on Home, not the result", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _body, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
  await beginAtStart();
  await act(async () => { useMockTest.getState().addMark("control", "minor"); });

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Exit mock test" })); });

  expect(mockDismissTo).toHaveBeenCalledWith("/(tabs)");
  // An abandoned test is not a result: no score is written and no result
  // screen is opened, and the marks do not survive to seed the next test.
  expect(mockReplace).not.toHaveBeenCalled();
  expect(useMockTest.getState().phase).toBe("idle");
  expect(useMockTest.getState().marks).toHaveLength(0);
  alert.mockRestore();
});

// The drive to the start has assessed nothing, so there is nothing to discard
// and nothing to ask about — but it still lands on Home like every other exit.
test("exiting the drive to the start leaves without asking", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  setLastKnownPosition(51.4980, -0.100);
  await mount();
  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Exit route" })); });

  expect(alert).not.toHaveBeenCalled();
  expect(mockDismissTo).toHaveBeenCalledWith("/(tabs)");
  alert.mockRestore();
});

// ── Tapping Start on the start line ───────────────────────────────────────
//
// The twin of the practice suite's block of the same name — mock.tsx carried
// its own copy of the defect, where Start and "Start directly from here"
// shared one handler and the collapsed Start opened a bearing-guided approach
// to a point the car was already parked on.

test("tapping Start on the start line never opens the approach", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  // One fix, not three: a third stationary fix at the start confirms the
  // lifecycle on its own and hands over to the arrival prompt, which is a
  // different path with its own test above.
  await drive([A]);

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Start" })); });

  // The defect this guards: Start and "Start directly from here" once shared a
  // handler, so the collapsed Start opened a bearing-guided approach to a point
  // the car was already parked on.
  expect(screen.queryByText("Heading to the start")).toBeNull();
  expect(useMockTest.getState().phase).toBe("running");
});

// The "Confirming your position" card used to sit between this tap and the
// test, waiting on three accepted fixes spanning three seconds, with no way to
// say how long that would take. One tap now, and nothing to wait for.
test("Start on the line begins the test in one tap, with nothing to confirm", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  await drive([A]);

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Start" })); });

  expect(screen.queryByText("Confirming your position")).toBeNull();
  expect(screen.queryByText("Ready to begin?")).toBeNull();
  expect(useMockTest.getState().phase).toBe("running");
  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");
});

// Inside AT_START_M (60 m) so the card collapses to Start, outside
// START_CONFIRM_RADIUS_M (45 m) so the lifecycle will refuse to begin.
const DEAD_BAND = { lat: A.lat + 0.00047, lng: A.lng };

test("the dead band between the two start radii says why nothing happened", async () => {
  setLastKnownPosition(DEAD_BAND.lat, DEAD_BAND.lng);
  await mount();
  await drive([DEAD_BAND, DEAD_BAND, DEAD_BAND]);

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Start" })); });

  // Refused — but a button that does nothing is worse than the wait it
  // replaced, so it says what to do about it.
  expect(useMockTest.getState().phase).toBe("idle");
  expect(screen.getByText(/Pull up within 45 m/)).toBeTruthy();
  expect(screen.queryByText("Heading to the start")).toBeNull();
});

test("starting unguided from far away still opens the approach", async () => {
  mockFetchDirections.mockRejectedValue(new Error("no directions"));
  setLastKnownPosition(51.4900, -0.100);
  await mount();
  await drive([{ lat: 51.4900, lng: -0.100 }]);

  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Start directly from here" })); });

  expect(screen.getByText("Heading to the start")).toBeTruthy();
});

// ── Marking a fault ───────────────────────────────────────────────────────
//
// A listed sheet: every category on screen, a minus and a plus on each row.
// One press is one mark, and the score moves with it.

test("minus on a row records a driving fault and spends headroom", async () => {
  await beginAtStart();
  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");

  await act(async () => { fireEvent.press(screen.getByTestId("mark-mirrors-minor")); });

  expect(useMockTest.getState().marks).toEqual([
    expect.objectContaining({ category: "mirrors", level: "minor" }),
  ]);
  expect(screen.getByTestId("headroom")).toHaveTextContent("14 driving faults left");
  expect(screen.getByTestId("count-mirrors")).toHaveTextContent("1");
});

test("pressing minus again on the same row counts up", async () => {
  await beginAtStart();

  await act(async () => { fireEvent.press(screen.getByTestId("mark-mirrors-minor")); });
  await act(async () => { fireEvent.press(screen.getByTestId("mark-mirrors-minor")); });
  await act(async () => { fireEvent.press(screen.getByTestId("mark-mirrors-minor")); });

  expect(screen.getByTestId("count-mirrors")).toHaveTextContent("3");
  expect(screen.getByTestId("headroom")).toHaveTextContent("12 driving faults left");
});

// Credits are RouteReady's own idea: worth a few points of encouragement on
// the score and nothing at all on the verdict.
test("plus gives a credit and costs no headroom", async () => {
  await beginAtStart();

  await act(async () => { fireEvent.press(screen.getByTestId("mark-moveOff-credit")); });

  expect(useMockTest.getState().marks).toEqual([
    expect.objectContaining({ category: "moveOff", level: "credit" }),
  ]);
  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");
  expect(screen.getByTestId("credit-moveOff")).toHaveTextContent("1 done well");
});

// A serious fault is a different outcome, not a sixteenth driving fault.
test("the serious button ends the test without spending headroom", async () => {
  await beginAtStart();

  await act(async () => { fireEvent.press(screen.getByTestId("mark-junctions-major")); });

  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");
  expect(screen.getByTestId("live-detail")).toHaveTextContent("0 driving faults · 1 serious");
  expect(screen.getByTestId("serious-junctions")).toHaveTextContent("Serious fault");
});

// Every fault an examiner can give is on the one surface — including the ones
// that are nothing to do with driving along.
test("the whole DL25 is on the sheet, not behind a drill-down", async () => {
  await beginAtStart();

  await act(async () => { fireEvent.press(screen.getByTestId("mark-eyesight-minor")); });

  expect(useMockTest.getState().marks).toEqual([
    expect.objectContaining({ category: "eyesight", level: "minor" }),
  ]);
});

test("undo takes back the last mark whatever it was", async () => {
  await beginAtStart();

  await act(async () => { fireEvent.press(screen.getByTestId("mark-mirrors-minor")); });
  await act(async () => { fireEvent.press(screen.getByTestId("mark-junctions-major")); });
  await act(async () => { fireEvent.press(screen.getByTestId("undo")); });

  expect(useMockTest.getState().marks).toEqual([
    expect.objectContaining({ category: "mirrors", level: "minor" }),
  ]);
});

// ── The meter ─────────────────────────────────────────────────────────────

// The meter reports the mark sheet exactly. It used to add missed observation
// zones and speeding the phone had detected, which is what made it a claim
// rather than a report.
test("driving past an observation zone costs nothing on its own", async () => {
  mockGetRoute.mockResolvedValue({
    data: {
      route: { ...route, observation_zones: [{ ...LOOP[15], radiusM: 60, kind: "roundabout" as const }] },
      hazards: [],
    },
    stale: false,
  });
  await beginAtStart();
  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");

  await drive(LOOP);

  // Only the examiner decides whether the observation was good enough.
  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");
});

// ── The sheet's own snap points ───────────────────────────────────────────
//
// @gorhom/bottom-sheet v5 defaults `enableDynamicSizing` to true. With it on,
// useAnimatedDetents measures the content, pushes an extra content-sized detent
// into the list and re-sorts the whole thing — so `index` no longer addresses
// the array passed as `snapPoints`, and until that measurement lands the hook
// returns no detents at all and the sheet never positions itself. That left the
// marking surface off the screen with the whole suite green.

test("the sheet opts out of dynamic sizing, so its index addresses its own snap points", async () => {
  await beginAtStart();

  expect(mockSheetProps.current?.enableDynamicSizing).toBe(false);
});

// Collapsed, not open: the controls row and the Mapbox attribution are stacked
// off the collapsed height, so a sheet resting any higher covers Mirrors — the
// control the score depends on — and the attribution, which the Mapbox licence
// requires stay visible.
test("the test opens collapsed, so the map keeps its controls and attribution", async () => {
  await beginAtStart();

  expect(mockSheetProps.current?.index).toBe(0);
});

// Two heights, not three. The middle one existed to show an eight-tile grid
// that no longer exists.
test("the sheet has two heights: the score, and the whole sheet", async () => {
  await beginAtStart();

  const snapPoints = mockSheetProps.current?.snapPoints as [number, string];
  expect(snapPoints).toHaveLength(2);
  expect(typeof snapPoints[0]).toBe("number");
  expect(snapPoints[1]).toBe("92%");
});

// ── Ending the test by hand ───────────────────────────────────────────────
//
// Finish used to be the last thing in the sheet's scroll, below all twenty-three
// category rows. Nobody scrolls the whole DL25 to find a control they need once,
// so in practice the only way to end a test was to drive the loop closed.

test("finishing is pinned under the score once the sheet is open", async () => {
  await beginAtStart();

  // Collapsed: the sheet is the score, and nothing else.
  expect(screen.queryByTestId("finish-test")).toBeNull();

  await act(async () => { mockSheetProps.current?.onChange?.(1); });

  expect(screen.getByTestId("finish-test")).toBeTruthy();
});

test("finishing by hand scores the test and opens the result", async () => {
  await beginAtStart();
  await drive([A, A]);
  await act(async () => { mockSheetProps.current?.onChange?.(1); });

  await act(async () => { fireEvent.press(screen.getByTestId("finish-test")); });

  expect(useMockTest.getState().phase).toBe("finished");
  expect(mockReplace).toHaveBeenCalledWith("/route/route-1/result");
});

test("a hand-finished test carries the marks that were given", async () => {
  await beginAtStart();
  await drive([A, A]);
  await act(async () => { fireEvent.press(screen.getByTestId("mark-mirrors-minor")); });
  await act(async () => { mockSheetProps.current?.onChange?.(1); });

  await act(async () => { fireEvent.press(screen.getByTestId("finish-test")); });

  expect(useMockTest.getState().result?.minors).toBe(1);
});

// ── Getting to the start ──────────────────────────────────────────────────

// distToStart comes from getLastKnownPositionAsync, which can be minutes old.
// When it wrongly puts the driver on the line the card collapses to "Start"
// alone, and there was then no way to route to a start they are not at.
test("the drive to the start is offered even from the collapsed card", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();

  expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Guide me to the start" }));
  });

  expect(screen.getByText("Heading to the start")).toBeTruthy();
  // Still nothing scored: the drive to the start is not the test.
  expect(useMockTest.getState().phase).toBe("idle");
});

test("the drive to the start is still offered when far away", async () => {
  setLastKnownPosition(51.4900, -0.100);
  await mount();

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Guide me to the start" }));
  });

  expect(screen.getByText("Heading to the start")).toBeTruthy();
});

// ── Beginning after the drive to the start ────────────────────────────────
//
// There was no way in. Arriving handed over on its own and only on its own:
// three accepted fixes within 30 m at under 5 mph. The watch runs with
// distanceInterval 5, so a car that has stopped emits nothing — pulling up on
// the line and waiting is the one thing guaranteed not to produce them. The
// screen carried a turn banner, Recenter and Exit, and nothing else, so the
// only way out was to abandon the drive.

test("the drive to the start offers a way into the test", async () => {
  setLastKnownPosition(51.4980, -0.100);
  await mount();
  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });

  expect(screen.getByText("Heading to the start")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Begin mock test" })).toBeTruthy();
});

test("beginning from the approach starts the test without waiting to arrive", async () => {
  setLastKnownPosition(A.lat, A.lng);
  await mount();
  // From the collapsed card, whose link reads "Not here? Guide me to the start".
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Guide me to the start" }));
  });
  await drive([A]);

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Begin mock test" }));
  });

  expect(useMockTest.getState().phase).toBe("running");
  expect(screen.getByTestId("headroom")).toHaveTextContent("15 driving faults left");
});

// The same two checks the preview card's Start is subject to.
test("beginning from too far out is refused, and says so", async () => {
  setLastKnownPosition(51.4900, -0.100);
  await mount();
  await act(async () => { fireEvent.press(screen.getByText("Guide me to the start")); });
  await drive([{ lat: 51.4900, lng: -0.100 }]);

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Begin mock test" }));
  });

  expect(useMockTest.getState().phase).toBe("idle");
  expect(screen.getByText(/Pull up within 45 m/)).toBeTruthy();
});

// ── The score is the mark sheet ───────────────────────────────────────────

test("a drive with nothing marked reaches the result as a clean drive", async () => {
  await beginAtStart();
  await drive([...LOOP, A, A]);
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "End route" })); });

  const result = useMockTest.getState().result!;
  expect(result.faults).toEqual([]);
  expect(mockReplace).toHaveBeenCalledWith("/route/route-1/result");
});

// Mirrors existed only to answer the observation zones. With those unscored it
// recorded nothing, and it was the largest control on the map.
test("the map no longer carries a Mirrors button", async () => {
  await beginAtStart();

  expect(screen.queryByTestId("mirrors")).toBeNull();
  // Recenter keeps its place.
  expect(screen.getByRole("button", { name: "Recenter map" })).toBeTruthy();
});
