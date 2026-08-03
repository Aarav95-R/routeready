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

// [zoom, px] fill widths, derived from navigation-day-v1's own published curves
// rather than from a general rule of thumb: that base style already ships wide
// roads (motorway and primary both reach 32 px at z18, street 20 px), so an
// earlier "double the stock width" table written against light-v11 came out
// *narrower* than doing nothing at all.
//
// These land roughly 1.25-1.4x stock across z16-z19, which is the band this
// screen actually navigates in (NAV_ZOOM_FAR 17.5 to NAV_ZOOM_NEAR 18.6), and
// fall back towards stock by z12 so the preview overview does not turn into a
// slab of white.
//
// All three tables use identical stop zooms on purpose: with matching stops,
// linear interpolation preserves motorway > primary > residential at every
// zoom, not just at the stops.
export const roadWidths = {
  motorway: [[12, 4], [14, 10], [16, 20], [18, 40], [19, 44]],
  primary: [[12, 3.5], [14, 9], [16, 19], [18, 38], [19, 42]],
  residential: [[12, 0.6], [14, 2.5], [16, 10], [18, 25], [19, 28]],
} as const satisfies Record<string, Stops>;

// navigation-day-v1's "-case" layers are not wider lines drawn under the fill.
// On them `line-width` is the outline thickness *per side* and `line-gap-width`
// is the hole the fill sits in. So a casing is styled by pointing its gap at
// the matching fill's width table and its width at this constant — overriding
// `line-width` with a casing width instead splits every road into two detached
// grey bars either side of the fill.
//
// 2.5 px either side of a 40 px motorway is the same 6.25% of the road that
// stock's 2 px against 32 px was, so the outline keeps its stock visual weight.
export const ROAD_OUTLINE_PX = 2.5;

// Mapbox style expressions are flat arrays: ["interpolate", ["linear"],
// ["zoom"], z1, w1, z2, w2, ...].
export function lineWidthExpression(stops: Stops): unknown[] {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, w]) => [z, w])];
}
