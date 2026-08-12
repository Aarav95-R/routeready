import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));
jest.mock("expo-location", () => require("../../test/locationMock"));
jest.mock("@/services/centresRepo", () => ({ listCentres: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// The bottom sheet needs a real native layout pass the test renderer never
// gives it — under test it renders nothing without this. BottomSheetFlatList
// stands in as a lean, non-virtualizing list rather than react-native's real
// FlatList: it renders `data` straight through `renderItem`, and forwards
// `onScroll` as a plain prop reachable via getByTestId (see Task 8's
// scrollTo below). The real FlatList's VirtualizedList schedules its own
// cell-recalculation off a bare setTimeout on every render, unrelated to
// anything this screen does, and that timer routinely outlives a test under
// Jest's full-suite parallelism, firing on an unmounted tree and tripping an
// "update ... not wrapped in act(...)" warning — noise from react-native's
// own internals, not from this screen's scroll binding.
jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  const FakeFlatList = ({ data, renderItem, keyExtractor, onScroll }: any) => (
    <View testID="centres-list" onScroll={onScroll}>
      {data.map((item: any, index: number) => (
        <View key={keyExtractor(item, index)}>{renderItem({ item, index })}</View>
      ))}
    </View>
  );
  return {
    __esModule: true,
    // snapPoints is forwarded so the one-detent invariant can be asserted.
    default: ({ children, snapPoints }: any) => (
      <View testID="sheet" snapPoints={snapPoints}>{children}</View>
    ),
    BottomSheetFlatList: FakeFlatList,
  };
});

// eslint-disable-next-line import/first
import { listCentres } from "@/services/centresRepo";
// eslint-disable-next-line import/first
import {
  resetLocationMock, requestForegroundPermissionsAsync,
  getCurrentPositionAsync, getLastKnownPositionAsync, setLastKnownPosition,
} from "../../test/locationMock";
// eslint-disable-next-line import/first
import type { Centre } from "@/types/db";
// eslint-disable-next-line import/first
import Centres from "../../../app/(tabs)/index";

const centre = (id: string, over: Partial<Centre> = {}): Centre => ({
  id, name: id, address: "", lat: 51.61, lng: -0.24, pass_rate: 40,
  pass_rate_history: [], test_types: ["manual", "auto"], region: "Greater London",
  ...over,
});

const CENTRES = [
  centre("Mill Hill", { lat: 51.6087, lng: -0.2412, pass_rate: 43.5 }),
  centre("Hendon", { lat: 51.5921, lng: -0.2495, pass_rate: 39 }),
  centre("Chingford", { lat: 51.6316, lng: -0.006, pass_rate: 50, test_types: ["auto"] }),
];

// Fake timers for the whole file, frozen unless a test explicitly advances
// them. Task 9 put CentresMap's pins and rings behind a setTimeout stagger;
// under real timers those fire whenever they fire relative to a test's own
// async work, which is exactly the kind of race that shows up as an
// intermittent "not wrapped in act(...)" warning. Frozen fake time means the
// stagger simply never elapses in tests that never asked it to.
beforeEach(() => {
  jest.useFakeTimers();
  resetLocationMock();
  setLastKnownPosition(51.601, -0.235);
  (listCentres as jest.Mock).mockResolvedValue({ data: CENTRES, stale: false });
});

afterEach(() => {
  jest.useRealTimers();
});

test("lists the centres once they load", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  expect(screen.getByText("Mill Hill")).toBeTruthy();
});

test("a type filter keeps the active sort instead of replacing it", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  fireEvent.press(screen.getByText("Pass rate"));
  fireEvent.press(screen.getByText("Auto"));

  // All three centres offer auto, so the filter removes nothing; what matters
  // is that the pass-rate sort chosen a moment ago survived it. On the screen
  // this replaces, tapping a car type reset the order.
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
  expect(names[0]).toBe("Chingford");   // 50%, the highest
});

test("searching matches on region as well as name", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  fireEvent.changeText(screen.getByTestId("centre-search"), "hendon");
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(1));
});

test("a search matching nothing says so", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  fireEvent.changeText(screen.getByTestId("centre-search"), "brixton");
  await waitFor(() => expect(screen.getByTestId("centres-empty")).toBeTruthy());
});

