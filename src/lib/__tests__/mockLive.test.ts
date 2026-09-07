import { liveTally } from "../mockLive";
import { MAX_MINORS } from "../scoring/engine";
import type { Mark } from "../examiner";

const mark = (category: string, level: Mark["level"]): Mark => ({ category, level, t: 0, at: null });

test("an untouched drive has the whole allowance", () => {
  expect(liveTally([])).toEqual({
    minors: 0, majors: 0, credits: 0, remaining: MAX_MINORS, stopped: false,
  });
});

test("each marked driving fault costs one of the fifteen", () => {
  const t = liveTally([mark("mirrors", "minor"), mark("junctions", "minor")]);
  expect(t.minors).toBe(2);
  expect(t.remaining).toBe(MAX_MINORS - 2);
  expect(t.stopped).toBe(false);
});


test("one serious fault settles the verdict however much headroom is left", () => {
  const t = liveTally([mark("junctions", "major")]);
  expect(t.stopped).toBe(true);
  expect(t.remaining).toBe(MAX_MINORS);
});

// Credits are this app's own idea, worth a few points of encouragement and
// nothing at all on the verdict.
test("a credit is counted but costs no headroom", () => {
  const t = liveTally([mark("mirrors", "credit")]);
  expect(t.credits).toBe(1);
  expect(t.minors).toBe(0);
  expect(t.remaining).toBe(MAX_MINORS);
});

test("headroom stops at zero rather than going negative", () => {
  const marks = Array.from({ length: 20 }, () => mark("mirrors", "minor"));
  const t = liveTally(marks);
  expect(t.minors).toBe(20);
  expect(t.remaining).toBe(0);
});

// marksToFaults drops a mark whose category no longer exists, and finish()
// drops it too. If the live tally counted it, the meter would promise less
// headroom than the result screen delivers.
test("a mark from an unknown category is ignored, exactly as scoring ignores it", () => {
  expect(liveTally([mark("no-such-category", "minor")]).minors).toBe(0);
});
