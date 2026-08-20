import type { QuizResults } from "@/services/quizResults";
import type { QuizCategory, QuizQuestion } from "@/types/db";

/**
 * How the question bank is introduced: what the three categories are called,
 * what order they are read in, and what each row says about itself.
 *
 * None of this is in the database. `show_me_tell_me` holds a category slug, a
 * question, an answer and four options — everything a learner reads *inside* a
 * question, and nothing about how the nineteen sit next to each other. That is
 * presentation: it changes when the screen changes, not when the DVSA changes.
 * Same split, and same reasoning, as `manoeuvreView`.
 */

/** What the tick, the clay dot, and the empty space on a row mean. */
export type QuestionState = "known" | "revisit" | "unseen";

export type ViewQuestion = { question: QuizQuestion; state: QuestionState; kind: string };
export type QuizSection = { title: string; count: number; data: ViewQuestion[] };

/**
 * Declaration order is reading order, which is why this is not sorted.
 *
 * Alphabetically "Inside the car" comes first, and it is the category a
 * learner is least likely to be revising: the tyre and brake questions are the
 * ones that get asked at the kerb before anything else happens, and the bonnet
 * ones are the only ones that need the car opened up. So the list runs from
 * the outside of the car inwards.
 */
const TITLES: Record<QuizCategory, string> = {
  safety: "Safety and the outside",
  inside_car: "Inside the car",
  under_bonnet: "Under the bonnet",
};
const ORDER = Object.keys(TITLES) as QuizCategory[];

/** Anything this build does not recognise, so nothing is silently dropped. */
const UNKNOWN_TITLE = "More";

/**
 * Not cosmetic. "Show me" means the examiner will ask while the car is moving
 * and the answer is something you do; "tell me" happens at the kerb before you
 * set off and the answer is something you say. Which one it is changes how a
 * learner should be practising it, so the row says so.
 */
export function kindLabel(question: QuizQuestion): string {
  return question.is_show_me ? "Show me" : "Tell me";
}

/**
 * Known means the last answer was right. That is the whole rule.
 *
 * Deliberately not a decay curve or a streak: a learner can hold this rule in
 * their head and predict what the screen will say, where a spaced-repetition
 * model they cannot see reads as a tab that forgets things at random.
 */
export function stateOf(questionId: string, results: QuizResults): QuestionState {
  const last = results.answers[questionId];
  if (last === undefined) return "unseen";
  return last ? "known" : "revisit";
}

/**
 * Counted over the bank rather than over the stored answers, so a question
 * retired by a reseed cannot go on contributing to a total it is no longer
 * part of.
 */
export function knownCount(
  questions: QuizQuestion[], results: QuizResults,
): { known: number; total: number } {
  const known = questions.filter((q) => stateOf(q.id, results) === "known").length;
  return { known, total: questions.length };
}

export function buildSections(questions: QuizQuestion[], results: QuizResults): QuizSection[] {
  const bins = new Map<string, ViewQuestion[]>();

  for (const question of questions) {
    const title = TITLES[question.category] ?? UNKNOWN_TITLE;
    const view: ViewQuestion = {
      question,
      state: stateOf(question.id, results),
      kind: kindLabel(question),
    };
    const bin = bins.get(title);
    if (bin) bin.push(view);
    else bins.set(title, [view]);
  }

  return [...ORDER.map((c) => TITLES[c]), UNKNOWN_TITLE]
    .filter((title) => bins.has(title))
    .map((title) => {
      const data = bins.get(title)!;
      return { title, count: data.length, data };
    });
}

export type PractiseSummary = {
  known: number;
  total: number;
  remaining: number;
  /** The strong half of the hero's status line. Empty while the bank arrives. */
  done: string;
  /** The quiet half. Empty once there is nothing left to get right. */
  toGo: string;
};

/**
 * What the hero says about where the learner is up to.
 *
 * Two strings rather than one, because the line is set in two weights: what
 * you have done is the half that is about you and carries the ink, what is
 * left is the size of the job and sits back. Composing that at the call site
 * would put the copy in the screen, and the rule this encodes — lead with
 * done, never render a bare score — is exactly the sort of thing that gets
 * quietly reversed the next time the layout moves.
 */
export function practiseSummary(
  questions: QuizQuestion[], results: QuizResults,
): PractiseSummary {
  const { known, total } = knownCount(questions, results);
  const remaining = total - known;

  // The bank comes off the network and the answers off the device, so this
  // renders for a beat with nothing in it. Saying "all 0 done" in that beat
  // would be both wrong and the most triumphant thing on the screen.
  if (total === 0) return { known: 0, total: 0, remaining: 0, done: "", toGo: "" };

  return {
    known, total, remaining,
    done: remaining === 0 ? `All ${total} done` : `${known} done`,
    toGo: remaining === 0 ? "" : `${remaining} to go`,
  };
}
