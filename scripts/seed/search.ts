import type { LatLng } from "../../src/lib/geo";
import type { OsrmRoute } from "./osrm";
import type { Feature } from "./routePlan";
import {
  acceptable, planTestRoute, SCALE_LADDER, TARGET_MAX_M, type TestRoutePlan,
} from "./testPhases";

/**
 * Finding one loop that is actually the length of a driving test.
 *
 * Pulled out of generate.ts so that scripts/check-planner.ts measures the same
 * search that ships. Two copies of this is two answers to "does this centre
 * converge", and only one of them would be the one in the app.
 *
 * The router is injected rather than imported, so this can be tested against a
 * road network that is a function rather than a country.
 */

/**
 * How far round the compass a retry moves.
 *
 * A centre has ten routes at indices 0-9, so a stride inside that range would
 * land the retry on another route's bearing and give the centre two identical
 * loops. Ten is the first value that cannot, and the golden-angle spine makes
 * it a genuinely different direction rather than a near miss.
 */
export const RETRY_STRIDE = 10;

export type Search = {
  route: OsrmRoute;
  plan: TestRoutePlan;
  scale: number;
  /** False when no rung on either bearing produced a route worth driving. */
  converged: boolean;
  /**
   * Why it failed, or null.
   *
   * The two are not the same and must never be treated as such. A centre with
   * no answer on a bearing is a fact about its geography, and the generator
   * writes it with fewer routes. A router that answers nothing is an outage
   * halfway through forty centres, and writing a seed with holes in it and
   * calling that done is how the app quietly loses a county.
   */
  failure: "no-scale-works" | "router-unreachable" | null;
  retried: boolean;
  fetches: number;
};

type FetchRoute = (waypoints: LatLng[]) => Promise<OsrmRoute>;

type Attempt = { route: OsrmRoute; plan: TestRoutePlan; scale: number; fetches: number; found: boolean };
type Climb = Attempt | { unreachable: true; fetches: number };

/**
 * Climb the ladder on one bearing, stopping at the first rung worth keeping.
 *
 * Smallest rung first, so where several would qualify the shortest wins - a
 * learner asked for a practice loop, not the longest one that fits.
 *
 * A rung that the router refuses outright is skipped rather than fatal. Two
 * Chingford routes came back 400 because a compass-point anchor landed 136 m
 * and 237 m from the nearest road, in a reservoir and in Epping Forest; that
 * says nothing about the other seven rungs.
 */
async function climb(
  centre: LatLng, features: Feature[], routeIndex: number,
  fetchRoute: FetchRoute, sleep: (ms: number) => Promise<void>,
): Promise<Climb> {
  let best: Attempt | null = null;
  let fetches = 0;

  for (const scale of SCALE_LADDER) {
    const plan = planTestRoute(centre, features, routeIndex, scale);
    let route: OsrmRoute;
    try {
      route = await fetchRoute(plan.waypoints);
    } catch {
      continue; // see above: an unroutable anchor is this rung's problem alone
    } finally {
      fetches++;
      await sleep(700);
    }

    if (acceptable(route.distanceM, route.durationS)) {
      return { route, plan, scale, fetches, found: true };
    }
    // Kept only so a centre that fails everywhere can still say how close it
    // came, which is the difference between a bug report and a shrug.
    const miss = Math.abs(route.distanceM - TARGET_MAX_M);
    if (best === null || miss < Math.abs(best.route.distanceM - TARGET_MAX_M)) {
      best = { route, plan, scale, fetches, found: false };
    }
  }

  // Not one rung came back. That is the router, not the road network.
  if (best === null) return { unreachable: true, fetches };
  return { ...best, fetches, found: false };
}

/**
 * A loop worth driving out of this centre, or an honest failure.
 *
 * Some bearings have no answer at any size. Around Erith the Thames means a
 * loop either stays on one bank at 4 km or crosses and pays 50 km for the
 * bridge, and the 13-19 km band lies entirely in between. Nothing about the
 * radius fixes that, so the fix is a different direction rather than a smaller
 * one: one retry, a whole stride away.
 *
 * If that fails too the caller is told, because writing a 30 km loop out as a
 * forty-minute practice route is the exact thing this module exists to stop.
 */
export async function searchRoute(
  centre: LatLng,
  features: Feature[],
  routeIndex: number,
  fetchRoute: FetchRoute,
  sleep: (ms: number) => Promise<void> = () => Promise.resolve(),
): Promise<Search> {
  const first = await climb(centre, features, routeIndex, fetchRoute, sleep);
  if ("unreachable" in first) {
    return unreachableResult(first.fetches, false);
  }
  if (first.found) return { ...first, converged: true, retried: false, failure: null };

  const second = await climb(centre, features, routeIndex + RETRY_STRIDE, fetchRoute, sleep);
  const fetches = first.fetches + second.fetches;
  if ("unreachable" in second) return unreachableResult(fetches, true);

  const best = second.found ? second : first;
  return {
    ...best, fetches, retried: true,
    converged: best.found,
    failure: best.found ? null : "no-scale-works",
  };
}

/**
 * Nothing was measured, so there is nothing to report but the fact of it. The
 * caller has to stop the run rather than write a centre short.
 */
function unreachableResult(fetches: number, retried: boolean): Search {
  return {
    route: null as never, plan: null as never, scale: 0,
    converged: false, retried, fetches, failure: "router-unreachable",
  };
}
