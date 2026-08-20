import { supabase } from "@/lib/supabase";
import type { QuizQuestion } from "@/types/db";
import { Cached, cachedFetch } from "./cache";

/**
 * Reference data with a public read policy, cached like the centres and the
 * manoeuvres are.
 *
 * Nineteen rows, none of which change between one test and the next, on the
 * tab people open on the sofa the night before — which is also where the
 * signal is worst. Once they have been read once they are on the device, and
 * both the list and a full round work with no network at all.
 *
 * Ordered by topic rather than by category: `quizView` re-bins them into its
 * three sections regardless, so the only thing the query's order still decides
 * is the order *within* a section, and there alphabetical beats whatever order
 * the rows happened to be inserted in.
 */
export function listQuestions(): Promise<Cached<QuizQuestion[]>> {
  return cachedFetch("quiz_questions", async () => {
    const { data, error } = await supabase.from("show_me_tell_me").select("*").order("topic");
    if (error) throw new Error(error.message);
    return data as QuizQuestion[];
  });
}
