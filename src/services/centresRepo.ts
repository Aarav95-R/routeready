import { supabase } from "@/lib/supabase";
import type { Centre } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

export function listCentres(): Promise<Cached<Centre[]>> {
  return cachedFetch("centres", async () => {
    const { data, error } = await supabase.from("test_centres").select("*").order("name");
    if (error) throw new Error(error.message);
    return data as Centre[];
  });
}