test("without location permission, Nearest is disabled and the sort is by pass rate", async () => {
  requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  expect(screen.getByTestId("sort-nearest")).toBeDisabled();
  const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
  expect(names[0]).toBe("Chingford");   // 50%, the highest
  // getByTestId (singular) would throw here: every fixture centre shares the
  // same region, so with no fix all three rows render identical meta text.
  // Scoped to the top row to match the names[0] check just above.
  expect(screen.getAllByTestId("centre-row-meta")[0]).toHaveTextContent("Greater London");
});

test("a failed load with no cache offers a retry rather than an empty list", async () => {
  (listCentres as jest.Mock).mockRejectedValue(new Error("offline"));
  render(<Centres />);
  await waitFor(() => expect(screen.getByTestId("centres-error")).toBeTruthy());

  (listCentres as jest.Mock).mockResolvedValue({ data: CENTRES, stale: false });
  fireEvent.press(screen.getByTestId("centres-retry"));
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
});

// Decision 1: pins must be the *filtered* pinned centres, not the raw near
// set. Chingford is the only auto-only centre and sits well within the near
// radius of the test fix, so filtering to Manual must drop its pin from the
// map source alongside its row — nearSet() alone would still hand it over,
// since nearSet is computed from the unfiltered list to keep identity stable.
// CentresMap puts the map's pins behind a reveal stagger (CentresMap.tsx):
// on first load they fill in one setTimeout at a time, so reading
// source:pins right after the first render would catch the reveal mid-flight
// rather than the settled set this test is actually about. The
// advanceTimersByTime below (the file's fake timers are frozen by default —
// see the top-level beforeEach) flushes that entrance past its own worst
// case (3 pins * 70ms). The filter change afterwards needs no such flush:
// the entrance runs once, and every later pin set renders immediately.
test("a car-type filter removes non-matching centres from the map pins too", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  act(() => jest.advanceTimersByTime(10_000));

  const pinIds = () => screen.getByTestId("source:pins").props.shape.features.map((f: any) => f.properties.id);
  expect(pinIds()).toEqual(expect.arrayContaining(["Chingford"]));

  fireEvent.press(screen.getByText("Manual"));

  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(2));
  expect(screen.queryByText("Chingford")).toBeNull();
  expect(pinIds()).not.toEqual(expect.arrayContaining(["Chingford"]));
});

// Dispatches a real scroll event at the mocked list, rather than calling its
// onScroll prop back directly, so this proves the handler is reachable
// through an event the way the real BottomSheetFlatList would deliver it —
// not just that the arithmetic behind it is right. The lean FakeFlatList
// stand-in above still wires onScroll straight onto the element fireEvent
// targets, so this reaches exactly what the screen wired up.
const scrollTo = (y: number) => {
  fireEvent.scroll(screen.getByTestId("centres-list"), {
    nativeEvent: {
      contentOffset: { y, x: 0 },
      contentSize: { height: 1000, width: 390 },
      layoutMeasurement: { height: 400, width: 390 },
    },
  });
};

// With this fixture (all three centres near, "nearest" sort, no location
// permission denied), the sorted-by-distance order is Mill Hill, Hendon,
// Chingford — so row index 2, an offset of two 88pt rows, is Chingford.
// Asserting the name (not just "exactly one row is active") matters: the
// seed effect already makes pins[0] (Mill Hill) active on load, so a test
// that only counts active rows would pass with the scroll binding entirely
// disconnected.
test("scrolling the sheet makes the arrived-at centre active", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  scrollTo(176);
  await waitFor(() => {
    const rows = screen.getAllByTestId("centre-row");
    const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
    const activeIndex = rows.findIndex((r) => r.props.style.backgroundColor !== "#FFFFFF");
    expect(activeIndex).toBeGreaterThanOrEqual(0);
    expect(names[activeIndex]).toBe("Chingford");
  });
});

