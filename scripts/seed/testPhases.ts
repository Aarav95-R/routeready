import { bearingDeg, haversineM, type LatLng } from "../../src/lib/geo";
import type { Feature, FeatureKind } from "./routePlan";

/**
 * A practice loop as the ordered sequence of things a driving test contains,
 * rather than as three waypoints picked off a compass.
 *
 * The old planner chose waypoints by bearing and radius, which controlled
 * where a route went and never how long it took: measured across the 400
 * seeded routes they ran from 7 to 72 minutes against a real test's 40, and
 * the longest was a 49 km drive. Worse, "a roundabout, an estate and a fast
 * road in rotation" is not what an examiner assembles. A test has a shape, and
 * it is this one.
 *
 * DVSA stopped publishing routes in 2010 and has published what the test
 * *contains* ever since. That is the licensable source, and this module is it
 * turned into geometry.
 *
 * Everything here is pure and deterministic in (centre, features, routeIndex,
 * scale) — which is what lets generate.ts bisect on `scale` until OSRM reports
 * a drive of the right length.
 */

export type PhaseName =
  | "settle-in"
  | "junction-work"
  | "faster-road"
  | "independent"
  | "manoeuvre"
  | "return";

type PhaseSpec = {
  name: PhaseName;
  /** Feature kinds that satisfy this phase, best first. */
  wants: FeatureKind[];
  /**
   * Optional phases are dropped when nothing nearby satisfies them; required
   * ones fall back to a synthetic compass point, so a centre OSM knows nothing
   * about still gets a drivable loop.
   */
  optional: boolean;
  /** Where this phase's fallback point sits, as a fraction of the radius. */
  reach: number;
  /**
   * Where this phase sits round the loop, in degrees from the route spine.
   *
   * Deliberately not an even 360/6 split. An even split makes the whole fan
   * rotationally symmetric at 60 degrees, and the golden angle that separates
   * successive routes is 17.5 degrees past two whole 60-degree steps — so
   * rotating the spine landed the phases back on the same features in a
   * different order, and a centre's ten routes collapsed into six distinct
   * loops. These offsets still run monotonically round the circle, so the
   * loop is still a circuit rather than a zigzag across the centre.
   */
  offset: number;
};

/**
 * The canonical order, and it does not shuffle. You are settled in before you
 * are tested, the manoeuvre comes late, and you finish where you started.
 */
export const PHASES: readonly PhaseSpec[] = [
  // Quiet streets straight out of the centre. Every examiner starts a
  // candidate somewhere undemanding.
  { name: "settle-in",     wants: ["estate", "parking"],                    optional: false, reach: 0.55, offset: 0 },
  // Roundabouts and signalled junctions: the densest source of faults, so it
  // comes early, while concentration is freshest.
  { name: "junction-work", wants: ["roundabout", "signals"],                optional: false, reach: 0.9, offset: 55 },
  // A dual carriageway if there is one, an A road otherwise, and nothing at
  // all for a rural centre that has neither.
  { name: "faster-road",   wants: ["dual", "fast"],                         optional: true,  reach: 1.0, offset: 118 },
  // The longest single stretch — about 20 minutes of a real test — following
  // signs rather than turn-by-turn.
  { name: "independent",   wants: ["fast", "dual", "roundabout", "estate"], optional: false, reach: 1.0, offset: 191 },
  // Somewhere a parallel park or a pull-up-on-the-right is actually possible.
  { name: "manoeuvre",     wants: ["parking"],                              optional: true,  reach: 0.7, offset: 263 },
  // Back to the centre. This is the phase that absorbs whatever length the
  // rest of the loop did not account for.
  { name: "return",        wants: ["estate", "crossing"],                   optional: false, reach: 0.5, offset: 309 },
];

export type PlannedPhase = { name: PhaseName; kind: FeatureKind | "ring"; at: LatLng };
export type TestRoutePlan = { waypoints: LatLng[]; phases: PlannedPhase[] };

