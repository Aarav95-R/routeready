import { SHOW_ME_TELL_ME, SHOW_ME_TELL_ME_SQL } from "../questions";

test("the whole DVSA bank is seeded", () => {
  expect(SHOW_ME_TELL_ME.length).toBeGreaterThanOrEqual(19);
});

test("every question offers exactly four options", () => {
  // The round screen lays out four. A question with three would leave a gap
  // and a question with five would push the model answer off the screen.
  for (const q of SHOW_ME_TELL_ME) {
    expect(q.choices).toHaveLength(4);
  }
});

test("every question has exactly one right answer", () => {
  for (const q of SHOW_ME_TELL_ME) {
    expect(q.choices.filter((c) => c.correct)).toHaveLength(1);
  }
});

test("no question offers the same option twice", () => {
  for (const q of SHOW_ME_TELL_ME) {
    expect(new Set(q.choices.map((c) => c.text)).size).toBe(4);
  }
});

test("every question has a subject for its row and a model answer to say", () => {
  for (const q of SHOW_ME_TELL_ME) {
    expect(q.topic.length).toBeGreaterThan(2);
    expect(q.answer.length).toBeGreaterThan(20);
    expect(q.question.length).toBeGreaterThan(20);
  }
});

test("a subject is short enough to sit on one line of a row", () => {
  for (const q of SHOW_ME_TELL_ME) {
    expect(q.topic.length).toBeLessThanOrEqual(32);
  }
});

test("the subject does not simply repeat the question's opening words", () => {
  for (const q of SHOW_ME_TELL_ME) {
    expect(q.topic.toLowerCase()).not.toMatch(/^(show|tell) me/);
  }
});

test("no category is left as a rounding error", () => {
  // SETUP.md has flagged this since Phase 1: the bank shipped with a single
  // under-bonnet row cramming oil, coolant and brake fluid into one question.
  const counts = SHOW_ME_TELL_ME.reduce<Record<string, number>>((acc, q) => {
    acc[q.category] = (acc[q.category] ?? 0) + 1;
    return acc;
  }, {});
  expect(Object.keys(counts).sort()).toEqual(["inside_car", "safety", "under_bonnet"]);
  for (const category of Object.keys(counts)) {
    expect(counts[category]).toBeGreaterThanOrEqual(3);
  }
});

test("both kinds of question are asked, because the test asks one of each", () => {
  expect(SHOW_ME_TELL_ME.filter((q) => q.is_show_me).length).toBeGreaterThanOrEqual(5);
  expect(SHOW_ME_TELL_ME.filter((q) => !q.is_show_me).length).toBeGreaterThanOrEqual(5);
});

test("no two questions share a subject and a kind", () => {
  // Tyres are asked about twice, once each way, and those two rows are told
  // apart by their second line. Two rows identical in both would not be.
  const keys = SHOW_ME_TELL_ME.map((q) => `${q.topic}|${q.is_show_me}`);
  expect(new Set(keys).size).toBe(keys.length);
});

test("the right answer never stands out by being much the longest", () => {
  // The classic tell in a badly written multiple choice: the correct option
  // carries all the qualifications, so it is visibly the longest and the quiz
  // becomes answerable without reading the question.
  //
  // Measured as a margin over the longest *wrong* option rather than as "is it
  // the longest", because a tie or a couple of characters is not something a
  // reader can see. Ten characters is roughly a word and a half, which is.
  // Collected rather than asserted one at a time, so a failure names the
  // questions that need rewriting instead of stopping at the first.
  const tells = SHOW_ME_TELL_ME.filter((q) => {
    const right = q.choices.find((c) => c.correct)!.text.length;
    const longestWrong = Math.max(...q.choices.filter((c) => !c.correct).map((c) => c.text.length));
    return right - longestWrong > 10;
  }).map((q) => q.topic);
  expect(tells).toEqual([]);
});

test("the right answer is not always the one written first", () => {
  // Options are shuffled at deal time, but an unshuffled bank would still leak
  // the answer to anyone reading the seed file.
  const first = SHOW_ME_TELL_ME.filter((q) => q.choices[0].correct);
  expect(first.length).toBeLessThan(SHOW_ME_TELL_ME.length);
});

test("apostrophes survive the trip into SQL", () => {
  // Nearly every one of these questions contains "you'd". A single unescaped
  // quote ends the string early and the whole seed file fails to load.
  expect(SHOW_ME_TELL_ME.some((q) => q.question.includes("'"))).toBe(true);
  expect(SHOW_ME_TELL_ME_SQL).toContain("you''d");
  expect(SHOW_ME_TELL_ME_SQL).not.toMatch(/[^']you'd/);

  // Every apostrophe in the content is doubled and every string is delimited
  // by a pair, so a well-formed statement holds an even number of quotes.
  for (const statement of SHOW_ME_TELL_ME_SQL.trim().split("\n")) {
    expect((statement.match(/'/g) ?? []).length % 2).toBe(0);
  }
});

test("the generated SQL writes one row per question, with its options", () => {
  const statements = SHOW_ME_TELL_ME_SQL.trim().split("\n").filter(Boolean);
  expect(statements).toHaveLength(SHOW_ME_TELL_ME.length);
  for (const s of statements) {
    expect(s).toMatch(/^insert into show_me_tell_me \(id, category, topic, question, answer, is_show_me, choices\) values /);
    expect(s).toMatch(/::jsonb\);$/);
  }
});

test("the options land in the database as JSON the app can read back", () => {
  const [first] = SHOW_ME_TELL_ME_SQL.trim().split("\n");
  const json = first.match(/'(\[.*\])'::jsonb/)![1].replace(/''/g, "'");
  const parsed = JSON.parse(json) as { text: string; correct: boolean }[];
  expect(parsed).toHaveLength(4);
  expect(parsed.filter((c) => c.correct)).toHaveLength(1);
});
