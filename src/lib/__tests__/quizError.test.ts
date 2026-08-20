import { loadFailure } from "../quizError";

test("a missing column reads as a build that is ahead of the database", () => {
  // The exact error Postgres returns, via PostgREST, when the app queries a
  // column the project has not had migrated yet. It is a setup problem, and
  // saying "check your connection" sends the reader looking in the wrong place.
  const f = loadFailure(new Error("column show_me_tell_me.topic does not exist"));
  expect(f.headline).toMatch(/database/i);
  expect(f.detail).toContain("2026-08-18-quiz.sql");
});

test("the missing-column case is recognised whatever column is named", () => {
  expect(loadFailure(new Error("column show_me_tell_me.choices does not exist")).headline)
    .toBe(loadFailure(new Error("column show_me_tell_me.topic does not exist")).headline);
});

test("an ordinary failure keeps the plain message and blames nothing", () => {
  const f = loadFailure(new Error("Network request failed"));
  expect(f.headline).toBe("Couldn't load the questions.");
  expect(f.detail).not.toMatch(/migration|\.sql/i);
});

test("the underlying reason is carried through, so a repeat failure is legible", () => {
  // The bug that prompted this: every failure printed one identical line, so
  // pressing Try again and failing again was indistinguishable from a button
  // that did nothing.
  expect(loadFailure(new Error("Network request failed")).detail).toContain("Network request failed");
});

test("something thrown that is not an Error still produces a message", () => {
  expect(loadFailure("boom").headline).toBe("Couldn't load the questions.");
  expect(loadFailure(undefined).headline).toBe("Couldn't load the questions.");
});
