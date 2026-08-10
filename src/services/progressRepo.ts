import { supabase } from "@/lib/supabase";
import type { ProgressEntry } from "@/types/db";
import { Cached, cachedFetch, drainQueue, enqueue } from "./cache";

async function insertProgress(entry: ProgressEntry): Promise<void> {
  const { error } = await supabase.from("user_progress").insert(entry);
  if (error) throw new Error(error.message);
}

export async function saveProgress(entry: Omit<ProgressEntry, "user_id">): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const full: ProgressEntry = { ...entry, user_id: data.user!.id };
  try { await insertProgress(full); }
  catch { await enqueue("progress_outbox", full); }
}

export function flushProgress(): Promise<number> {
  return drainQueue<ProgressEntry>("progress_outbox", insertProgress);
}

/**
 * Every mock test taken on the routes at one centre, grouped by route, so the
 * routes list can say what you have already scored without a query per card.
 *
 * Rows are scoped to the signed-in user by row-level security, the same way
 * `listFavouriteRouteIds` relies on it. Cached under the centre so the list
 * still shows your history offline.
 */
export function listProgressByCentre(
  centreId: string,
  routeIds: string[]
): Promise<Cached<Record<string, ProgressEntry[]>>> {
  return cachedFetch(`progress:${centreId}`, async () => {
    if (routeIds.length === 0) return {};
    const { data, error } = await supabase.from("user_progress").select("*").in("route_id", routeIds);
    if (error) throw new Error(error.message);
    const byRoute: Record<string, ProgressEntry[]> = {};
    for (const row of (data ?? []) as ProgressEntry[]) {
      (byRoute[row.route_id] ??= []).push(row);
    }
    return byRoute;
  });
}
