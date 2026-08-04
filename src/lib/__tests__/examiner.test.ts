import {
  creditCount, EXAMINER_CATEGORIES, HABITUAL_MINOR_THRESHOLD, habitualWarnings,
  marksToFaults, minorCountsByCategory, type Mark,
} from "../examiner";

const mk = (category: string, level: Mark["level"], t = 0): Mark =>
  ({ category, level, t, at: null });

test("the categories are DVSA's, grouped by when they can be marked", () => {
  const byGroup = (g: string) => EXAMINER_CATEGORIES.filter((c) => c.group === g);
  expect(byGroup("driving")).toHaveLength(16);
  expect(byGroup("manoeuvres")).toHaveLength(4);
  expect(byGroup("beforeDriving")).toHaveLength(3);
});

test("category ids are unique and every one is fully described", () => {
  const ids = EXAMINER_CATEGORIES.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const c of EXAMINER_CATEGORIES) {
    expect(c.label.length).toBeGreaterThan(0);
    // Both examples exist because no category is inherently one level or the
    // other — the panel has to show where the line falls for each.
    expect(c.minorExample.length).toBeGreaterThan(0);
    expect(c.majorExample.length).toBeGreaterThan(0);
  }
});

test("the categories DVSA excludes from a car test are absent", () => {
  const ids = EXAMINER_CATEGORIES.map((c) => c.id);
  expect(ids).not.toContain("uncoupling");
  expect(ids).not.toContain("ecoDriving");
});

test("marksToFaults converts fault marks and drops credits", () => {
  const faults = marksToFaults([
    mk("mirrors", "minor"), mk("junctions", "major"), mk("control", "credit"),
  ]);
  expect(faults).toHaveLength(2);
  expect(faults[0]).toMatchObject({ kind: "examiner", severity: "minor", tag: "Use of mirrors" });
  expect(faults[1]).toMatchObject({ kind: "examiner", severity: "major", tag: "Junctions" });
});

test("marksToFaults ignores an unknown category rather than crashing", () => {
  expect(marksToFaults([mk("nonsense", "minor")])).toEqual([]);
});

test("creditCount counts only credits", () => {
  expect(creditCount([mk("a", "credit"), mk("b", "credit"), mk("c", "minor")])).toBe(2);
});

test("minorCountsByCategory counts minors per category, ignoring majors and credits", () => {
  const counts = minorCountsByCategory([
    mk("mirrors", "minor"), mk("mirrors", "minor"), mk("mirrors", "credit"),
    mk("mirrors", "major"), mk("speed", "minor"),
  ]);
  expect(counts).toEqual({ mirrors: 2, speed: 1 });
});

test("habitualWarnings fires at the threshold, not before", () => {
  const two = [mk("mirrors", "minor"), mk("mirrors", "minor")];
  expect(habitualWarnings(two)).toEqual([]);

  const three = [...two, mk("mirrors", "minor")];
  expect(habitualWarnings(three)).toEqual([
    { category: "mirrors", label: "Use of mirrors", count: 3 },
  ]);
});

test("HABITUAL_MINOR_THRESHOLD is a warning, well under the fifteen-minor limit", () => {
  // DVSA gives no number for "habitually" — this warns, it never auto-escalates.
  expect(HABITUAL_MINOR_THRESHOLD).toBeGreaterThan(1);
  expect(HABITUAL_MINOR_THRESHOLD).toBeLessThan(15);
});