/**
 * The radius the phases are laid out on before scaling. Deliberately smaller
 * than the drive it produces: a loop through five waypoints on a 2.4 km ring
 * is far longer than 2.4 km, and the bisection moves this per route anyway.
 */
export const BASE_RADIUS_KM = 2.4;

// Successive routes are pushed round by the golden angle rather than by an
// even split. An even split with ten routes puts routes 1 and 6 on the same
// line through the centre; 137.5° never repeats a direction.
const GOLDEN_ANGLE = 137.5;

/**
 * Alternate routes run the circuit the other way round.
 *
 * Needed because the spine rotation alone is not enough. The phases fan at
 * 360/6 = 60°, and the golden angle is 137.5° — which is 17.5° past two whole
 * fan steps. So rotating the spine lands the phases back on the same ring of
 * features in a different order, and a centre's ten routes collapsed into six
 * distinct loops with four exact duplicates.
 *
 * Reversing every other one is the fix, and it is a real difference rather
 * than a trick to satisfy a uniqueness check: the same circuit driven the
 * other way is different turns, different roundabout exits, and different
 * junctions to emerge from.
 */
const direction = (routeIndex: number) => (routeIndex % 2 === 0 ? 1 : -1);

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
 * The best unused feature for a phase: right kind, near the target bearing,
 * inside the band.
 *
 * The kind list is ordered and an earlier kind wins outright — a dual
 * carriageway is a better "faster road" than an A road, and no amount of
 * bearing advantage should change that.
 */
function pick(
  centre: LatLng, features: Feature[], spec: PhaseSpec,
  bearing: number, radiusKm: number, used: Set<Feature>,
): Feature | null {
  for (const kind of spec.wants) {
    const candidates = features.filter((f) => f.kind === kind && !used.has(f));
    if (!candidates.length) continue;
    const scored = candidates.map((f) => {
      const km = haversineM(centre, f) / 1000;
      const gap = bearingGap(bearingDeg(centre, f), bearing);
      // The overshoot penalty is what keeps a loop the length of a lesson. At
      // a low rate a distant feature on a perfect bearing still won and loops
      // came back over 20 km; at 120 per km a kilometre of overshoot costs
      // more than any bearing error can, so the band holds.
      return { f, score: gap + Math.max(0, km - radiusKm) * 120 };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0].f;
  }
  return null;
}

/**
 * One loop out of a centre, at a given size.
 *
 * `routeIndex` spreads a centre's ten routes round the compass; `scale`
 * multiplies the radius and is what generate.ts searches over to hit the
 * target drive time.
 */
export function planTestRoute(
  centre: LatLng, features: Feature[], routeIndex: number, scale: number,
): TestRoutePlan {
  const spine = (routeIndex * GOLDEN_ANGLE) % 360;
  const dir = direction(routeIndex);
  const radiusKm = BASE_RADIUS_KM * scale;
  const used = new Set<Feature>();

  const phases: PlannedPhase[] = [];
  const waypoints: LatLng[] = [centre];

  PHASES.forEach((spec) => {
    // Fan the phases round the spine so the loop goes out and comes back
    // rather than doubling back along one road.
    const bearing = (((spine + dir * spec.offset) % 360) + 360) % 360;
    const found = pick(centre, features, spec, bearing, radiusKm, used);
    if (found) {
      used.add(found);
      const at = { lat: found.lat, lng: found.lng };
      phases.push({ name: spec.name, kind: found.kind, at });
      waypoints.push(at);
      return;
    }
    // Nothing of the right kind nearby. An optional phase is simply not part
    // of this centre's test — reaching 20 km to find a dual carriageway is
    // exactly how the old planner produced a 49 km route. A required phase
    // gets a compass point so the loop still exists.
    if (spec.optional) return;
    const at = ringPoint(centre, bearing, radiusKm * spec.reach);
    phases.push({ name: spec.name, kind: "ring", at });
    waypoints.push(at);
  });

  waypoints.push(centre);
  return { waypoints, phases };
}