test("a row under Further afield does not become active", async () => {
  // Newcastle is 250 miles out, so it is listed but never pinned.
  (listCentres as jest.Mock).mockResolvedValue({
    data: [...CENTRES, centre("Newcastle", { lat: 54.97, lng: -1.61, region: "Tyne and Wear" })],
    stale: false,
  });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(4));

  scrollTo(2000);   // far past the end, onto the unpinned section
  await waitFor(() => {
    const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
    expect(names).toContain("Newcastle");
  });
  const active = screen.getAllByTestId("centre-row").filter((r) => r.props.style.backgroundColor !== "#FFFFFF");
  expect(active).toHaveLength(0);
});

// Regression for the plan's original bug: computing the active row as
// `offsetY / CENTRE_ROW_H` assumes every pixel above the target belongs to an
// 88pt centre row. Once "Near you" and "Further afield" both exist, a 32pt
// section header sits above the second and third near rows, and the bare
// division drifts by a header's worth of pixels — landing one row too far.
// The offset table (built from CENTRE_ROW_H and SECTION_HEADER_H, not
// measured) must not have that drift.
test("a section header above the target row does not shift which centre becomes active", async () => {
  (listCentres as jest.Mock).mockResolvedValue({
    data: [
      // Same longitude as `me` (set in beforeEach), increasing latitude, so
      // distance order is exactly Near A, Near B, Near C — all comfortably
      // inside the 30-mile near radius.
      centre("Near A", { lat: 51.651, lng: -0.235 }),
      centre("Near B", { lat: 51.701, lng: -0.235 }),
      centre("Near C", { lat: 51.751, lng: -0.235 }),
      centre("Far D", { lat: 54.97, lng: -1.61, region: "Tyne and Wear" }),
    ],
    stale: false,
  });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(4));

  // Row layout: "Near you" header (32) + Near A (88) + Near B (88) + Near C
  // (88) + "Further afield" header (32) + Far D (88). y=150 falls inside
  // Near B's band [120, 208). The brief's bare division — round(150/88) = 2 —
  // ignores the 32pt header and picks the third centre row (Near C) instead.
  scrollTo(150);
  await waitFor(() => {
    const rows = screen.getAllByTestId("centre-row");
    const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
    const activeIndex = rows.findIndex((r) => r.props.style.backgroundColor !== "#FFFFFF");
    expect(activeIndex).toBeGreaterThanOrEqual(0);
    expect(names[activeIndex]).toBe("Near B");
  });
});

// The camera itself — map.current?.focus(), the row-change skip, and the
// 150ms floor — was previously untested, which is exactly how it stayed
// broken: `setActiveId` had already run by the time the floor discarded a
// move, so the sheet could show one row while the map stayed on an earlier
// one, permanently. rnmapboxMock's CameraStub exposes setCamera as a
// jest.fn() (see src/test/rnmapboxMock.tsx) reachable off the "camera:"
// element's props, which is what these three tests read.
const cameraCalls = () => screen.getByTestId("camera:").props.setCamera.mock.calls;

test("scrolling to a centre flies the camera to that centre's coordinates", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  scrollTo(176);   // row index 2, nearest-sorted — Chingford (see the test above)
  await waitFor(() => {
    const calls = cameraCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0].centerCoordinate).toEqual([-0.006, 51.6316]);
  });
});

test("a second scroll resolving to the same row issues no second camera call", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  scrollTo(176);
  await waitFor(() => expect(cameraCalls().length).toBe(1));

  scrollTo(200);   // still row index 2 — the last row's band has no upper bound
  expect(cameraCalls().length).toBe(1);
});

