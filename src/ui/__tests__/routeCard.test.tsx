import { fireEvent, render, screen } from "@testing-library/react-native";
import { plainSummary } from "@/lib/routeSummary";
import type { ProgressEntry, Route } from "@/types/db";
import { RouteCard } from "../RouteCard";

const route: Route = {
  id: "r1", centre_id: "c1", name: "Route 1 · Town loop",
  geometry: {
    type: "LineString",
    coordinates: [[-0.25, 51.60], [-0.24, 51.605], [-0.23, 51.61], [-0.25, 51.60]],
  },
  estimated_minutes: 18, distance_km: 6.2, difficulty: 2,
  speed_profile: [{ startIdx: 0, endIdx: 3, limitMph: 30 }],
  observation_zones: [{ kind: "roundabout", lat: 51.605, lng: -0.24, radiusM: 30 }],
  is_free: true,
};

const entry = (score: number | null): ProgressEntry => ({
  user_id: "u1", route_id: "r1", mock_test_score: score, mistakes: [], duration_seconds: 1200,
});

const noop = () => {};
const setup = (over: Partial<React.ComponentProps<typeof RouteCard>> = {}) =>
  render(
    <RouteCard
      route={route} favourite={false} width={320}
      onOpen={noop} onStart={noop} onFavourite={noop}
      {...over}
    />
  );

test("names the route without its seeded prefix and describes the drive", () => {
  setup();
  expect(screen.getByText("Town loop")).toBeTruthy();
  expect(screen.getByText("Quiet streets, with a roundabout.")).toBeTruthy();
});

test("labels difficulty with a word beside the pips", () => {
  setup();
  expect(screen.getByText("Gentle")).toBeTruthy();
  expect(screen.getAllByTestId(/^pip/)).toHaveLength(5);
  expect(screen.getAllByTestId("pip-filled")).toHaveLength(2);
});

test("shows time and distance", () => {
  setup();
  expect(screen.getByText("18 min · 6.2 km")).toBeTruthy();
});

test("a route with no history reads as new and shows no history line", () => {
  setup();
  expect(screen.getByTestId("route-badge")).toHaveTextContent("New");
  expect(screen.queryByText(/mock test/)).toBeNull();
});

test("a route with history shows the best score", () => {
  setup({ progress: [entry(64), entry(82)] });
  expect(screen.getByTestId("route-badge")).toHaveTextContent("Best 82");
  expect(screen.getByText("2 mock tests · best score 82")).toBeTruthy();
});

test("draws the route's own shape", () => {
  setup();
  expect(screen.getByTestId("route-thumb")).toBeTruthy();
});

test("a route without geometry still renders rather than throwing", () => {
  setup({ route: { ...route, geometry: { type: "LineString", coordinates: [] } } });
  expect(screen.getByText("Town loop")).toBeTruthy();
  expect(screen.getByTestId("route-thumb-empty")).toBeTruthy();
});

test("Start fires without opening the route", () => {
  const onStart = jest.fn();
  const onOpen = jest.fn();
  setup({ onStart, onOpen });
  fireEvent.press(screen.getByText("Start"));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
});

test("the star toggles favourite", () => {
  const onFavourite = jest.fn();
  setup({ onFavourite });
  fireEvent.press(screen.getByLabelText("Add to favourites"));
  expect(onFavourite).toHaveBeenCalledTimes(1);
});

test("an already-favourited route offers to remove it", () => {
  setup({ favourite: true });
  expect(screen.getByLabelText("Remove from favourites")).toBeTruthy();
});

test("a locked card keeps the drawing and the summary, and says how to get in", () => {
  const { getByText, queryByText, getByTestId } = render(
    <RouteCard route={route} favourite={false} width={320} locked
      onOpen={jest.fn()} onStart={jest.fn()} onFavourite={jest.fn()} />,
  );
  // The drawing and the description are the sell — they must survive locking.
  expect(getByText(plainSummary(route))).toBeTruthy();
  expect(getByTestId("route-badge").props.children).toBe("Locked");
  expect(getByText("Unlock to drive this route")).toBeTruthy();
  // History belongs to a route you have driven; a locked one has none.
  expect(queryByText(/Best/)).toBeNull();
});

test("a locked card hides the favourite control", () => {
  const { queryByLabelText } = render(
    <RouteCard route={route} favourite={false} width={320} locked
      onOpen={jest.fn()} onStart={jest.fn()} onFavourite={jest.fn()} />,
  );
  // Favouriting something you cannot open is a promise the app cannot keep.
  expect(queryByLabelText("Add to favourites")).toBeNull();
});

test("a locked card still opens, so the caller can show the paywall", () => {
  const onOpen = jest.fn();
  const { getByLabelText } = render(
    <RouteCard route={route} favourite={false} width={320} locked
      onOpen={onOpen} onStart={jest.fn()} onFavourite={jest.fn()} />,
  );
  fireEvent.press(getByLabelText(/Town loop/i));
  expect(onOpen).toHaveBeenCalled();
});

test("an unlocked card is unchanged", () => {
  const { getByTestId, queryByText } = render(
    <RouteCard route={route} progress={[]} favourite={false} width={320}
      onOpen={jest.fn()} onStart={jest.fn()} onFavourite={jest.fn()} />,
  );
  expect(getByTestId("route-badge").props.children).not.toBe("Locked");
  expect(queryByText("Unlock to drive this route")).toBeNull();
});
