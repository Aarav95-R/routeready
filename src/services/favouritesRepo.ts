import { supabase } from "@/lib/supabase";

export async function listFavouriteRouteIds(): Promise<string[]> {
  const { data, error } = await supabase.from("favourites").select("route_id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.route_id as string);
}

export async function toggleFavourite(routeId: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const existing = await listFavouriteRouteIds();
  if (existing.includes(routeId)) {
    const { error } = await supabase.from("favourites").delete().match({ route_id: routeId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("favourites").insert({ route_id: routeId, user_id: user.user!.id });
    if (error) throw new Error(error.message);
  }
}
