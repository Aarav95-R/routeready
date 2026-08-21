import type { LatLng } from "../../src/lib/geo";
import type { OsrmRoute } from "./osrm";
import type { Feature } from "./routePlan";
import {
  MAX_TRIES, nextScale, planTestRoute, SCALE_HI, SCALE_LO,
  TARGET_MAX_M, TARGET_MIN_M, type TestRoutePlan,
} from "./testPhases";

/**
 * Finding one loop that is actually the length of a driving test.
 *
 * Pulled out of generate.ts so that the check script measures the same search
 * the generator runs. Two copies of a bisection is two answers to "does this
 * centre converge", and only one of them would be the one that ships.
 *
 * The router is injected rather than imported so this can be tested against a
 * road network that is a function rather than a country.
 */

/**
 * How far round the compass a retry moves.
 *
 * A centre has ten routes at indices 0-9, so a stride inside that range would
 * land the retry on another route's bearing and give the centre two identical
 * loops. Ten is the first value that cannot, and the golden-angle spine means
 * it is a genuinely different direction rather than a near miss.
 */
export const RETRY_STRIDE = 10;

export type Search = {
  route: OsrmRoute;
  plan: TestRoutePlan;
  scale: number;
  /** False when even the retry could not find a loop of the right length. */
  converged: boolean;
  retried: boolean;
  fetches: number;
};

type FetchRoute = (waypoints: LatLng[]) => Promise<OsrmRoute>;

const inBand = (m: number) => m >= TARGET_MIN_M && m <= TARGET_MAX_M;

/** One bearing, bisected until it lands in the band or runs out of fetches. */
async function searchOneBearing(
  centre: LatLng, features: Feature[], routeIndex: number, fetchRoute: FetchRoute,
  sleep: (ms: number) => Promise<void>,
): Promise<{ route: OsrmRoute; plan: TestRoutePlan; scale: number; fetches: number }> {
  let scale = 1, lo = SCALE_LO, hi = SCALE_HI;
  let plan = planTestRoute(centre, features, routeIndex, scale);
  let route = await fetchRoute(plan.waypoints);
  let fetches = 1;

  for (let t = 0; t < MAX_TRIES; t++) {
    const step = nextScale(route.durationS, route.distanceM, scale, lo, hi);
    if (step.done) break;
    scale = step.scale; lo = step.lo; hi = step.hi;
    await sleep(700);
    plan = planTestRoute(centre, features, routeIndex, scale);
    route = await fetchRoute(plan.waypoints);
    fetches++;
  }
  return { route, plan, scale, fetches };
}

/**
 * A loop of the right length out of this centre, or an honest failure.
 *
 * Bisection assumes the radius controls the length, and around a severed road
 * network some bearings break that assumption outright: Mill Hill's ninth
 * route and Hendon's third both came back at 30 km with the radius shrunk
 * threefold, because the drive is dominated by the detour to the next legal
 * crossing rather than by how far apart the waypoints are. There is no scale
 * that fixes those, so the fix is a different direction, not a smaller one.
 *
 * One retry, on a bearing a whole stride away. If that fails too the caller is
 * told, because writing a 30 km loop out as a forty-minute practice route is
 * the exact thing this module exists to stop.
 */
export async function searchRoute(
  centre: LatLng,
  features: Feature[],
  routeIndex: number,
  fetchRoute: FetchRoute,
  sleep: (ms: number) => Promise<void> = () => Promise.resolve(),
): Promise<Search> {
  const first = await searchOneBearing(centre, features, routeIndex, fetchRoute, sleep);
  if (inBand(first.route.distanceM)) {
    return { ...first, converged: true, retried: false };
  }

  await sleep(700);
  const second = await searchOneBearing(
    centre, features, routeIndex + RETRY_STRIDE, fetchRoute, sleep,
  );
  const fetches = first.fetches + second.fetches;

  // Whichever missed by less, so a centre that cannot converge at all still
  // gets its closest attempt rather than its most recent one.
  const best = Math.abs(second.route.distanceM - TARGET_MAX_M)
    < Math.abs(first.route.distanceM - TARGET_MAX_M) ? second : first;

  return { ...best, fetches, converged: inBand(best.route.distanceM), retried: true };
}
