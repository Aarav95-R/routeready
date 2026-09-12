import { useMockTest } from "../mockTestStore";
import type { Route } from "@/types/db";
import { HABITUAL_MINOR_THRESHOLD } from "@/lib/examiner";
import { MIN_ASSESSABLE_SECONDS } from "@/lib/scoring/engine";

const route: Route = {
  id: "r1", centre_id: "c1", name: "Test route",
  geometry: { type: "LineString", coordinates: [[-0.1, 51.5], [-0.1, 51.51], [-0.1, 51.52]] },
  estimated_minutes: 30, distance_km: 5, difficulty: 2,
  speed_profile: [{ startIdx: 0, endIdx: 2, limitMph: 30 }],
  observation_zones: [{ lat: 51.51, lng: -0.1, radiusM: 60, kind: "roundabout" }],
  is_free: true,
};

/** Long enough to be given a verdict. */
const FULL = (MIN_ASSESSABLE_SECONDS + 60) * 1000;

beforeEach(() => useMockTest.getState().reset());

test("finish computes duration and phase", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  const r = useMockTest.getState().finish(FULL);
  expect(r.durationSeconds).toBe(FULL / 1000);
  expect(useMockTest.getState().phase).toBe("finished");
  expect(r.assessable).toBe(true);
});

test("addMark records the mark with its time and place", () => {
  const s = useMockTest.getState();
  s.addMark("mirrors", "minor", { lat: 51.5, lng: -0.1 }, 1000);
  expect(useMockTest.getState().marks).toEqual([
    { category: "mirrors", level: "minor", t: 1000, at: { lat: 51.5, lng: -0.1 } },
  ]);
});

test("undoMark removes the last mark, and does nothing when there are none", () => {
  const s = useMockTest.getState();
  expect(() => s.undoMark()).not.toThrow();
  s.addMark("mirrors", "minor", null, 1);
  s.addMark("speed", "major", null, 2);
  useMockTest.getState().undoMark();
  expect(useMockTest.getState().marks.map((m) => m.category)).toEqual(["mirrors"]);
});

test("examiner marks reach the result as faults and credits", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  useMockTest.getState().addMark("mirrors", "minor", null, 1);
  useMockTest.getState().addMark("junctions", "major", null, 2);
  useMockTest.getState().addMark("control", "credit", null, 3);
  const r = useMockTest.getState().finish(FULL);
  expect(r.minors).toBe(1);
  expect(r.majors).toBe(1);
  expect(r.credits).toBe(1);
  expect(r.passed).toBe(false); // one serious fails, credit notwithstanding
  expect(r.tags).toContain("Use of mirrors");
});

// ── The score is the mark sheet ───────────────────────────────────────────
//
// The store used to hold a second opinion: every GPS sample, a running speeding
// detector, and which observation zones had been passed through untapped. Both
// fed the result, and both could overrule the person doing the assessing — a
// noisy fix five seconds over a seeded limit scored a *serious* fault, which
// fails a test outright, and never appeared on the sheet to be undone.

test("a drive with nothing marked is a clean drive", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  const r = useMockTest.getState().finish(FULL);

  expect(r.faults).toEqual([]);
  expect(r.passed).toBe(true);
  expect(r.score).toBe(100);
});

test("every fault on the result came from the mark sheet", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  useMockTest.getState().addMark("speed", "minor", null, 1);
  const r = useMockTest.getState().finish(FULL);

  expect(r.faults).toHaveLength(1);
  expect(r.faults.every((f) => f.kind === "examiner")).toBe(true);
});

// ── The verdict guard ─────────────────────────────────────────────────────
//
// It used to ask whether any GPS samples had arrived, because a drive with no
// samples produced no auto-faults and so looked identical to a flawless one.
// With the score coming from a person, that question stopped meaning anything —
// but an empty sheet still must not be a pass at 100 for a test nobody drove.

test("a test too short to be a test is not given a verdict", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  const r = useMockTest.getState().finish(60_000);

  expect(r.assessable).toBe(false);
  expect(r.passed).toBe(false);
  expect(r.score).toBe(0);
});

test("the guard is duration alone — no fixes are needed to be assessed", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  useMockTest.getState().addMark("mirrors", "minor", null, 1);
  const r = useMockTest.getState().finish(FULL);

  expect(r.assessable).toBe(true);
  expect(r.minors).toBe(1);
});

test("the boundary is inclusive", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  expect(useMockTest.getState().finish(MIN_ASSESSABLE_SECONDS * 1000).assessable).toBe(true);
});

// ── Habitual faults ───────────────────────────────────────────────────────

test("repeated minors on one category surface as a warning", () => {
  for (let i = 0; i < HABITUAL_MINOR_THRESHOLD; i++) {
    useMockTest.getState().addMark("mirrors", "minor", null, i);
  }
  expect(useMockTest.getState().warnings()).toEqual([
    { category: "mirrors", label: "Use of mirrors", count: HABITUAL_MINOR_THRESHOLD },
  ]);
});

test("reset clears marks", () => {
  const s = useMockTest.getState();
  s.addMark("mirrors", "minor", null, 1);
  useMockTest.getState().reset();
  expect(useMockTest.getState().marks).toEqual([]);
});

// ── Departures ────────────────────────────────────────────────────────────

test("a drive with no departures records none", () => {
  expect(useMockTest.getState().deviations).toEqual([]);
});

test("departures accumulate in the order they happened", () => {
  const { addDeviation } = useMockTest.getState();
  addDeviation({ atIdx: 40, skippedM: 380, seconds: 47 });
  addDeviation({ atIdx: 210, skippedM: 240, seconds: 22 });
  const d = useMockTest.getState().deviations;
  expect(d).toHaveLength(2);
  expect(d.map((x) => x.atIdx)).toEqual([40, 210]);
  expect(d[0].skippedM).toBe(380);
});

test("starting a new test clears the previous run's departures", () => {
  useMockTest.getState().addDeviation({ atIdx: 40, skippedM: 380, seconds: 47 });
  useMockTest.getState().start(route);
  expect(useMockTest.getState().deviations).toEqual([]);
});

test("a departure is never scored as a fault", () => {
  const before = useMockTest.getState().marks.length;
  useMockTest.getState().addDeviation({ atIdx: 40, skippedM: 380, seconds: 47 });
  expect(useMockTest.getState().marks).toHaveLength(before);
});
