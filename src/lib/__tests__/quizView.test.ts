import { buildSections, kindLabel, knownCount, practiseSummary, stateOf } from "../quizView";
import type { QuizCategory, QuizQuestion } from "@/types/db";
import type { QuizResults } from "@/services/quizResults";

const q = (
  id: string, category: QuizCategory, topic: string, is_show_me = false,
): QuizQuestion => ({
  id, category, topic, is_show_me,
  question: `Tell me how you'd check ${topic}.`,
  answer: "I'd check it.",
  choices: [{ text: "Right", correct: true }, { text: "Wrong", correct: false }],
});

const results = (answers: Record<string, boolean>): QuizResults =>
  ({ answers, lastScore: null });

const ALL = [
  q("a", "safety", "Tyre tread and condition"),
  q("b", "under_bonnet", "Engine oil"),
  q("c", "inside_car", "The horn", true),
  q("d", "safety", "Head restraint"),
];

test("the three categories are read in the order the design puts them in", () => {
  // Not the order the query returns, and not alphabetical — alphabetical puts
  // "Inside the car" first, which is the category a learner is least likely to
  // be revising the night before.
  expect(buildSections(ALL, results({})).map((s) => s.title)).toEqual([
    "Safety and the outside", "Inside the car", "Under the bonnet",
  ]);
});

test("a section counts its own questions", () => {
  const [safety] = buildSections(ALL, results({}));
  expect(safety.data).toHaveLength(2);
  expect(safety.count).toBe(2);
});

test("a category with nothing in it is not drawn", () => {
  const titles = buildSections([q("a", "safety", "Tyres")], results({})).map((s) => s.title);
  expect(titles).toEqual(["Safety and the outside"]);
  expect(buildSections([], results({}))).toEqual([]);
});

test("a question in a category this build does not know still gets a row", () => {
  const rogue = { ...q("z", "safety", "Something new"), category: "wipers" as QuizCategory };
  const sections = buildSections([...ALL, rogue], results({}));
  expect(sections.map((s) => s.title)).toContain("More");
  expect(sections[sections.length - 1].data[0].question.id).toBe("z");
});

test("a question is known when the last answer to it was right", () => {
  expect(stateOf("a", results({ a: true }))).toBe("known");
});

test("a question answered wrong last time is one to revisit", () => {
  expect(stateOf("a", results({ a: false }))).toBe("revisit");
});

test("a question never answered is unseen, which the row draws as nothing", () => {
  expect(stateOf("a", results({}))).toBe("unseen");
});

test("the row carries its own state so the screen does not recompute it", () => {
  const [safety] = buildSections(ALL, results({ a: true, d: false }));
  expect(safety.data.map((v) => v.state)).toEqual(["known", "revisit"]);
});

test("known counts only right answers, against every question in the bank", () => {
  expect(knownCount(ALL, results({ a: true, b: false, c: true }))).toEqual({ known: 2, total: 4 });
});

test("a result for a question no longer in the bank does not inflate the count", () => {
  // A reseed can retire a question. The stored answer outlives it.
  expect(knownCount(ALL, results({ a: true, retired: true }))).toEqual({ known: 1, total: 4 });
});

test("the second line of a row says which way the examiner will ask", () => {
  expect(kindLabel(q("c", "inside_car", "The horn", true))).toBe("Show me");
  expect(kindLabel(q("a", "safety", "Tyres", false))).toBe("Tell me");
});

test("the hero says what is done and what is left, in that order", () => {
  // Done first because it is the half that is true about the person; to go is
  // the size of the job. A single "9 of 20" reads as a score and nothing else.
  expect(practiseSummary(ALL, results({ a: true }))).toMatchObject({
    done: "1 done", toGo: "3 to go",
  });
});

test("a finished bank is congratulated rather than shown a job of nothing", () => {
  expect(practiseSummary(ALL, results({ a: true, b: true, c: true, d: true })))
    .toMatchObject({ done: "All 4 done", toGo: "" });
});

test("an empty bank says nothing rather than claiming everything is done", () => {
  // The questions come off the network and the answers off the device, so the
  // hero renders for a beat with a bank of zero.
  expect(practiseSummary([], results({}))).toEqual({
    known: 0, total: 0, remaining: 0, done: "", toGo: "",
  });
});

test("the hero carries the numbers the bar is drawn from", () => {
  expect(practiseSummary(ALL, results({ a: true, b: false }))).toMatchObject({
    known: 1, total: 4, remaining: 3,
  });
});
