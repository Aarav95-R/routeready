// Waze-style light palette for the navigation map. The layout copies Waze —
// wide white roads on warm off-white land — but the route and puck stay
// emerald, so the map still reads as this app.
//
// Park green is deliberately low-saturation: a vivid park sitting next to the
// emerald route line would compete with it. The route must always be the
// brightest green on screen.
export const mapColors = {
  land: "#EFEEE8",
  roadFill: "#FFFFFF",
  roadCasing: "#C3C8C1",
  motorwayFill: "#F7DFAE",
  park: "#DCE7CE",
  water: "#A9D3EA",
  building: "#E4E2DB",
  routeCore: "#059669",
  routeCasing: "#04684C",
} as const;

type Stops = readonly (readonly [number, number])[];

// [zoom, width] stops, roughly double the stock widths, so junction shape
// reads three blocks ahead at navigation zoom.
export const roadWidths = {
  motorway: [[15, 7], [17, 15], [19, 30]],
  primary: [[15, 5], [17, 12], [19, 24]],
  residential: [[15, 3], [17, 8], [19, 17]],
} as const satisfies Record<string, Stops>;

// Casings are drawn under the fills; the difference is the visible outline.
export const casingWidths = {
  motorway: [[15, 9], [17, 18], [19, 35]],
  primary: [[15, 7], [17, 15], [19, 29]],
  residential: [[15, 5], [17, 11], [19, 22]],
} as const satisfies Record<string, Stops>;

// Mapbox style expressions are flat arrays: ["interpolate", ["linear"],
// ["zoom"], z1, w1, z2, w2, ...].
export function lineWidthExpression(stops: Stops): unknown[] {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, w]) => [z, w])];
}
