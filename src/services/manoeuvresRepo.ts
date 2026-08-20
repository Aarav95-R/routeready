import { supabase } from "@/lib/supabase";
import type { Manoeuvre } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

/**
 * Reference data with a public read policy, cached like the centres are.
 *
 * This is the tab people open on the sofa the night before, which is also
 * where the signal is worst. Once these four rows have been read once they
 * are on the device, and the screen is complete with no network at all.
 */
export function listManoeuvres(): Promise<Cached<Manoeuvre[]>> {
  return cachedFetch("manoeuvres", async () => {
    const { data, error } = await supabase.from("manoeuvres").select("*").order("name");
    if (error) throw new Error(error.message);
    return data as Manoeuvre[];
  });
}
