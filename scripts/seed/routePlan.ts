import { bearingDeg, haversineM, type LatLng } from "../../src/lib/geo";
import type { OsrmStep } from "./osrm";

/**
 * Planning practice routes out of OpenStreetMap, rather than out of a compass.
 *
 * The generator used to draw three loops per centre from bearings and radii,
 * which put waypoints wherever the arithmetic landed — sometimes a dual
 * carriageway, sometimes a cul-de-sac, and never on purpose. DVSA has not
 * published real test routes since 2010 and what is sold online is licensed,
 * so the honest alternative is to build routes that are plausible *by
 * construction*: string together the things a test actually examines, which
 * OSM already knows the position of.
 *
 * Everything here is pure. The Overpass call lives in overpass.ts so this can
 * be tested without a network.
 */

/**
 * The things a driving test is made of, as OSM knows them.
 *
 * Wider than the original four because a route is now built from the *phases*
 * of a test rather than from three waypoints on a compass — and two of those
 * phases need distinctions the old list could not make. A signalled junction
 * is examined differently from a roundabout; a dual carriageway is the fastest
 * road a test uses and is joined and left differently from a single-
 * carriageway A road; and a manoeuvre needs a street it is actually possible
 * to stop on.
 */
export type FeatureKind =
  | "roundabout"   // give way, lane discipline, counting exits
  | "signals"      // a signalled junction — the other half of junction work
  | "crossing"     // zebra and signalled pedestrian crossings
  | "fast"         // single-carriageway primary or trunk
  | "dual"         // dual carriageway
  | "estate"       // residential: slow speed, parked cars, observation
  | "parking";     // residential with on-street parking — somewhere to manoeuvre
export type Feature = LatLng & { kind: FeatureKind };

/** An Overpass element, as far as this module cares. */
export type OverpassElement = {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
};

export function classify(el: OverpassElement): Feature | null {
  // Overpass puts a way's position under `center` (from `out center`) and a
  // node's on the element itself. Reading one and not the other silently
  // drops every result of the other type.
  const pos = el.center ?? (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : null);
  if (!pos) return null;
  const t = el.tags ?? {};

  // Two carriageways is the fastest thing a test will use, and it is examined
  // differently from a single-carriageway A road — joining, lane changes, a
  // national speed limit. Tagged outright in some places and only implied in
  // others, so both spellings are accepted.
  const isDual =
    t.dual_carriageway === "yes" ||
    (t.oneway === "yes" && Number(t.lanes ?? "0") >= 2);

  // A manoeuvre needs somewhere legal to stop, and parked cars are the signal
  // OSM actually carries for that. The key is spelt several ways
  // (parking:lane:both, :left, :right, and the newer parking:both), so the
  // prefix is matched rather than any one of them.
  const hasKerbsideParking = Object.entries(t).some(
    ([k, v]) => k.startsWith("parking:") && /parallel|diagonal|perpendicular/.test(v)
  );

  const kind: FeatureKind | null =
    t.junction === "roundabout" ? "roundabout"
    : t.highway === "traffic_signals" ? "signals"
    : t.highway === "crossing" ? "crossing"
    : t.highway === "primary" || t.highway === "trunk" ? (isDual ? "dual" : "fast")
    : t.highway === "residential" ? (hasKerbsideParking ? "parking" : "estate")
    : null;
  return kind ? { kind, lat: pos.lat, lng: pos.lon } : null;
}

/** `"ring"` is a waypoint no OSM feature could be found for — see planRoutes. */
export type PlannedRoute = { waypoints: LatLng[]; kinds: (FeatureKind | "ring")[] };

/**
 * The order a route visits its three waypoints in. A roundabout early gets the
 * junction work done while the drive is still near the centre; the estate in
 * the middle is the slow-speed, observation-heavy stretch; the fast road or
 * crossing last is the return leg. Rotating the list per route stops all ten
 * loops out of one centre from having the same shape.
 */
const SHAPES: FeatureKind[][] = [
  ["roundabout", "estate", "fast"],
  ["estate", "crossing", "roundabout"],
  ["fast", "roundabout", "estate"],
  ["crossing", "estate", "fast"],
  ["roundabout", "crossing", "estate"],
];

