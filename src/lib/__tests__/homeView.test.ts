import {
  averageScore, durationWords, faultCounts, finding, firstName, greeting,
  nextStep, recentDrives, scoreSummary,
} from "../homeView";
import type { ProgressEntry } from "@/types/db";

const at = (iso: string, score: number | null, mistakes: string[] = []): ProgressEntry => ({
  user_id: "u1", route_id: "r1", completed_at: iso,
  mock_test_score: score, mistakes, duration_seconds: 1200,
});

const NOW = new Date("2026-08-13T19:00:00Z");

test("the greeting follows the clock", () => {
  expect(greeting(new Date("2026-08-13T08:00:00"))).toBe("Good morning");
  expect(greeting(new Date("2026-08-13T13:30:00"))).toBe("Good afternoon");
  expect(greeting(new Date("2026-08-13T19:00:00"))).toBe("Good evening");
  // Boundaries, in both directions.
  expect(greeting(new Date("2026-08-13T11:59:00"))).toBe("Good morning");
  expect(greeting(new Date("2026-08-13T12:00:00"))).toBe("Good afternoon");
  expect(greeting(new Date("2026-08-13T17:00:00"))).toBe("Good evening");
});

test("only the first word of a name is greeted", () => {
  expect(firstName("Sumeet Raheja")).toBe("Sumeet");
  expect(firstName("  Sumeet  ")).toBe("Sumeet");
  expect(firstName("")).toBe("");
  expect(firstName(null)).toBe("");
  expect(firstName(undefined)).toBe("");
});

test("attempts come back oldest first, with best and delta", () => {
  const s = scoreSummary([
    at("2026-08-03T10:00:00Z", 71),
    at("2026-07-02T10:00:00Z", 48),
    at("2026-08-11T10:00:00Z", 78),
  ]);
  expect(s.attempts.map((a) => a.score)).toEqual([48, 71, 78]);
  expect(s.count).toBe(3);
  expect(s.latest).toBe(78);
  expect(s.best).toBe(78);
  expect(s.delta).toBe(7);
});

// Practice drives write a row with no score. They are not attempts.
test("unscored rows never reach the chart", () => {
  const s = scoreSummary([at("2026-08-03T10:00:00Z", null), at("2026-08-04T10:00:00Z", 62)]);
  expect(s.count).toBe(1);
  expect(s.latest).toBe(62);
  expect(s.delta).toBeNull();
});

// A test taken on the train is queued locally and has no server timestamp yet.
// Dropping it would lose the most recent attempt of all.
test("an attempt with no timestamp is kept, at the end", () => {
  const s = scoreSummary([
    at("2026-07-02T10:00:00Z", 48),
    { user_id: "u1", route_id: "r1", mock_test_score: 80, mistakes: [], duration_seconds: 900 },
  ]);
  expect(s.attempts.map((a) => a.score)).toEqual([48, 80]);
  expect(s.latest).toBe(80);
});

test("no attempts at all summarises to nulls, not zeroes", () => {
  const s = scoreSummary([]);
  expect(s).toEqual({ attempts: [], count: 0, latest: null, best: null, delta: null, lastAt: null });
});

describe("the finding under your name", () => {
  test("says nothing about scores when there are none", () => {
    expect(finding(scoreSummary([]), NOW)).toBe("Let's find out where you're starting from.");
  });

  test("names the first attempt as a start rather than a trend", () => {
    expect(finding(scoreSummary([at("2026-08-11T10:00:00Z", 48)]), NOW))
      .toBe("Your first mock test is on the board.");
  });

  test("a fortnight away outranks anything about scores", () => {
    const rows = [at("2026-07-01T10:00:00Z", 40), at("2026-07-20T10:00:00Z", 90)];
    expect(finding(scoreSummary(rows), NOW)).toBe("It's been a fortnight since your last mock test.");
  });

  test("a personal best is the headline when it is fresh", () => {
    const rows = [at("2026-08-06T10:00:00Z", 60), at("2026-08-11T10:00:00Z", 78)];
    expect(finding(scoreSummary(rows), NOW)).toBe("That's your best yet.");
  });

  test("a run above your own average is counted in words", () => {
    // mean of 40,30,50,55,60 is 47 — the last three clear it, the best is not the latest.
    const rows = [
      at("2026-08-01T10:00:00Z", 40), at("2026-08-03T10:00:00Z", 30),
      at("2026-08-05T10:00:00Z", 50), at("2026-08-07T10:00:00Z", 65),
      at("2026-08-11T10:00:00Z", 60),
    ];
    expect(finding(scoreSummary(rows), NOW)).toBe("three tests in a row above your average.");
  });

  test("a dip is stated, not scolded", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 90), at("2026-08-05T10:00:00Z", 60),
      at("2026-08-11T10:00:00Z", 52),
    ];
    expect(finding(scoreSummary(rows), NOW)).toBe("8 down on your last — it happens.");
  });

  test("a rise that is not a best still says so", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 90), at("2026-08-05T10:00:00Z", 40),
      at("2026-08-11T10:00:00Z", 47),
    ];
    expect(finding(scoreSummary(rows), NOW)).toBe("Up 7 on your last.");
  });

  test("two identical scores are level, not a rise", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 90), at("2026-08-05T10:00:00Z", 55),
      at("2026-08-11T10:00:00Z", 55),
    ];
    expect(finding(scoreSummary(rows), NOW)).toBe("Level with your last.");
  });
});