// The regression guard for the ruling above. Without the trailing flush this
// fails: the old code just returned when the 150ms floor was still open,
// permanently dropping the move onto the row the user actually landed on.
// Fake timers give this deterministic control over the elapsed time between
// scrolls; RNTL's waitFor detects them and advances them itself, so the
// final await below both flushes the trailing setTimeout and re-checks the
// expectation without this test manually reaching for advanceTimersByTime.
//
// Four near centres, not the shared three: the seed effect already makes
// row 0 active on load without moving the camera, so the first *move* in
// this test has to target a different row, and proving the trailing flush
// keeps the *last* of several throttled targets (not just the only one)
// needs a second, distinct row to supersede the first stash with.
test("throttled moves in quick succession still end with the camera on the last row", async () => {
  (listCentres as jest.Mock).mockResolvedValue({
    data: [
      // Same longitude as `me`, increasing latitude, all comfortably inside
      // the 30-mile near radius — one section, no header, so offsets are a
      // plain row_index * CENTRE_ROW_H.
      centre("A", { lat: 51.611, lng: -0.235 }),
      centre("B", { lat: 51.651, lng: -0.235 }),
      centre("C", { lat: 51.701, lng: -0.235 }),
      centre("D", { lat: 51.751, lng: -0.235 }),
    ],
    stale: false,
  });

  jest.useFakeTimers();
  jest.setSystemTime(10_000);   // far enough past 0 that the very first move is never itself throttled
  try {
    render(<Centres />);
    await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(4));

    // Row A is already active from the seed effect (no camera call yet).
    scrollTo(88);    // row 1, B — first real move, fires immediately
    await waitFor(() => expect(cameraCalls().length).toBe(1));

    act(() => jest.advanceTimersByTime(50));
    scrollTo(176);   // row 2, C — 50ms after the last move: inside the floor, stashed

    act(() => jest.advanceTimersByTime(50));
    scrollTo(264);   // row 3, D — 100ms after the last move: still inside the floor,
                      // supersedes C as the stashed target

    // The sheet already shows D active before the floor even opens.
    const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
    const activeIndex = screen.getAllByTestId("centre-row").findIndex(
      (r) => r.props.style.backgroundColor !== "#FFFFFF"
    );
    expect(names[activeIndex]).toBe("D");

    // Scrolling has stopped; nothing further is going to move the camera on
    // its own except the trailing flush this floor owes row D.
    await waitFor(() => {
      const calls = cameraCalls();
      expect(calls.length).toBe(2);
      expect(calls[1][0].centerCoordinate).toEqual([-0.235, 51.751]);   // D, not B
    });
  } finally {
    jest.useRealTimers();
  }
});

// The camera itself has to be framed before anyone touches anything. The
// screen used to render a bare <Camera /> and call fitAll() only from the
// recentre button, so the first screen of the app opened on whatever camera
// the Mapbox base style ships with. rnmapboxMock exposes fitBounds the same
// way it exposes setCamera.
const fitCalls = () => screen.getByTestId("camera:").props.fitBounds.mock.calls;
const lastFit = () => fitCalls()[fitCalls().length - 1];

test("the camera frames the near set on first paint", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  await waitFor(() => expect(fitCalls().length).toBeGreaterThan(0));
  const [ne, sw] = lastFit();
  // Chingford east, Hendon west and south, Chingford north — every pin inside.
  expect(ne[0]).toBeGreaterThanOrEqual(-0.006);
  expect(ne[1]).toBeGreaterThanOrEqual(51.6316);
  expect(sw[0]).toBeLessThanOrEqual(-0.2495);
  expect(sw[1]).toBeLessThanOrEqual(51.5921);
});

// The other half of the same requirement, and the one fitting from `pins`
// cannot reach: with no fix there is no near set, so there are no pins, so a
// pin-derived fit finds no points and leaves the camera where it started.
test("with no location permission the camera frames all centres", async () => {
  requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });
  (listCentres as jest.Mock).mockResolvedValue({
    data: [...CENTRES, centre("Newcastle", { lat: 54.97, lng: -1.61, region: "Tyne and Wear" })],
    stale: false,
  });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(4));

  await waitFor(() => expect(fitCalls().length).toBeGreaterThan(0));
  const [ne, sw] = lastFit();
  expect(ne[1]).toBeGreaterThanOrEqual(54.97);    // Newcastle, 250 miles up
  expect(sw[0]).toBeLessThanOrEqual(-1.61);
});

// Spec, "Filters, honestly": Manual/Auto remove non-matching centres from the
// list and their pins from the map, "and refits the camera to what is left".
// The pin removal shipped; the refit did not.
test("a car-type filter refits the camera to the centres that are left", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  await waitFor(() => expect(fitCalls().length).toBeGreaterThan(0));

  const before = fitCalls().length;
  expect(lastFit()[0][0]).toBeGreaterThanOrEqual(-0.006);   // Chingford sets the eastern edge

  fireEvent.press(screen.getByText("Manual"));
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(2));

  await waitFor(() => expect(fitCalls().length).toBeGreaterThan(before));
  // Chingford is gone, so the eastern edge falls back to Mill Hill.
  expect(lastFit()[0][0]).toBeLessThan(-0.2);
});

