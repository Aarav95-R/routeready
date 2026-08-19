import { useMockTest } from "../mockTestStore";
import type { Route } from "@/types/db";
import { HABITUAL_MINOR_THRESHOLD } from "@/lib/examiner";

const route: Route = {
  id: "r1", centre_id: "c1", name: "Test route",
  geometry: { type: "LineString", coordinates: [[-0.1, 51.5], [-0.1, 51.51], [-0.1, 51.52]] },
  estimated_minutes: 30, distance_km: 5, difficulty: 2,
  speed_profile: [{ startIdx: 0, endIdx: 2, limitMph: 30 }],
  observation_zones: [{ lat: 51.51, lng: -0.1, radiusM: 60, kind: "roundabout" }],
  steps: [],
};
const sample = (lat: number, mph: number, t: number) => ({ lat, lng: -0.1, speedMps: mph / 2.23694, t });

beforeEach(() => useMockTest.getState().reset());

test("zone entered + tapped → no observation fault", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.5, 28, 0));        // outside zone
  s.onSample(sample(51.51, 28, 5000));    // inside zone
  expect(useMockTest.getState().activeZoneIdx).toBe(0);
  useMockTest.getState().tapMirrors();
  s.onSample(sample(51.52, 28, 10000));   // left zone
  const r = useMockTest.getState().finish(10000);
  expect(r.faults.filter((f) => f.kind === "observation")).toHaveLength(0);
  expect(r.passed).toBe(true);
});

test("zone entered + not tapped → minor observation fault", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.51, 28, 1000));
  s.onSample(sample(51.52, 28, 8000));
  const r = useMockTest.getState().finish(8000);
  expect(r.faults).toEqual([expect.objectContaining({ kind: "observation", severity: "minor" })]);
});

test("finish computes duration and phase", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.5, 28, 0));
  const r = useMockTest.getState().finish(90_000);
  expect(r.durationSeconds).toBe(90);
  expect(useMockTest.getState().phase).toBe("finished");
});

test("tapMirrors outside a zone is a no-op", () => {
  const s = useMockTest.getState();
  s.start(route, 0);
  s.onSample(sample(51.5, 28, 0));
  useMockTest.getState().tapMirrors();
  expect(useMockTest.getState().zoneOutcomes).toHaveLength(0);
});

test("addMark records the mark with its time and place", () => {
  const s = useMockTest.getState();
  s.reset();
  s.addMark("mirrors", "minor", { lat: 51.5, lng: -0.1 }, 1000);
  expect(useMockTest.getState().marks).toEqual([
    { category: "mirrors", level: "minor", t: 1000, at: { lat: 51.5, lng: -0.1 } },
  ]);
});

test("undoMark removes the last mark, and does nothing when there are none", () => {
  const s = useMockTest.getState();
  s.reset();
  expect(() => s.undoMark()).not.toThrow();
  s.addMark("mirrors", "minor", null, 1);
  s.addMark("speed", "major", null, 2);
  useMockTest.getState().undoMark();
  expect(useMockTest.getState().marks.map((m) => m.category)).toEqual(["mirrors"]);
});

test("examiner marks reach the result as faults and credits", () => {
  const s = useMockTest.getState();
  s.reset();
  s.start(route, 0);
  useMockTest.getState().addMark("mirrors", "minor", null, 1);
  useMockTest.getState().addMark("junctions", "major", null, 2);
  useMockTest.getState().addMark("control", "credit", null, 3);
  const r = useMockTest.getState().finish(60_000);
  expect(r.minors).toBeGreaterThanOrEqual(1);
  expect(r.majors).toBe(1);
  expect(r.credits).toBe(1);
  expect(r.passed).toBe(false); // one major fails, credit notwithstanding
  expect(r.tags).toContain("Use of mirrors");
});

test("reset clears marks", () => {
  const s = useMockTest.getState();
  s.reset();
  s.addMark("mirrors", "minor", null, 1);
  useMockTest.getState().reset();
  expect(useMockTest.getState().marks).toEqual([]);
});

test("repeated minors on one category surface as a warning", () => {
  const s = useMockTest.getState();
  s.reset();
  for (let i = 0; i < HABITUAL_MINOR_THRESHOLD; i++) {
    useMockTest.getState().addMark("mirrors", "minor", null, i);
  }
  expect(useMockTest.getState().warnings()).toEqual([
    { category: "mirrors", label: "Use of mirrors", count: HABITUAL_MINOR_THRESHOLD },
  ]);
});

test("a drive with no departures records none", () => {
  expect(useMockTest.getState().deviations).toEqual([]);
});

test("departures accumulate in the order they happened", () => {
  const { addDeviation } = useMockTest.getState();
  addDeviation({ atIdx: 40, lat: 51.7, lng: -0.3, skippedM: 380, seconds: 47 });
  addDeviation({ atIdx: 210, lat: 51.75, lng: -0.34, skippedM: 240, seconds: 22 });
  const d = useMockTest.getState().deviations;
  expect(d).toHaveLength(2);
  expect(d.map((x) => x.atIdx)).toEqual([40, 210]);
  expect(d[0].skippedM).toBe(380);
});

test("starting a new test clears the previous run's departures", () => {
  useMockTest.getState().addDeviation({ atIdx: 40, lat: 51.7, lng: -0.3, skippedM: 380, seconds: 47 });
  useMockTest.getState().start({ observation_zones: [], speed_profile: [] } as never);
  expect(useMockTest.getState().deviations).toEqual([]);
});

test("a departure is never scored as a fault", () => {
  const before = useMockTest.getState().marks.length;
  useMockTest.getState().addDeviation({ atIdx: 40, lat: 51.7, lng: -0.3, skippedM: 380, seconds: 47 });
  expect(useMockTest.getState().marks).toHaveLength(before);
});
