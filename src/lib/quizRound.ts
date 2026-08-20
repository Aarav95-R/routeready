import type { QuizResults } from "@/services/quizResults";
import type { QuizChoice, QuizQuestion } from "@/types/db";
import { stateOf } from "./quizView";

/**
 * What a round is: which ten questions get asked, in what order the four
 * options appear, and what the summary says at the end.
 *
 * All of it is pure, and all of it takes its randomness as an argument. That
 * is not test scaffolding for its own sake — the round screen has to be able
 * to deal once and then re-render freely, and a module that reached for
 * `Math.random()` internally would move the right answer under the learner's
 * thumb every time state changed.
 */

export const ROUND_SIZE = 10;

export type RoundQuestion = {
  question: QuizQuestion;
  /** This round's option order. Fixed at deal time, never recomputed. */
  choices: QuizChoice[];
};

/**
 * mulberry32 — small, fast, and good enough to shuffle four options.
 *
 * Exists so a round can be reproduced from a number: the tests need it, and a
 * bug report about an option order would otherwise be unreproducible.
 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, on a copy. The caller's array is never touched. */
function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Three bands, in this order: never seen, last got wrong, everything else.
 *
 * Shuffled within each band but never across them, so a round always spends
 * its ten questions on the least-known material first while still varying from
 * one round to the next. Once the whole bank is known the third band is all
 * there is, and the round becomes plain revision — which is the correct
 * behaviour, not a fallback.
 */
export function dealRound(
  questions: QuizQuestion[],
  results: QuizResults,
  opts: { size?: number; rng?: () => number } = {},
): RoundQuestion[] {
  const { size = ROUND_SIZE, rng = Math.random } = opts;

  const unseen: QuizQuestion[] = [];
  const revisit: QuizQuestion[] = [];
  const known: QuizQuestion[] = [];
  for (const question of questions) {
    const state = stateOf(question.id, results);
    if (state === "unseen") unseen.push(question);
    else if (state === "revisit") revisit.push(question);
    else known.push(question);
  }

  return [
    ...shuffled(unseen, rng), ...shuffled(revisit, rng), ...shuffled(known, rng),
  ]
    .slice(0, size)
    .map((question) => ({ question, choices: shuffled(question.choices, rng) }));
}

/**
 * The one line under the score on the summary.
 *
 * A perfect round is called out on its own rather than as "better than last
 * time", because ten out of ten is the thing that happened and the comparison
 * is not the point. A first round has nothing to compare against and says so
 * by staying quiet, rather than inventing a baseline of zero.
 */
export function scoreLine(score: number, total: number, lastScore: number | null): string {
  if (score === total && total > 0) return "Every one right. Go and book it.";
  const missed = total - score;
  const tail = missed === 1 ? "One worth another look." : `${missed} worth another look.`;
  if (lastScore === null) return tail;
  if (score > lastScore) return `Better than your last round. ${tail}`;
  if (score === lastScore) return `Same as your last round. ${tail}`;
  return `Down on your last round. ${tail}`;
}
