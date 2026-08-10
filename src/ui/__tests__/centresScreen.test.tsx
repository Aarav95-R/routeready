import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));
jest.mock("expo-location", () => require("../../test/locationMock"));
jest.mock("@/services/centresRepo", () => ({ listCentres: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// The bottom sheet needs a real native layout pass the test renderer never
// gives it — under test it renders nothing without this. See Task 8, which
// reaches the list through this mock's BottomSheetFlatList via
// UNSAFE_getByType(FlatList).
jest.mock("@gorhom/bottom-sheet", () => {
  const { View, FlatList } = require("react-native");
  return {
    __esModule: true,
    default: ({ children }: any) => <View>{children}</View>,
    BottomSheetFlatList: FlatList,
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
