import { render, screen } from "@testing-library/react-native";

// Kept outside __tests__ so jest does not collect it as a suite of its own, and
// in its own module because nativewind's JSX transform injects a helper that a
// jest.mock factory is not allowed to reference.
jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));

// eslint-disable-next-line import/first
import { NavMap } from "../NavMap";

const routeLL = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.11 },
  { lat: 51.52, lng: -0.12 },
  { lat: 51.53, lng: -0.13 },
];

const base = {
  routeLL,
  trailIdx: 0,
  pos: null,
  iconRotation: 0,
  follow: true,
  onFollowChange: () => {},
};

const sourceIds = () =>
  screen.queryAllByTestId(/^source:/).map((n) => n.props.testID as string).sort();

// Mounting or unmounting a ShapeSource mid-drive is what produces
// "Source 'route' is not in style" from the native SDK: the source is torn out
// of the style while layer views that still name it are re-added on top. The
// fix is that no source is ever added or removed after the map is up, so these
// assert the mounted set never changes.
test("the preview to live swap adds and removes no source", () => {
  render(<NavMap {...base} preview />);
  const before = sourceIds();

  screen.rerender(<NavMap {...base} preview={false} pos={routeLL[0]} />);

  expect(sourceIds()).toEqual(before);
});

test("the trail appearing on the first fix adds no source", () => {
  render(<NavMap {...base} preview={false} pos={routeLL[0]} />);
  const before = sourceIds();

  screen.rerender(<NavMap {...base} preview={false} pos={routeLL[1]} trailIdx={1} />);

  expect(sourceIds()).toEqual(before);
});

test("the route arriving after the map adds no source", () => {
  render(<NavMap {...base} routeLL={[]} preview />);
  const before = sourceIds();

  screen.rerender(<NavMap {...base} preview />);

  expect(sourceIds()).toEqual(before);
});

// The sources never unmount now, so what each one is *handed* is the only thing
// left deciding what gets drawn.
const coordsOf = (id: string) =>
  screen.getByTestId(`source:${id}`).props.shape.features[0]?.geometry.coordinates ?? [];

test("preview hands the whole route to the road ahead and nothing to the trail", () => {
  render(<NavMap {...base} preview />);

  expect(coordsOf("ahead")).toHaveLength(routeLL.length);
  expect(coordsOf("trail")).toHaveLength(0);
});

test("driving splits the route at the trail index", () => {
  render(<NavMap {...base} preview={false} pos={routeLL[2]} trailIdx={2} />);

  // The split vertex belongs to both halves, so the two lines meet.
  expect(coordsOf("trail")).toEqual([[-0.1, 51.5], [-0.11, 51.51], [-0.12, 51.52]]);
  expect(coordsOf("ahead")).toEqual([[-0.12, 51.52], [-0.13, 51.53]]);
});

test("a route of one point draws no line rather than a degenerate one", () => {
  render(<NavMap {...base} routeLL={routeLL.slice(0, 1)} preview />);

  expect(coordsOf("ahead")).toHaveLength(0);
});

test("observation zones arriving after the map adds no source", () => {
  render(<NavMap {...base} preview />);
  const before = sourceIds();

  screen.rerender(
    <NavMap {...base} preview observationZones={[{ lat: 51.51, lng: -0.11, radiusM: 30 } as any]} />
  );

  expect(sourceIds()).toEqual(before);
});
