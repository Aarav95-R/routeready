import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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
    default: ({ children }: any) => <View>{children}</View>,
    BottomSheetFlatList: FakeFlatList,
  };
});

// eslint-disable-next-line import/first
import { listCentres } from "@/services/centresRepo";
// eslint-disable-next-line import/first
import { resetLocationMock, requestForegroundPermissionsAsync, setLastKnownPosition } from "../../test/locationMock";
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

beforeEach(() => {
  resetLocationMock();
  setLastKnownPosition(51.601, -0.235);
  (listCentres as jest.Mock).mockResolvedValue({ data: CENTRES, stale: false });
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
test("a car-type filter removes non-matching centres from the map pins too", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  const pinIds = () => screen.getByTestId("source:pins").props.shape.features.map((f: any) => f.properties.id);
  expect(pinIds()).toEqual(expect.arrayContaining(["Chingford"]));

  fireEvent.press(screen.getByText("Manual"));

  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(2));
  expect(screen.queryByText("Chingford")).toBeNull();
  expect(pinIds()).not.toEqual(expect.arrayContaining(["Chingford"]));
});

// Calls the onScroll prop we handed the list directly, rather than dispatching
// a scroll event: the mocked BottomSheetFlatList above is a lean stand-in, so
// its onScroll prop is reachable straight off the element, and calling it
// exercises exactly the handler this screen wired up.
const scrollTo = (y: number) => {
  act(() => {
    screen.getByTestId("centres-list").props.onScroll({
      nativeEvent: {
        contentOffset: { y, x: 0 },
        contentSize: { height: 1000, width: 390 },
        layoutMeasurement: { height: 400, width: 390 },
      },
    });
  });
};

test("scrolling the sheet makes the arrived-at centre active", async () => {
  render(<Centres />);
  await waitFor(() => expect(screen.getAllByTestId("centre-row")).toHaveLength(3));

  // 88pt rows: an offset of two rows lands on the third centre.
  scrollTo(176);
  await waitFor(() => {
    const active = screen.getAllByTestId("centre-row").filter((r) => r.props.style.backgroundColor !== "#FFFFFF");
    expect(active).toHaveLength(1);
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
