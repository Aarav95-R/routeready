import { supabase } from "@/lib/supabase";
import type { ProgressEntry, ProgressEntryWithRoute } from "@/types/db";
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
 * Everything this user has ever driven, oldest first — what the home screen
 * plots. Row-level security scopes it to them, the same way
 * `listFavouriteRouteIds` does, so there is no user_id filter here to forget.
 *
 * The cache key sits under `progress:` deliberately: `clearUserCache` wipes
 * that prefix on sign-out, so these rows leave the device with the session.
 * Rows arrive with their route and centre joined on, so the history list can name a drive without a query per row.
 */
export function listMyProgress(): Promise<Cached<ProgressEntryWithRoute[]>> {
  return cachedFetch("progress:mine", async () => {
    // The table is `test_centres`, not `centres` — but the embed is aliased
    // back to `centres` so the row shape reads as the domain word rather than
    // the storage one, and `ProgressEntryWithRoute` never has to know the
    // difference.
    const { data, error } = await supabase
      .from("user_progress")
      .select("*, routes(name, centre_id, centres:test_centres(name))")
      .order("completed_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProgressEntryWithRoute[];
  });
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
