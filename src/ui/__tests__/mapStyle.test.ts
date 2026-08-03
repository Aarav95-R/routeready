import { lineWidthExpression, mapColors, ROAD_OUTLINE_PX, roadWidths } from "../mapStyle";

// Stock navigation-day-v1 fill widths, read from the published style JSON, at
// the top of the band this screen navigates in. The whole point of the width
// tables is to beat these; if the base style is ever swapped, these have to be
// re-read rather than trusted.
const STOCK_AT_Z18 = { motorway: 32, primary: 32, residential: 20 } as const;

test("palette entries are all six-digit uppercase hex", () => {
  for (const value of Object.values(mapColors)) {
    expect(value).toMatch(/^#[0-9A-F]{6}$/);
  }
});

test("the route stays the brightest green — park is well desaturated", () => {
  expect(mapColors.routeCore).toBe("#059669");
  expect(mapColors.routeCasing).toBe("#04684C");
  expect(mapColors.park).toBe("#DCE7CE");
});

test("road widths grow with zoom", () => {
  for (const stops of Object.values(roadWidths)) {
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      expect(stops[i][1]).toBeGreaterThan(stops[i - 1][1]);
    }
  }
});

// The classes are only guaranteed to stay ordered between the stops if they
// interpolate over the same zooms — different stops let a lower class overtake
// a higher one mid-interval.
test("every class interpolates over identical stop zooms", () => {
  const zoomsOf = (s: readonly (readonly [number, number])[]) => s.map(([z]) => z);
  const reference = zoomsOf(roadWidths.motorway);
  for (const stops of Object.values(roadWidths)) {
    expect(zoomsOf(stops)).toEqual(reference);
  }
});

test("bigger roads are wider than smaller roads at every stop", () => {
  roadWidths.motorway.forEach(([, motorway], i) => {
    expect(motorway).toBeGreaterThan(roadWidths.primary[i][1]);
    expect(roadWidths.primary[i][1]).toBeGreaterThan(roadWidths.residential[i][1]);
  });
});

// The bug this replaces a test for: the previous table was authored against a
// different base style and came out narrower than doing nothing at all.
test("the tables are wider than stock navigation-day-v1 at navigation zoom", () => {
  const at = (s: readonly (readonly [number, number])[], zoom: number) =>
    s.find(([z]) => z === zoom)![1];
  for (const [cls, stock] of Object.entries(STOCK_AT_Z18)) {
    const ours = at(roadWidths[cls as keyof typeof roadWidths], 18);
    expect(ours).toBeGreaterThan(stock * 1.15);
  }
});

// A "-case" layer outlines a gap rather than sitting under the fill, so the
// only thing the outline has to be is a positive number small against the road.
test("the casing outline is a slim positive constant, not a road width", () => {
  expect(ROAD_OUTLINE_PX).toBe(2.5);
  expect(ROAD_OUTLINE_PX).toBeGreaterThan(0);
  for (const stops of Object.values(roadWidths)) {
    // Never so thick that it swallows the fill it is meant to edge.
    expect(ROAD_OUTLINE_PX * 2).toBeLessThan(stops[stops.length - 1][1]);
  }
});

test("lineWidthExpression flattens stops into a mapbox interpolate expression", () => {
  expect(lineWidthExpression([[15, 5], [19, 24]])).toEqual([
    "interpolate", ["linear"], ["zoom"], 15, 5, 19, 24,
  ]);
});

test("all eleven palette colors have exact correct values", () => {
  expect(mapColors).toEqual({
    land: "#EFEEE8",
    roadFill: "#FFFFFF",
    roadCasing: "#C3C8C1",
    motorwayFill: "#F7DFAE",
    park: "#DCE7CE",
    water: "#A9D3EA",
    building: "#E4E2DB",
    routeCore: "#059669",
    routeCasing: "#04684C",
    routeDrivenCore: "#A7AEA5",
    routeDrivenCasing: "#7F8880",
  });
});

test("road width stops have exact correct values", () => {
  expect(roadWidths).toEqual({
    motorway: [[12, 4], [14, 10], [16, 20], [18, 40], [19, 44]],
    primary: [[12, 3.5], [14, 9], [16, 19], [18, 38], [19, 42]],
    residential: [[12, 0.6], [14, 2.5], [16, 10], [18, 25], [19, 28]],
  });
});

