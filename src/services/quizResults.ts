import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * What the learner has and has not got right, kept on the device.
 *
 * There is no `user_quiz_results` table behind this and that is deliberate.
 * The tab is opened on the sofa the night before a test, which is exactly
 * where the signal is worst, and a migration plus RLS plus an outbox is a lot
 * of machinery to make nineteen booleans survive a flight. If the score ever
 * needs to reach the home dashboard or a second device, that is the point to
 * add the table — not before.
 */

/**
 * Inside the prefix `clearUserCache()` already sweeps on sign-out.
 *
 * This is the whole reason the key is not simply `quiz:results`. These
 * booleans belong to a person, not to the country, and a shared phone would
 * otherwise hand the next person to sign in the last one's score.
 */
export const QUIZ_RESULTS_KEY = "cache:progress:quiz";

export type QuizResults = {
  /** Question id → whether the *last* answer to it was correct. */
  answers: Record<string, boolean>;
  /** The score from the round before this one, or null if there wasn't one. */
  lastScore: number | null;
};

const EMPTY: QuizResults = { answers: {}, lastScore: null };

/**
 * Never throws.
 *
 * A quiz score is not worth failing a screen over: a store that is missing,
 * truncated by a kill during a write, or written by an older build reads as
 * "nothing answered yet", and the next answer writes a clean one over it.
 */
export async function loadResults(): Promise<QuizResults> {
  try {
    const raw = await AsyncStorage.getItem(QUIZ_RESULTS_KEY);
    if (raw === null) return { ...EMPTY, answers: {} };
    const parsed = JSON.parse(raw) as Partial<QuizResults>;
    return {
      answers: parsed.answers ?? {},
      lastScore: typeof parsed.lastScore === "number" ? parsed.lastScore : null,
    };
  } catch {
    return { ...EMPTY, answers: {} };
  }
}

async function save(next: QuizResults): Promise<void> {
  await AsyncStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify(next));
}

/**
 * Written per question rather than per round, which is what lets someone
 * close a round four questions in and keep those four.
 */
export async function recordAnswer(questionId: string, correct: boolean): Promise<void> {
  const current = await loadResults();
  await save({ ...current, answers: { ...current.answers, [questionId]: correct } });
}

export async function recordRound(score: number): Promise<void> {
  const current = await loadResults();
  await save({ ...current, lastScore: score });
}
