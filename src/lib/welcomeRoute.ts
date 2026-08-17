import type { GeoLineString } from "@/types/db";

/**
 * The route drawn on the first-run card, before anyone has chosen a centre.
 *
 * It is an example, not a route in the database: on first run there is no
 * centre and therefore nothing real to draw, and the card is where somebody
 * decides whether to get in the car. A shape with turns in it says "a town
 * loop with junctions" faster than the sentence beside it can.
 *
 * Written as coordinates rather than as SVG so it goes through `thumbPath`
 * like every other route in the app — same projection, same padding, same
 * animated draw-on. A drawing built any other way would drift from the real
 * ones the moment either changes.
 */
export const WELCOME_ROUTE: GeoLineString = {
  type: "LineString",
  coordinates: [
    [-0.2500, 51.6000],
    [-0.2374, 51.6000],
    [-0.2320, 51.6016],
    [-0.2320, 51.6096],
    [-0.2266, 51.6144],
    [-0.2104, 51.6144],
    [-0.2050, 51.6096],
    [-0.2050, 51.6048],
    [-0.1996, 51.6000],
    [-0.1852, 51.6000],
  ],
};
