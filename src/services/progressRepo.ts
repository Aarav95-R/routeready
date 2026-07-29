import { supabase } from "@/lib/supabase";
import type { ProgressEntry } from "@/types/db";
import { drainQueue, enqueue } from "./cache";

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
