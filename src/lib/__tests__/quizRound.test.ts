import { ROUND_SIZE, dealRound, scoreLine, seededRng } from "../quizRound";
import type { QuizCategory, QuizQuestion } from "@/types/db";
import type { QuizResults } from "@/services/quizResults";

const q = (id: string, category: QuizCategory = "safety"): QuizQuestion => ({
  id, category, topic: `Topic ${id}`, is_show_me: false,
  question: `Tell me about ${id}.`,
  answer: `The answer to ${id}.`,
  choices: [
    { text: `${id} right`, correct: true },
    { text: `${id} wrong 1`, correct: false },
    { text: `${id} wrong 2`, correct: false },
    { text: `${id} wrong 3`, correct: false },
  ],
});

const results = (answers: Record<string, boolean>): QuizResults => ({ answers, lastScore: null });

/** A stand-in for Math.random that never shuffles, so order is the input's. */
const noShuffle = () => 0;

const bank = (n: number) => Array.from({ length: n }, (_, i) => q(`q${i}`));

test("a round is ten questions", () => {
  expect(dealRound(bank(19), results({}), { rng: noShuffle })).toHaveLength(ROUND_SIZE);
  expect(ROUND_SIZE).toBe(10);
});

test("a bank smaller than a round deals the whole bank rather than padding it", () => {
  expect(dealRound(bank(4), results({}), { rng: noShuffle })).toHaveLength(4);
});

test("an empty bank deals an empty round rather than throwing", () => {
  expect(dealRound([], results({}), { rng: noShuffle })).toEqual([]);
});

test("questions never seen are dealt before anything else", () => {
  const answered = Object.fromEntries(bank(19).slice(0, 15).map((x) => [x.id, true]));
  const round = dealRound(bank(19), results(answered), { rng: noShuffle });
  // q15..q18 are the four never answered, and must all be in the round.
  const ids = round.map((r) => r.question.id);
  expect(ids.slice(0, 4).sort()).toEqual(["q15", "q16", "q17", "q18"]);
});

test("questions last got wrong come next, ahead of ones already known", () => {
  const all = bank(12);
  // Every question seen: q0 wrong, the rest right. Ten of twelve get dealt,
  // and the one wrong answer must not be among the two left out.
  const answers = Object.fromEntries(all.map((x) => [x.id, x.id !== "q0"]));
  const ids = dealRound(all, results(answers), { rng: noShuffle }).map((r) => r.question.id);
  expect(ids[0]).toBe("q0");
});

test("a round with nothing left to revise still deals known questions", () => {
  const all = bank(12);
  const answers = Object.fromEntries(all.map((x) => [x.id, true]));
  expect(dealRound(all, results(answers), { rng: noShuffle })).toHaveLength(ROUND_SIZE);
});

test("no question is dealt to the same round twice", () => {
  const round = dealRound(bank(19), results({ q0: false, q1: true }), { rng: noShuffle });
  const ids = round.map((r) => r.question.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("options are shuffled, so the right answer is not always in the same place", () => {
  // With a real generator across many deals the correct option must land in
  // more than one position, or the quiz is answerable without reading.
  const seen = new Set<number>();
  for (let i = 0; i < 40; i++) {
    const [first] = dealRound([q("only")], results({}), { rng: seededRng(i) });
    seen.add(first.choices.findIndex((c) => c.correct));
  }
  expect(seen.size).toBeGreaterThan(1);
});

test("shuffling keeps every option and exactly one right one", () => {
  const [first] = dealRound([q("only")], results({}), { rng: seededRng(7) });
  expect(first.choices).toHaveLength(4);
  expect(first.choices.map((c) => c.text).sort())
    .toEqual(["only right", "only wrong 1", "only wrong 2", "only wrong 3"]);
  expect(first.choices.filter((c) => c.correct)).toHaveLength(1);
});

test("the same seed deals the same round, so a re-render never moves an option", () => {
  const a = dealRound(bank(19), results({}), { rng: seededRng(42) });
  const b = dealRound(bank(19), results({}), { rng: seededRng(42) });
  expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
});

test("scoreLine says how it went against the round before", () => {
  expect(scoreLine(7, 10, 5)).toContain("Better than your last round");
  expect(scoreLine(5, 10, 7)).toContain("last round");
  expect(scoreLine(7, 10, 7)).toContain("Same as your last round");
});

test("a first-ever round is not compared against a round that never happened", () => {
  expect(scoreLine(7, 10, null)).not.toContain("last round");
});

test("a clean sweep is called out rather than described as an improvement", () => {
  expect(scoreLine(10, 10, 4)).toContain("Every one");
});
