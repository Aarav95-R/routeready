import { colors } from "@/ui/theme";

// Waze-style light palette for the navigation map. The layout copies Waze —
// wide white roads on warm off-white land — but the route and puck stay the
// app's own green, so the map still reads as this app.
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
  // The accent itself, not a copy of it. A second hex here is how the route
  // line and the app's green drifted apart the first time.
  routeCore: colors.accent,
  routeCasing: "#115B41",
  // The part already driven. Green means road still to drive, grey means done,
  // so progress reads at a glance and the only bright thing on the map is what
  // is still ahead. The greys carry a slight green bias to belong to the same
  // map as roadCasing, but are darker than it on purpose: a driven route runs
  // along white roads and still has to read as a line rather than vanish.
  routeDrivenCore: "#A7AEA5",
  routeDrivenCasing: "#7F8880",
} as const;

type Stops = readonly (readonly [number, number])[];

// [zoom, px] fill widths, derived from navigation-day-v1's own published curves
// rather than from a general rule of thumb: that base style already ships wide
// roads (motorway and primary both reach 32 px at z18, street 20 px), so an
// earlier "double the stock width" table written against light-v11 came out
// *narrower* than doing nothing at all.
//
// These land roughly 1.25-1.4x stock across z16-z19, which is the band the
// navigation screen actually drives in (NAV_ZOOM_FAR 17.5 to NAV_ZOOM_NEAR
// 18.6), and fall back towards stock by z12 so the preview overview does not
// turn into a slab of white.
//
// The z5 and z10 stops carry that fallback the rest of the way down, and they
// exist for the centres map rather than for navigation. That screen fits a
// 30-mile near set, or the whole country when there is no fix, so it sits at
// roughly z5-z11 — entirely below what used to be the lowest stop. An
// interpolation clamps to its end value outside its stops, so without these it
// drew 4px motorways and 3.5px A-roads across the whole of England, where
// stock is 1.25px and 1.1px. They match stock rather than beating it: at that
// zoom the roads are context for the pins, not the thing being read.
//
// All three tables use identical stop zooms on purpose: with matching stops,
// linear interpolation preserves motorway > primary > residential at every
// zoom, not just at the stops.
export const roadWidths = {
  motorway: [[5, 1.25], [10, 2.3], [12, 4], [14, 10], [16, 20], [18, 40], [19, 44]],
  primary: [[5, 1], [10, 1.2], [12, 3.5], [14, 9], [16, 19], [18, 38], [19, 42]],
  residential: [[5, 0.4], [10, 0.5], [12, 0.6], [14, 2.5], [16, 10], [18, 25], [19, 28]],
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

type WidthClass = keyof typeof roadWidths;

// How a layer is treated, independent of which layer it is. Kept separate from
// the id so the same treatment can be named once and applied to the road,
// bridge and tunnel copies of a class — and so `& { id }` distributes over the
// union, which `Omit<RoadLayer, "id">` would not.
type RoadStyle =
  | { kind: "case"; width: WidthClass }
  | { kind: "fill"; width: WidthClass; color: string }
  | { kind: "recolour"; color: string };

export type RoadLayer = RoadStyle & { id: string };

// navigation-day-v1 draws every road class three times — at grade, on a
// bridge, and in a tunnel — with ids that differ only in this prefix. All
// three need the same treatment: styling just the "road-" set leaves a
// carriageway changing colour and width halfway across a flyover.
const SURFACES = ["road", "bridge", "tunnel"] as const;

// The classes all three surfaces share. `-low` is the low-zoom fill variant.
//
// Two deliberate choices carried over from the surface roads: slip roads
// ("major-link") take the motorway's sand fill but a street's width, because
// that is how stock draws them; and the "minor" family — service roads,
// car-park aisles, tracks — is recoloured to the palette but keeps its stock
// width, since widening an aisle to street width would make it read as a
// turning the driver could be asked to take.
const SHARED: readonly (RoadStyle & { suffix: string })[] = [
  { suffix: "minor-case-navigation", kind: "recolour", color: mapColors.roadCasing },
  { suffix: "minor-navigation", kind: "recolour", color: mapColors.roadFill },
  { suffix: "street-low-navigation", kind: "fill", width: "residential", color: mapColors.roadFill },
  { suffix: "street-case-navigation", kind: "case", width: "residential" },
  { suffix: "street-navigation", kind: "fill", width: "residential", color: mapColors.roadFill },
  { suffix: "secondary-tertiary-case-navigation", kind: "case", width: "primary" },
  { suffix: "secondary-tertiary-navigation", kind: "fill", width: "primary", color: mapColors.roadFill },
  { suffix: "primary-case-navigation", kind: "case", width: "primary" },
  { suffix: "primary-navigation", kind: "fill", width: "primary", color: mapColors.roadFill },
  { suffix: "major-link-case-navigation", kind: "case", width: "residential" },
  { suffix: "major-link-navigation", kind: "fill", width: "residential", color: mapColors.motorwayFill },
  { suffix: "motorway-trunk-case-navigation", kind: "case", width: "motorway" },
  { suffix: "motorway-trunk-navigation", kind: "fill", width: "motorway", color: mapColors.motorwayFill },
];

// Layers only one surface has: an extra low-zoom motorway casing at grade, and
// the second deck bridges use where two carriageways stack.
const EXTRAS: readonly RoadLayer[] = [
  { id: "road-motorway-trunk-case-low-navigation", kind: "case", width: "motorway" },
  { id: "bridge-major-link-2-case-navigation", kind: "case", width: "residential" },
  { id: "bridge-major-link-2-navigation", kind: "fill", width: "residential", color: mapColors.motorwayFill },
  { id: "bridge-motorway-trunk-2-case-navigation", kind: "case", width: "motorway" },
  { id: "bridge-motorway-trunk-2-navigation", kind: "fill", width: "motorway", color: mapColors.motorwayFill },
];

// Not styled, on purpose: the three "*-construction-navigation" layers keep
// their stock look so a road under construction still reads as one, and it
// reads the same whether it is at grade, on a bridge or in a tunnel. The four
// rail layers are not roads.
export const roadLayers: readonly RoadLayer[] = [
  ...SURFACES.flatMap((surface) =>
    SHARED.map(({ suffix, ...rest }) => ({ id: `${surface}-${suffix}`, ...rest } as RoadLayer))
  ),
  ...EXTRAS,
];

// Congestion ribbons. navigation-day-v1 ships these where light-v11 did not;
// traffic is out of scope, their "low" green (hsl(120,70%,60%)) would outshine
// the emerald route, and their line-offset is interpolated against stock road
// widths so with the fills rewritten they no longer sit on the road.
// Enumerated from the style JSON: every line layer on the "traffic"
// source-layer. The "traffic-road-oneway-arrow-*" layers are symbols on the
// "road" source-layer and are deliberately absent.
export const trafficLayerIds: readonly string[] = [
  "traffic-tunnel-link-navigation",
  "traffic-tunnel-minor-navigation",
  "traffic-tunnel-street-navigation",
  "traffic-tunnel-secondary-tertiary-navigation",
  "traffic-tunnel-primary-navigation",
  "traffic-tunnel-major-link-navigation",
  "traffic-tunnel-motorway-trunk-navigation",
  "traffic-bridge-road-link-navigation",
  "traffic-bridge-road-minor-navigation",
  "traffic-bridge-road-street-navigation",
  "traffic-bridge-road-secondary-tertiary-navigation",
  "traffic-bridge-road-primary-navigation",
  "traffic-bridge-road-major-link-navigation",
  "traffic-bridge-road-motorway-trunk-case-navigation",
  "traffic-bridge-road-motorway-trunk-navigation",
];
