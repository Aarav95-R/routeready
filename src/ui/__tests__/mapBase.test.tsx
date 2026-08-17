import { render, screen } from "@testing-library/react-native";

jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));

import { roadLayers, trafficLayerIds } from "../mapStyle";
import { MapBase } from "../MapBase";

const layer = (id: string) => screen.getByTestId(`layer:${id}`);

// The bug this file exists for: a layer rendered without `existing` is not an
// override of the style's layer of that name, it is a new layer appended to
// the *top* of the stack. An added background is therefore an opaque sheet
// over the entire map — which is what the centres screen used to draw, hiding
// every road, park and label under a flat tan rectangle.
test("every base layer overrides one of the style's own, adding none", () => {
  render(<MapBase />);
  for (const el of screen.getAllByTestId(/^layer:/)) {
    expect(el.props.existing).toBe(true);
  }
});

test("the ground is the style's own background layer", () => {
  render(<MapBase />);
  expect(layer("land").props.existing).toBe(true);
});

test("the whole road table reaches the map, on all three surfaces", () => {
  render(<MapBase />);
  // Not a spot check: a road left out is a carriageway that changes colour
  // where it crosses a bridge.
  for (const l of roadLayers) expect(layer(l.id)).toBeTruthy();
});

test("the congestion ribbons are all mounted, to be hidden", () => {
  render(<MapBase />);
  for (const id of trafficLayerIds) expect(layer(id)).toBeTruthy();
});

test("water, parks and buildings are recoloured too", () => {
  render(<MapBase />);
  for (const id of ["landuse", "water", "building"]) expect(layer(id)).toBeTruthy();
});
