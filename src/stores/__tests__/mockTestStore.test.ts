import { useMockTest } from "../mockTestStore";
import type { Route } from "@/types/db";

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
