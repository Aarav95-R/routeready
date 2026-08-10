import { createRef } from "react";
import { render, screen } from "@testing-library/react-native";

// Kept outside __tests__ so jest does not collect it as a suite of its own.
jest.mock("@rnmapbox/maps", () => require("../../test/rnmapboxMock"));

// eslint-disable-next-line import/first
import type { CentreIdentity } from "@/lib/centreIdentity";
// eslint-disable-next-line import/first
import type { Centre } from "@/types/db";
// eslint-disable-next-line import/first
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
      identities={identities}
      me={{ lat: 51.601, lng: -0.235 }}
      activeId={null}
      {...over}
    />
  );

const shapeOf = (id: string) => screen.getByTestId(`source:${id}`).props.shape;

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
  setup();
  expect(shapeOf("rings").features).toHaveLength(3);
  expect(shapeOf("rings").features[0].geometry.type).toBe("Polygon");
});

test("each pin carries its own colour and monogram as feature properties", () => {
  setup();
  const features = shapeOf("pins").features;
  expect(features).toHaveLength(2);
  expect(features[0].properties).toMatchObject({ id: "a", hue: "#BE123C", initials: "MH" });
  expect(features[0].geometry.coordinates).toEqual([-0.24, 51.60]);
});

test("the active pin is flagged so the style can lift it", () => {
  setup({ activeId: "b" });
  const features = shapeOf("pins").features;
  expect(features.find((f: any) => f.properties.id === "b").properties.active).toBe(true);
  expect(features.find((f: any) => f.properties.id === "a").properties.active).toBe(false);
});
