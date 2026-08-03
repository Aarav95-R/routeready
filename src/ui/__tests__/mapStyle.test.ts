import { casingWidths, lineWidthExpression, mapColors, roadWidths } from "../mapStyle";

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
  for (const stops of [...Object.values(roadWidths), ...Object.values(casingWidths)]) {
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      expect(stops[i][1]).toBeGreaterThan(stops[i - 1][1]);
    }
  }
});

test("bigger roads are wider than smaller roads at nav zoom", () => {
  const at19 = (s: readonly (readonly [number, number])[]) => s[s.length - 1][1];
  expect(at19(roadWidths.motorway)).toBeGreaterThan(at19(roadWidths.primary));
  expect(at19(roadWidths.primary)).toBeGreaterThan(at19(roadWidths.residential));
  expect(at19(roadWidths.residential)).toBeGreaterThan(15);
});

test("casings are wider than the fills they sit under", () => {
  const at19 = (s: readonly (readonly [number, number])[]) => s[s.length - 1][1];
  expect(at19(casingWidths.motorway)).toBeGreaterThan(at19(roadWidths.motorway));
  expect(at19(casingWidths.primary)).toBeGreaterThan(at19(roadWidths.primary));
  expect(at19(casingWidths.residential)).toBeGreaterThan(at19(roadWidths.residential));
});

test("lineWidthExpression flattens stops into a mapbox interpolate expression", () => {
  expect(lineWidthExpression([[15, 5], [19, 24]])).toEqual([
    "interpolate", ["linear"], ["zoom"], 15, 5, 19, 24,
  ]);
});

test("all nine palette colors have exact correct values", () => {
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
  });
});

test("road width and casing stops have exact correct values", () => {
  expect(roadWidths).toEqual({
    motorway: [[15, 7], [17, 15], [19, 30]],
    primary: [[15, 5], [17, 12], [19, 24]],
    residential: [[15, 3], [17, 8], [19, 17]],
  });

  expect(casingWidths).toEqual({
    motorway: [[15, 9], [17, 18], [19, 35]],
    primary: [[15, 7], [17, 15], [19, 29]],
    residential: [[15, 5], [17, 11], [19, 22]],
  });
});
