import { createRef } from "react";
import { act, render, screen } from "@testing-library/react-native";

// Kept outside __tests__ so jest does not collect it as a suite of its own.
jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));

import type { CentreIdentity } from "@/lib/centreIdentity";
import type { Centre } from "@/types/db";
import { CentresMap, CentresMapHandle } from "../CentresMap";

const centre = (id: string, lat: number, lng: number): Centre => ({
  id, name: id, address: "", lat, lng, pass_rate: 40,
  pass_rate_history: [], test_types: ["manual"], region: "Greater London",
});

const identity: CentreIdentity = { hue: "#BE123C", tint: "#FFF1F2", initials: "MH", seed: 1 };

const pins = [centre("a", 51.60, -0.24), centre("b", 51.63, -0.16)];
const identities = new Map(pins.map((p) => [p.id, identity]));

const setup = (over: Partial<React.ComponentProps<typeof CentresMap>> = {}) =>
  render(
    <CentresMap
      ref={createRef<CentresMapHandle>()}
      pins={pins}
      frame={pins}
      identities={identities}
      me={{ lat: 51.601, lng: -0.235 }}
      activeId={null}
      {...over}
    />
  );

const shapeOf = (id: string) => screen.getByTestId(`source:${id}`).props.shape;
const fitCalls = () => screen.getByTestId("camera:").props.fitBounds.mock.calls;

// Pins and rings now arrive on a stagger (see the two tests below), so any
// test that wants the *settled* map — every pin, every ring, present — has
// to run the reveal to completion first. 10s comfortably clears the longest
// stagger for any fixture in this file.
const settleReveal = () => act(() => jest.advanceTimersByTime(10_000));

// The centres map and the navigation map are one map at two zooms. This screen
// used to add a background layer of its own instead of overriding the style's,
// and an added layer goes to the top of the stack — so the whole map was a
// flat tan rectangle with pins on it, roads and all.
test("the map is drawn on the same styled base as the route map", () => {
  setup();
  expect(screen.getByTestId("layer:land").props.existing).toBe(true);
  expect(screen.getByTestId("layer:road-motorway-trunk-navigation")).toBeTruthy();
  expect(screen.queryByTestId("layer:ground")).toBeNull();
});

test("rings, pins and the driver each get a source that is always mounted", () => {
  setup();
  for (const id of ["rings", "pins", "me"]) {
    expect(screen.getByTestId(`source:${id}`)).toBeTruthy();
  }
});

test("the sources stay mounted with no fix and no pins, holding empty collections", () => {
  setup({ me: null, pins: [], identities: new Map() });
  for (const id of ["rings", "pins", "me"]) {
    expect(screen.getByTestId(`source:${id}`)).toBeTruthy();
    expect(shapeOf(id).features).toEqual([]);
  }
});

test("one ring feature per distance band", () => {
  jest.useFakeTimers();
  setup();
  settleReveal();
  expect(shapeOf("rings").features).toHaveLength(3);
  expect(shapeOf("rings").features[0].geometry.type).toBe("Polygon");
  jest.useRealTimers();
});

test("each pin carries its own colour and monogram as feature properties", () => {
  jest.useFakeTimers();
  setup();
  settleReveal();
  const features = shapeOf("pins").features;
  expect(features).toHaveLength(2);
  expect(features[0].properties).toMatchObject({ id: "a", hue: "#BE123C", initials: "MH" });
  expect(features[0].geometry.coordinates).toEqual([-0.24, 51.60]);
  jest.useRealTimers();
});

test("the active pin is flagged so the style can lift it", () => {
  jest.useFakeTimers();
  setup({ activeId: "b" });
  settleReveal();
  const features = shapeOf("pins").features;
  expect(features.find((f: any) => f.properties.id === "b").properties.active).toBe(true);
  expect(features.find((f: any) => f.properties.id === "a").properties.active).toBe(false);
  jest.useRealTimers();
});

test("pins arrive one at a time rather than all at once", () => {
  jest.useFakeTimers();
  setup();

  // Nothing on the map on the first frame; the stagger fills it in.
  expect(shapeOf("pins").features).toHaveLength(0);

  act(() => jest.advanceTimersByTime(70));
  expect(shapeOf("pins").features).toHaveLength(1);

  act(() => jest.advanceTimersByTime(70 * 5));
  expect(shapeOf("pins").features).toHaveLength(2);
  jest.useRealTimers();
});

// Replaces "a changed pin set restarts the reveal rather than jumping". The
// stagger is an entrance, and `pins` is a fresh array on every recompute of
// the screen's sections — so keying the reveal on its identity meant one
// keystroke in search blanked the map and re-dropped every pin at 70ms
// apiece, which is the opposite of the spec's "re-sorting never repaints
// anything". The entrance now runs once, on the first non-empty set.
test("a changed pin set after the first reveal renders at once, without restarting it", () => {
  jest.useFakeTimers();
  const { rerender } = setup();
  settleReveal();
  expect(shapeOf("pins").features).toHaveLength(2);

  const grown = [...pins, centre("c", 51.65, -0.08)];
  rerender(
    <CentresMap
      pins={grown}
      frame={grown}
      identities={new Map([...identities, ["c", identity]])}
      me={{ lat: 51.601, lng: -0.235 }}
      activeId={null}
    />
  );

  // No return to zero, and no timers left to advance for.
  expect(shapeOf("pins").features).toHaveLength(3);
  jest.useRealTimers();
});

