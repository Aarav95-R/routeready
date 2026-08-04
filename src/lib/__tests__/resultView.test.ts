import { creditsByCategory, faultElapsedMs, formatElapsed } from "../resultView";
import { marksToFaults, type Mark } from "@/lib/examiner";

test("formatElapsed renders m:ss and never goes negative", () => {
  expect(formatElapsed(0)).toBe("0:00");
  expect(formatElapsed(72_000)).toBe("1:12");
  expect(formatElapsed(-500)).toBe("0:00");
});

test("faultElapsedMs pairs each examiner fault with its mark's elapsed time", () => {
  const marks: Mark[] = [
    { category: "mirrors", level: "minor", t: 1_000, at: null },
    { category: "junctions", level: "major", t: 5_000, at: null },
  ];
  const faults = marksToFaults(marks);
  expect(faultElapsedMs(faults, marks, 0)).toEqual([1_000, 5_000]);
});

test("a credit interleaved between two examiner marks does not shift the pairing", () => {
  const marks: Mark[] = [
    { category: "mirrors", level: "minor", t: 1_000, at: null },
    { category: "control", level: "credit", t: 2_000, at: null },
    { category: "junctions", level: "major", t: 5_000, at: null },
  ];
  const faults = marksToFaults(marks);
  expect(faultElapsedMs(faults, marks, 0)).toEqual([1_000, 5_000]);
});

test("two marks on the same category still get their own distinct times", () => {
  const marks: Mark[] = [
    { category: "mirrors", level: "minor", t: 1_000, at: null },
    { category: "mirrors", level: "minor", t: 9_000, at: null },
  ];
  const faults = marksToFaults(marks);
  expect(faultElapsedMs(faults, marks, 0)).toEqual([1_000, 9_000]);
});

test("startedAt offsets the elapsed time", () => {
  const marks: Mark[] = [{ category: "mirrors", level: "minor", t: 6_000, at: null }];
  const faults = marksToFaults(marks);
  expect(faultElapsedMs(faults, marks, 1_000)).toEqual([5_000]);
});

test("speeding and observation faults never get a time", () => {
  const faults = [
    { kind: "speeding" as const, severity: "minor" as const, tag: "Speeding", detail: "d" },
    { kind: "observation" as const, severity: "minor" as const, tag: "Junction observations", detail: "d" },
  ];
  expect(faultElapsedMs(faults, [], 0)).toEqual([null, null]);
});

test("an unknown-category mark is dropped by marksToFaults and by the matcher alike", () => {
  const marks: Mark[] = [
    { category: "not-a-real-category", level: "minor", t: 1_000, at: null },
    { category: "mirrors", level: "minor", t: 4_000, at: null },
  ];
  const faults = marksToFaults(marks);
  expect(faultElapsedMs(faults, marks, 0)).toEqual([4_000]);
});

test("a broken invariant shows no time rather than the wrong one", () => {
  // Fabricated mismatch: a fault tag with no corresponding mark at that
  // position. This should never happen via marksToFaults, but the matcher
  // must fail safe rather than guess.
  const marks: Mark[] = [{ category: "mirrors", level: "minor", t: 1_000, at: null }];
  const faults = [
    { kind: "examiner" as const, severity: "minor" as const, tag: "Junctions", detail: "d" },
  ];
  expect(faultElapsedMs(faults, marks, 0)).toEqual([null]);
});

test("creditsByCategory groups and counts, empty when there are none", () => {
  const marks: Mark[] = [
    { category: "mirrors", level: "credit", t: 1, at: null },
    { category: "mirrors", level: "credit", t: 2, at: null },
    { category: "junctions", level: "credit", t: 3, at: null },
    { category: "control", level: "minor", t: 4, at: null },
  ];
  expect(creditsByCategory(marks)).toEqual([
    { category: "mirrors", label: "Use of mirrors", count: 2 },
    { category: "junctions", label: "Junctions", count: 1 },
  ]);
  expect(creditsByCategory([])).toEqual([]);
});
