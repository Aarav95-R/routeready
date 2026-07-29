import { supabase } from "@/lib/supabase";
import type { Hazard, Route } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

export function listRoutesByCentre(centreId: string): Promise<Cached<Route[]>> {
  return cachedFetch(`routes:${centreId}`, async () => {
    const { data, error } = await supabase.from("routes").select("*").eq("centre_id", centreId).order("name");
    if (error) throw new Error(error.message);
    return data as Route[];
  });
}

export function getRoute(routeId: string): Promise<Cached<{ route: Route; hazards: Hazard[] }>> {
  return cachedFetch(`route:${routeId}`, async () => {
    const { data: route, error } = await supabase.from("routes").select("*").eq("id", routeId).single();
    if (error) throw new Error(error.message);
    const { data: hazards, error: e2 } = await supabase.from("hazards").select("*").eq("route_id", routeId).order("id");
    if (e2) throw new Error(e2.message);
    return { route: route as Route, hazards: (hazards ?? []) as Hazard[] };
  });
}
