import { supabase } from "@/lib/supabase";
import type { Hazard, NavStep, Route } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

/**
 * Named rather than `*`, and that is the whole point of this constant.
 *
 * `select("*")` is what would ship the gated half of a route to somebody who
 * has not paid for it, the moment a column is added back to the routes table by
 * anyone who has not read the paywall spec. Naming the columns means a new
 * column is invisible until somebody decides it should be public.
 */
const ROUTE_COLUMNS =
  "id, centre_id, name, geometry, estimated_minutes, distance_km, difficulty, " +
  "speed_profile, observation_zones, phases, is_free";

export function listRoutesByCentre(centreId: string): Promise<Cached<Route[]>> {
  return cachedFetch(`routes:${centreId}`, async () => {
    const { data, error } = await supabase
      .from("routes").select(ROUTE_COLUMNS).eq("centre_id", centreId).order("name");
    if (error) throw new Error(error.message);
    return data as unknown as Route[];
  });
}

/**
 * A route and its hazards.
 *
 * `hazards` comes back empty for a locked route — the policy refuses the rows
 * rather than erroring — so an empty list here means "not entitled, or genuinely
 * no hazards" and must never be read as proof of a safe route. The screens gate
 * on `is_free` and the entitlement store instead, which is unambiguous.
 */
export function getRoute(routeId: string): Promise<Cached<{ route: Route; hazards: Hazard[] }>> {
  return cachedFetch(`route:${routeId}`, async () => {
    const { data: route, error } = await supabase
      .from("routes").select(ROUTE_COLUMNS).eq("id", routeId).single();
    if (error) throw new Error(error.message);
    const { data: hazards, error: e2 } = await supabase
      .from("hazards").select("*").eq("route_id", routeId).order("id");
    if (e2) throw new Error(e2.message);
    return { route: route as unknown as Route, hazards: (hazards ?? []) as Hazard[] };
  });
}

/**
 * The turn-by-turn, or null if the server would not give it up.
 *
 * `maybeSingle` rather than `single`: a policy that refuses a row returns zero
 * rows, and `single` turns that into an error indistinguishable from a network
 * failure. Null is the honest answer, and it is deliberately not `[]` — a route
 * can legitimately have no steps, and a screen that cannot tell those apart
 * would navigate somebody around a route it never received directions for.
 */
export function getRouteSteps(routeId: string): Promise<Cached<NavStep[] | null>> {
  return cachedFetch(`route-steps:${routeId}`, async () => {
    const { data, error } = await supabase
      .from("route_details").select("steps").eq("route_id", routeId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? ((data.steps ?? []) as NavStep[]) : null;
  });
}
