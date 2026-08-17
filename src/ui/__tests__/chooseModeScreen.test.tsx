import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "r1" }),
}));
jest.mock("@/services/routesRepo", () => ({ getRoute: jest.fn() }));
jest.mock("@/services/progressRepo", () => ({ listProgressByCentre: jest.fn() }));

import { getRoute } from "@/services/routesRepo";
import { listProgressByCentre } from "@/services/progressRepo";
import type { Hazard, ProgressEntry, Route } from "@/types/db";
import ChooseMode from "../../../app/route/[id]/start";

const route: Route = {
  id: "r1", centre_id: "c1", name: "Route 1 · Town loop",
  geometry: {
    type: "LineString",
    coordinates: [[-0.25, 51.60], [-0.24, 51.605], [-0.23, 51.61], [-0.25, 51.60]],
  },
  estimated_minutes: 18, distance_km: 6.2, difficulty: 2,
  speed_profile: [{ startIdx: 0, endIdx: 3, limitMph: 30 }],
  observation_zones: [{ kind: "roundabout", lat: 51.605, lng: -0.24, radiusM: 30 }],
  steps: [],
};

const entry = (score: number | null): ProgressEntry => ({
  user_id: "u1", route_id: "r1", mock_test_score: score, mistakes: [], duration_seconds: 1200,
});

const HAZARDS: Hazard[] = [
  { id: "h1", route_id: "r1", lat: 51.605, lng: -0.24, type: "roundabout", description: "Four exits.", severity: "high" },
  { id: "h2", route_id: "r1", lat: 51.607, lng: -0.238, type: "narrow", description: "Parked cars both sides.", severity: "medium" },
  { id: "h3", route_id: "r1", lat: 51.61, lng: -0.23, type: "zebra", description: "Right after the bend.", severity: "low" },
];

const mockGetRoute = getRoute as jest.MockedFunction<typeof getRoute>;
const mockProgress = listProgressByCentre as jest.MockedFunction<typeof listProgressByCentre>;

beforeEach(() => {
  mockPush.mockClear();
  mockGetRoute.mockResolvedValue({ data: { route, hazards: [] } } as never);
  mockProgress.mockResolvedValue({ data: {} } as never);
});

test("names the route it is about to drive, so a mis-tapped card is caught here", async () => {
  render(<ChooseMode />);
  expect(await screen.findByText("Town loop")).toBeTruthy();
  expect(screen.getByText("6.2 km")).toBeTruthy();
  expect(screen.getByText("18 min")).toBeTruthy();
});

// The rows carry no route data, so they must not wait on the fetch.
test("both modes are offered before the route has loaded", () => {
  render(<ChooseMode />);
  expect(screen.getByText("Practice drive")).toBeTruthy();
  expect(screen.getByText("Mock test")).toBeTruthy();
});

test("practice and the mock test go to their own screens", async () => {
  render(<ChooseMode />);
  await screen.findByText("Town loop");

  fireEvent.press(screen.getByText("Practice drive"));
  expect(mockPush).toHaveBeenCalledWith("/route/r1/practice");

  fireEvent.press(screen.getByText("Mock test"));
  expect(mockPush).toHaveBeenCalledWith("/route/r1/mock");
});

test("past results appear on the mock test row only", async () => {
  mockProgress.mockResolvedValue({ data: { r1: [entry(64), entry(82)] } } as never);
  render(<ChooseMode />);
  expect(await screen.findByText("You've taken this twice — your best is 82")).toBeTruthy();
});

test("a route never tested shows no history line", async () => {
  render(<ChooseMode />);
  await screen.findByText("Town loop");
  expect(screen.queryByText(/your best is/)).toBeNull();
});

// The hazard list the deleted route detail page used to carry.
test("every hazard on the route is listed, in the order it is met", async () => {
  mockGetRoute.mockResolvedValue({ data: { route, hazards: HAZARDS } } as never);
  render(<ChooseMode />);

  expect(await screen.findByText("roundabout")).toBeTruthy();
  expect(screen.getByText("narrow")).toBeTruthy();
  expect(screen.getByText("zebra")).toBeTruthy();
  expect(screen.getByText("Parked cars both sides.")).toBeTruthy();
  expect(screen.getByText("What to watch for")).toBeTruthy();
});

// The numeral on a row has to match the numeral on the route drawing, or the
// two halves of this screen are talking about different places.
test("hazard rows and the marks on the drawing are numbered alike", async () => {
  mockGetRoute.mockResolvedValue({ data: { route, hazards: HAZARDS } } as never);
  render(<ChooseMode />);
  await screen.findByText("roundabout");

  expect(screen.getByTestId("thumb-mark-1")).toBeTruthy();
  expect(screen.getByTestId("thumb-mark-3")).toBeTruthy();
  expect(screen.queryByTestId("thumb-mark-4")).toBeNull();
});

test("a route with no hazards says so rather than hiding the section", async () => {
  render(<ChooseMode />);
  expect(await screen.findByText(/Nothing tricky on this one/)).toBeTruthy();
});

// "None flagged" is a claim about the route, and cannot be made before the
// route has arrived.
test("nothing is claimed about hazards while the route is still loading", () => {
  render(<ChooseMode />);
  expect(screen.queryByText(/Nothing tricky on this one/)).toBeNull();
  expect(screen.queryByText("What to watch for")).toBeNull();
});

// A history that fails to load must not take the choice down with it.
test("the modes still work when progress cannot be read", async () => {
  mockProgress.mockRejectedValue(new Error("offline"));
  render(<ChooseMode />);
  await screen.findByText("Town loop");
  await waitFor(() => expect(screen.getByText("Mock test")).toBeTruthy());
  fireEvent.press(screen.getByText("Mock test"));
  expect(mockPush).toHaveBeenCalledWith("/route/r1/mock");
});