import { roadLayers, roadWidths as widths, trafficLayerIds } from "../mapStyle";

// The 13 road classes navigation-day-v1 draws identically at grade, on a
// bridge and in a tunnel. Enumerated from the style JSON, not from the table
// under test — that is what makes this a check rather than a mirror.
const SHARED_FAMILIES = [
  "minor-case-navigation",
  "minor-navigation",
  "street-low-navigation",
  "street-case-navigation",
  "street-navigation",
  "secondary-tertiary-case-navigation",
  "secondary-tertiary-navigation",
  "primary-case-navigation",
  "primary-navigation",
  "major-link-case-navigation",
  "major-link-navigation",
  "motorway-trunk-case-navigation",
  "motorway-trunk-navigation",
];

test("every road class is styled on all three surfaces", () => {
  // The bug this prevents: styling only "road-" left bridges and tunnels at
  // stock, so a carriageway changed colour and width halfway across a flyover.
  const ids = new Set(roadLayers.map((l) => l.id));
  for (const family of SHARED_FAMILIES) {
    for (const surface of ["road", "bridge", "tunnel"]) {
      expect(ids).toContain(`${surface}-${family}`);
    }
  }
});

test("the surface-specific extras are exactly the ones the style has", () => {
  const ids = roadLayers.map((l) => l.id);
  const shared = new Set(
    ["road", "bridge", "tunnel"].flatMap((s) => SHARED_FAMILIES.map((f) => `${s}-${f}`))
  );
  expect(ids.filter((id) => !shared.has(id)).sort()).toEqual([
    "bridge-major-link-2-case-navigation",
    "bridge-major-link-2-navigation",
    "bridge-motorway-trunk-2-case-navigation",
    "bridge-motorway-trunk-2-navigation",
    "road-motorway-trunk-case-low-navigation",
  ]);
});

test("layer ids are unique and all belong to this style", () => {
  const ids = roadLayers.map((l) => l.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    expect(id).toMatch(/^(road|bridge|tunnel)-[a-z0-9-]+-navigation$/);
  }
});

test("every width class named by a layer actually exists", () => {
  for (const l of roadLayers) {
    if (l.kind === "recolour") continue;
    expect(Object.keys(widths)).toContain(l.width);
  }
});

test("each casing uses the same width table as the fill it outlines", () => {
  // A casing's gap has to track its fill's width or the outline stops sitting
  // flush against the road.
  const byId = new Map(roadLayers.map((l) => [l.id, l]));
  for (const l of roadLayers) {
    if (l.kind !== "case") continue;
    const fill = byId.get(l.id.replace("-case-", "-"));
    if (!fill || fill.kind !== "fill") continue; // -case-low has no fill sibling
    expect(fill.width).toBe(l.width);
  }
});

test("traffic layers are all congestion ribbons, and there are 15", () => {
  expect(trafficLayerIds).toHaveLength(15);
  expect(new Set(trafficLayerIds).size).toBe(15);
  for (const id of trafficLayerIds) expect(id).toMatch(/^traffic-.*-navigation$/);
});

test("the driven half of the route recedes against the half still to drive", () => {
  // Progress has to read at a glance: bright ahead, muted behind.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const sat = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...c) - Math.min(...c);
  };
  // Driven is the paler of the two...
  expect(lum(mapColors.routeDrivenCore)).toBeGreaterThan(lum(mapColors.routeCore));
  // ...and, more to the point, drained of colour next to it.
  expect(sat(mapColors.routeDrivenCore)).toBeLessThan(sat(mapColors.routeCore) / 4);
  // Its casing stays darker than its core, so the line keeps an edge.
  expect(lum(mapColors.routeDrivenCasing)).toBeLessThan(lum(mapColors.routeDrivenCore));
  // And both sit darker than the road casing, or a driven route would vanish
  // into the white roads it runs along.
  expect(lum(mapColors.routeDrivenCore)).toBeLessThan(lum(mapColors.roadCasing));
});
