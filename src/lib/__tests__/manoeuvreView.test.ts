import { activeStepAt, blurbFor, buildSections, slugFor } from "../manoeuvreView";
import type { Manoeuvre } from "@/types/db";

const m = (name: string): Manoeuvre => ({ id: name, name, steps: [], tips: [] });

// The order Supabase hands them back: `.order("name")`, i.e. alphabetical.
const ALL = [
  m("Bay park (reverse)"), m("Forward bay park"), m("Parallel park"), m("Pull up on the right"),
];

test("the three reversing manoeuvres are separated from the one on a live road", () => {
  const sections = buildSections(ALL);
  expect(sections.map((s) => s.title)).toEqual(["Reversing", "On the road"]);
  expect(sections[1].data.map((v) => v.manoeuvre.name)).toEqual(["Pull up on the right"]);
});

test("rows are ordered by the design, not by the query", () => {
  // Alphabetical puts Parallel park third, which buries the one most people
  // arrive looking for.
  expect(buildSections(ALL)[0].data.map((v) => v.manoeuvre.name)).toEqual([
    "Parallel park", "Bay park (reverse)", "Forward bay park",
  ]);
});

test("a manoeuvre this build does not know still gets a row", () => {
  const sections = buildSections([...ALL, m("Emergency stop")]);
  expect(sections.map((s) => s.title)).toEqual(["Reversing", "On the road", "More"]);
  expect(sections[2].data[0].slug).toBeNull();
  expect(sections[2].data[0].blurb).toBe("");
});

test("a section with nothing in it is not drawn", () => {
  expect(buildSections([m("Parallel park")]).map((s) => s.title)).toEqual(["Reversing"]);
  expect(buildSections([])).toEqual([]);
});

test("the two bay parks are told apart by their blurbs", () => {
  expect(blurbFor("Bay park (reverse)")).toContain("nose-out");
  expect(blurbFor("Forward bay park")).toContain("nose-in");
});

test("slugFor matches the seeded spelling exactly", () => {
  expect(slugFor("Parallel park")).toBe("parallel");
  expect(slugFor("parallel park")).toBeNull();
});

test("activeStepAt reads the row that has reached the top of the list", () => {
  const tops = [0, 120, 260, 380, 500, 640];
  expect(activeStepAt(0, tops)).toBe(0);
  expect(activeStepAt(119, tops)).toBe(0);
  expect(activeStepAt(120, tops)).toBe(1);
  expect(activeStepAt(9999, tops)).toBe(5);
});

test("activeStepAt holds on the first step while the header above it scrolls", () => {
  // The steps do not start at zero — a group header sits above them — so a
  // scroll that has not yet reached the first row must not read as "before
  // step one", which has no pose to draw.
  const tops = [64, 184, 324];
  expect(activeStepAt(0, tops)).toBe(0);
  expect(activeStepAt(63, tops)).toBe(0);
  expect(activeStepAt(64, tops)).toBe(0);
  expect(activeStepAt(184, tops)).toBe(1);
});

test("activeStepAt survives being asked before the rows have been measured", () => {
  expect(activeStepAt(240, [])).toBe(0);
});