// Successive routes are pushed round by the golden angle rather than by an
// even split. An even split with ten routes puts routes 1 and 6 on the same
// line through the centre; 137.5° never repeats a direction.
const GOLDEN_ANGLE = 137.5;

const ringPoint = (c: LatLng, bearing: number, km: number): LatLng => ({
  lat: c.lat + (km / 111) * Math.cos((bearing * Math.PI) / 180),
  lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((bearing * Math.PI) / 180),
});

/** Smallest absolute difference between two bearings, in degrees. */
function bearingGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The feature of `kind` closest to a target bearing that has not been used
 * yet, preferring ones inside the route's distance band so a "short" loop does
 * not reach 4 km for its first waypoint.
 */
function pickFeature(
  centre: LatLng, features: Feature[], kind: FeatureKind, bearing: number, maxKm: number, used: Set<Feature>,
): Feature | null {
  const candidates = features.filter((f) => f.kind === kind && !used.has(f));
  if (!candidates.length) return null;
  const scored = candidates.map((f) => {
    const km = haversineM(centre, f) / 1000;
    const gap = bearingGap(bearingDeg(centre, f), bearing);
    // Bearing spreads the routes apart; the overshoot penalty keeps them the
    // length of a driving lesson. At 45 per km a far feature on a perfect
    // bearing still won, and loops came back over 20 km — longer than the
    // real test. At 120 a kilometre of overshoot costs more than any bearing
    // error can, so the band holds.
    return { f, score: gap + Math.max(0, km - maxKm) * 120 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].f;
}

/**
 * `count` loops out of one centre, each starting and ending there.
 *
 * Centres with no OSM features nearby — or with only one kind — still get the
 * full count, filled in with compass rings. A rural centre returning a short
 * list would silently leave that centre with fewer routes than every other.
 */
export function planRoutes(centre: LatLng, features: Feature[], count: number): PlannedRoute[] {
  const used = new Set<Feature>();
  const routes: PlannedRoute[] = [];

  for (let i = 0; i < count; i++) {
    const spine = (i * GOLDEN_ANGLE) % 360;
    // Short, medium and long loops in rotation, so one centre's ten routes
    // are not ten versions of the same 8 km drive.
    const maxKm = [1.4, 2.2, 3.0][i % 3];
    const shape = SHAPES[i % SHAPES.length];
    const waypoints: LatLng[] = [centre];
    const kinds: (FeatureKind | "ring")[] = [];

    for (let leg = 0; leg < shape.length; leg++) {
      const bearing = (spine + leg * 120) % 360;
      const found =
        pickFeature(centre, features, shape[leg], bearing, maxKm, used) ??
        // Any unused feature pointing the right way beats a synthetic point.
        (["roundabout", "estate", "crossing", "fast"] as FeatureKind[])
          .map((k) => pickFeature(centre, features, k, bearing, maxKm, used))
          .find((f): f is Feature => f !== null) ??
        null;
      if (found) {
        used.add(found);
        waypoints.push({ lat: found.lat, lng: found.lng });
        kinds.push(found.kind);
      } else {
        waypoints.push(ringPoint(centre, bearing, maxKm * (leg === 1 ? 0.85 : 1)));
        kinds.push("ring");
      }
    }

    waypoints.push(centre);
    routes.push({ waypoints, kinds });
  }

  return routes;
}

/**
 * The name of a route, taken from the roads it actually drove.
 *
 * Naming a route before fetching it is how three of the first hand-drawn St
 * Albans routes ended up named after roads they never touched. OSRM reports
 * the road name per step, so the two it spent longest on are both accurate and
 * recognisable — "Sandpit Lane and Holywell Hill" rather than "Route 6".
 *
 * `used` holds the road names already spent on this centre's earlier routes.
 * Route names are unique anyway because they carry a number, but two routes
 * both called after the one big A-road reads like a bug.
 */
export function nameFromSteps(steps: OsrmStep[], used: Set<string>): string | null {
  const metres = new Map<string, number>();
  for (const s of steps) {
    if (!s.name) continue;
    metres.set(s.name, (metres.get(s.name) ?? 0) + s.distance);
  }
  const ranked = [...metres.entries()]
    .filter(([name]) => !used.has(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  if (!ranked.length) return null;
  return ranked.slice(0, 2).join(" and ");
}