// Permission granted and the fix never arrives — location services off at the
// OS level, or a timeout. The screen used to key its sort fallback on the
// permission status alone, so this state painted Nearest as the selected pill
// *and* greyed it as disabled, while the list quietly sat in pass-rate order.
// The spec's states table: identical to having no permission.
const pillBackground = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style)?.backgroundColor;

test("permission granted but no fix is identical to having no permission", async () => {
  getLastKnownPositionAsync.mockResolvedValue(null);
  getCurrentPositionAsync.mockRejectedValue(new Error("location services are off"));

  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  expect(screen.getByTestId("sort-nearest")).toBeDisabled();
  // Not both selected and disabled: the white pill sits on Pass rate.
  expect(pillBackground("sort-nearest")).not.toBe("#FFFFFF");
  expect(pillBackground("sort-pass")).toBe("#FFFFFF");

  const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
  expect(names[0]).toBe("Chingford");   // 50%, the highest — the order the control now claims
  expect(screen.getAllByTestId("centre-row-meta")[0]).toHaveTextContent("Greater London");
});

// activeId was seeded once and never reconciled, so filtering away the active
// centre left it naming a centre with no pin and no row: no label on the map,
// no tinted row, and the one-shot seed will not fire again.
test("filtering away the active centre moves it to one that still has a pin", async () => {
  (listCentres as jest.Mock).mockResolvedValue({
    data: [
      // Alpha is nearest, so the seed makes it active — and it is auto-only,
      // so choosing Manual is exactly what removes the active centre.
      centre("Alpha", { lat: 51.611, lng: -0.235, test_types: ["auto"] }),
      centre("Beta", { lat: 51.651, lng: -0.235, test_types: ["manual"] }),
    ],
    stale: false,
  });
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(2));

  const activeName = () => {
    const rows = screen.getAllByTestId("centre-row");
    const names = screen.getAllByTestId("centre-row-name").map((n) => n.props.children);
    const i = rows.findIndex((r) => r.props.style.backgroundColor !== "#FFFFFF");
    return i < 0 ? null : names[i];
  };
  await waitFor(() => expect(activeName()).toBe("Alpha"));

  fireEvent.press(screen.getByText("Manual"));
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(1));
  expect(activeName()).toBe("Beta");
});

// The other half: scrolling onto "Further afield" clears the active centre,
// but it used to leave a throttled move still queued, so the trailing flush
// afterwards flew the camera to a centre the sheet was showing as inactive.
test("scrolling onto an unpinned row drops the move that was still queued", async () => {
  (listCentres as jest.Mock).mockResolvedValue({
    data: [
      centre("A", { lat: 51.611, lng: -0.235 }),
      centre("B", { lat: 51.651, lng: -0.235 }),
      centre("Far D", { lat: 54.97, lng: -1.61, region: "Tyne and Wear" }),
    ],
    stale: false,
  });

  jest.setSystemTime(10_000);   // far enough past 0 that the first move is never itself throttled
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  // Rows: "Near you" (32) A (88) B (88) | "Further afield" (32) Far D (88)
  scrollTo(120);   // B — first real move, fires immediately
  await waitFor(() => expect(cameraCalls().length).toBe(1));

  act(() => jest.advanceTimersByTime(50));
  scrollTo(32);    // back to A, inside the 150ms floor: stashed, flush scheduled

  act(() => jest.advanceTimersByTime(50));
  scrollTo(240);   // Far D, unpinned — active clears, and so must the queued move

  act(() => jest.advanceTimersByTime(1000));
  expect(cameraCalls().length).toBe(1);
  const active = screen.getAllByTestId("centre-row").filter((r) => r.props.style.backgroundColor !== "#FFFFFF");
  expect(active).toHaveLength(0);
});

test("the sheet has exactly one detent, so scrolling the list never covers the map", async () => {
  // gorhom locks the scrollable unless the sheet is at its highest detent, so
  // a second snap point does not merely add a position — it makes the first
  // scroll gesture drag the sheet up over the map before the list moves.
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));
  expect(screen.getByTestId("sheet").props.snapPoints).toHaveLength(1);
});