test("the camera fits the frame on first paint", () => {
  jest.useFakeTimers();
  setup();
  expect(fitCalls()).toHaveLength(1);
  const [ne, sw] = fitCalls()[0];
  // Both pins and the driver, inside the bounds rather than merely near them.
  expect(ne[0]).toBeGreaterThanOrEqual(-0.16);
  expect(ne[1]).toBeGreaterThanOrEqual(51.63);
  expect(sw[0]).toBeLessThanOrEqual(-0.24);
  expect(sw[1]).toBeLessThanOrEqual(51.60);
  jest.useRealTimers();
});

// The no-permission half of the same requirement: there are no pins at all,
// so a fit computed from `pins` would find no points and return early,
// leaving the base style's own camera wherever it happened to open.
test("with no fix and no pins, the camera still fits every centre in the frame", () => {
  jest.useFakeTimers();
  const all = [...pins, centre("newcastle", 54.97, -1.61)];
  setup({ me: null, pins: [], identities: new Map(), frame: all });

  expect(fitCalls()).toHaveLength(1);
  const [ne, sw] = fitCalls()[0];
  expect(ne[1]).toBeGreaterThanOrEqual(54.97);
  expect(sw[0]).toBeLessThanOrEqual(-1.61);
  jest.useRealTimers();
});

test("a frame losing a point refits the camera to what is left", () => {
  jest.useFakeTimers();
  const wide = [...pins, centre("newcastle", 54.97, -1.61)];
  const { rerender } = setup({ frame: wide });
  expect(fitCalls()).toHaveLength(1);
  expect(fitCalls()[0][0][1]).toBeGreaterThanOrEqual(54.97);

  rerender(
    <CentresMap pins={pins} frame={pins} identities={identities}
      me={{ lat: 51.601, lng: -0.235 }} activeId={null} />
  );

  expect(fitCalls()).toHaveLength(2);
  expect(fitCalls()[1][0][1]).toBeLessThan(52);
  jest.useRealTimers();
});

// The spec's rule that re-sorting "never repaints anything" reaches the
// camera too: Nearest to Pass rate hands the map the same centres in a
// different order, and a fit keyed on array order would ease to identical
// bounds for no reason.
test("reordering the frame without changing the set does not refit", () => {
  jest.useFakeTimers();
  const { rerender } = setup();
  expect(fitCalls()).toHaveLength(1);

  rerender(
    <CentresMap pins={pins} frame={[...pins].reverse()} identities={identities}
      me={{ lat: 51.601, lng: -0.235 }} activeId={null} />
  );

  expect(fitCalls()).toHaveLength(1);
  jest.useRealTimers();
});

// A search narrowing to one match is degenerate bounds, which Mapbox answers
// by zooming to the maximum — a street view of a single pin.
test("a single-point frame is widened rather than fitted to a zero span", () => {
  jest.useFakeTimers();
  const one = [centre("a", 51.60, -0.24)];
  setup({ me: null, pins: one, identities, frame: one });
  const [ne, sw] = fitCalls()[0];
  expect(ne[0] - sw[0]).toBeGreaterThan(0.01);
  expect(ne[1] - sw[1]).toBeGreaterThan(0.01);
  jest.useRealTimers();
});

test("the active centre is drawn as a marker, not as one of the static pins", () => {
  jest.useFakeTimers();
  setup({ activeId: "b" });
  act(() => jest.advanceTimersByTime(10_000));

  // A layer cannot animate a change that arrives as source data, so the active
  // pin is filtered out of the layers and drawn as a view instead.
  expect(screen.getByTestId("marker:active-centre")).toBeTruthy();
  expect(screen.getByTestId("active-marker-name")).toHaveTextContent("b");
  for (const layer of ["pin-body", "pin-initials"]) {
    expect(screen.getByTestId(`layer:${layer}`).props.filter).toEqual(["!", ["get", "active"]]);
  }
  jest.useRealTimers();
});

test("no active centre means no marker at all", () => {
  jest.useFakeTimers();
  setup({ activeId: null });
  act(() => jest.advanceTimersByTime(10_000));
  expect(screen.queryByTestId("marker:active-centre")).toBeNull();
  jest.useRealTimers();
});

test("the marker's distance comes from the driver's own position", () => {
  jest.useFakeTimers();
  setup({ activeId: "a", me: { lat: 51.55, lng: -0.24 } });
  act(() => jest.advanceTimersByTime(10_000));
  // (51.55,-0.24) to a's (51.60,-0.24) is ~5.6km, ~3.5 miles.
  expect(screen.getByTestId("active-marker-distance")).toHaveTextContent("3.5 mi away");
  jest.useRealTimers();
});