test("fault kinds are counted across every attempt, worst first", () => {
  const rows = [
    at("2026-08-01T10:00:00Z", 60, ["Roundabout observations", "Speeding"]),
    at("2026-08-05T10:00:00Z", 65, ["Roundabout observations", "Junction observations"]),
    at("2026-08-11T10:00:00Z", 70, ["Roundabout observations", "Speeding"]),
  ];
  expect(faultCounts(rows)).toEqual([
    { tag: "Roundabout observations", count: 3 },
    { tag: "Speeding", count: 2 },
    { tag: "Junction observations", count: 1 },
  ]);
});

// Two kinds on the same count must not swap places between loads.
test("ties break alphabetically so the panel holds still", () => {
  const rows = [at("2026-08-01T10:00:00Z", 60, ["Speeding", "Junction observations"])];
  expect(faultCounts(rows).map((f) => f.tag)).toEqual(["Junction observations", "Speeding"]);
});

test("only the worst few are returned", () => {
  const rows = [at("2026-08-01T10:00:00Z", 60, ["a", "b", "c", "d", "e"])];
  expect(faultCounts(rows)).toHaveLength(3);
  expect(faultCounts(rows, 5)).toHaveLength(5);
});

test("a clean sheet has nothing to list", () => {
  expect(faultCounts([at("2026-08-01T10:00:00Z", 100)])).toEqual([]);
});

describe("what to do next", () => {
  const summaryOf = (...rows: ProgressEntry[]) => scoreSummary(rows);

  test("no tests at all asks for a first one", () => {
    expect(nextStep(summaryOf(), [])).toEqual({ kind: "first" });
  });

  // One test is a day, not a habit. Because `tags` is deduped per test, a lone
  // test tagged only "Speeding" strictly beats a runner-up that does not
  // exist — without this floor, one data point would diagnose a habit.
  test("one test asks for a second, and lists what that test cost", () => {
    const rows = [at("2026-08-11T10:00:00Z", 55, ["Speeding"])];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "baseline", tags: ["Speeding"],
    });
  });

  test("a single clean test still asks for a second, with nothing to list", () => {
    const rows = [at("2026-08-11T10:00:00Z", 100)];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "baseline", tags: [],
    });
  });

  // result.tsx already renders "A clean drive — no faults recorded", so two of
  // them is reachable. Without this branch the card is built from faults[0] of
  // an empty array.
  test("tests with no faults on any of them have nothing to diagnose", () => {
    const rows = [at("2026-08-01T10:00:00Z", 100), at("2026-08-11T10:00:00Z", 95)];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({ kind: "clean" });
  });

  test("a fault leads only when it strictly beats the runner-up", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 60, ["Junction observations", "Speeding"]),
      at("2026-08-05T10:00:00Z", 65, ["Junction observations"]),
      at("2026-08-11T10:00:00Z", 70, ["Junction observations"]),
    ];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "fault",
      tag: "Junction observations",
      count: 3,
      of: 3,
      runners: [{ tag: "Speeding", count: 1 }],
    });
  });

  test("a tie at the top names every tag level with it", () => {
    const rows = [
      at("2026-08-01T10:00:00Z", 60, ["Junction observations", "Use of mirrors"]),
      at("2026-08-11T10:00:00Z", 65, ["Junction observations", "Use of mirrors", "Speeding"]),
    ];
    expect(nextStep(summaryOf(...rows), faultCounts(rows))).toEqual({
      kind: "tied", tags: ["Junction observations", "Use of mirrors"],
    });
  });
});

test("the average is the mean of every scored attempt, rounded", () => {
  const rows = [
    at("2026-08-01T10:00:00Z", 55), at("2026-08-05T10:00:00Z", 70),
    at("2026-08-11T10:00:00Z", 88),
  ];
  expect(averageScore(scoreSummary(rows))).toBe(71);
  expect(averageScore(scoreSummary([]))).toBeNull();
});

// A practice drive writes a row with no score. scoreSummary already drops
// those, so the average must never see them.
test("the average ignores unscored rows", () => {
  const rows = [at("2026-08-01T10:00:00Z", null), at("2026-08-11T10:00:00Z", 80)];
  expect(averageScore(scoreSummary(rows))).toBe(80);
});

test("a duration reads as minutes, and never as none", () => {
  expect(durationWords(2460)).toBe("41 min");
  expect(durationWords(90)).toBe("2 min");
  expect(durationWords(20)).toBe("1 min");
  expect(durationWords(0)).toBe("1 min");
});

describe("the drives the history list shows", () => {
  test("are scored, most recent first, and capped", () => {
    const rows = [
      at("2026-07-01T10:00:00Z", 40), at("2026-08-12T10:00:00Z", 88),
      at("2026-07-14T10:00:00Z", 55), at("2026-08-01T10:00:00Z", 70),
    ];
    expect(recentDrives(rows).map((r) => r.mock_test_score)).toEqual([88, 70, 55]);
    expect(recentDrives(rows, 2).map((r) => r.mock_test_score)).toEqual([88, 70]);
  });

  // A practice drive writes a row with no score. It is not a test and has no
  // place in a list of them.
  test("never include an unscored drive", () => {
    const rows = [at("2026-08-12T10:00:00Z", null), at("2026-08-01T10:00:00Z", 70)];
    expect(recentDrives(rows).map((r) => r.mock_test_score)).toEqual([70]);
  });

  // A test taken offline is queued with no server timestamp. It is the most
  // recent thing that happened and must not sort to the bottom.
  test("a drive with no timestamp yet leads the list", () => {
    const rows = [
      at("2026-08-12T10:00:00Z", 88),
      { user_id: "u1", route_id: "r1", mock_test_score: 62, mistakes: [], duration_seconds: 900 },
    ];
    expect(recentDrives(rows).map((r) => r.mock_test_score)).toEqual([62, 88]);
  });
});
