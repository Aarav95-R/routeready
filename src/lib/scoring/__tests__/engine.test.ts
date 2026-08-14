import { aggregate, detectObservationFaults, detectSpeedingFaults, limitAt } from "../engine";
import type { GpsSample } from "../engine";

// straight north line, single 30 mph segment across all vertices
const coords = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));
const profile30 = [{ startIdx: 0, endIdx: 10, limitMph: 30 as const }];
const at = (i: number, speedMph: number, t: number): GpsSample =>
  ({ lat: 51.5 + i * 0.001, lng: -0.1, speedMps: speedMph / 2.23694, t });

test("limitAt matches segment, defaults to 30", () => {
  expect(limitAt(coords, profile30, { lat: 51.505, lng: -0.1 })).toBe(30);
  expect(limitAt(coords, [], { lat: 51.505, lng: -0.1 })).toBe(30);
});

test("brief speeding = minor, sustained = major", () => {
  const brief = [at(0, 28, 0), at(1, 38, 1000), at(2, 38, 3000), at(3, 28, 4000)];
  expect(detectSpeedingFaults(brief, coords, profile30)).toEqual([
    expect.objectContaining({ kind: "speeding", severity: "minor", tag: "Speeding" }),
  ]);
  const sustained = [at(0, 38, 0), at(1, 38, 2000), at(2, 38, 4000), at(3, 38, 6000), at(4, 28, 7000)];
  expect(detectSpeedingFaults(sustained, coords, profile30)).toEqual([
    expect.objectContaining({ severity: "major" }),
  ]);
});

test("threshold is limit ×1.1 + 2: 35 mph in a 30 is legal, 35.1 is not", () => {
  expect(detectSpeedingFaults([at(0, 35, 0), at(1, 35, 1000)], coords, profile30)).toHaveLength(0);
  expect(detectSpeedingFaults([at(0, 35.2, 0), at(1, 35.2, 1000), at(2, 28, 2000)], coords, profile30)).toHaveLength(1);
});

test("observation misses tagged by zone kind", () => {
  const faults = detectObservationFaults([
    { zone: { lat: 0, lng: 0, radiusM: 60, kind: "roundabout" }, tapped: false },
    { zone: { lat: 0, lng: 0, radiusM: 60, kind: "junction" }, tapped: true },
  ]);
  expect(faults).toEqual([expect.objectContaining({ severity: "minor", tag: "Roundabout observations" })]);
});

test("aggregate applies DVSA rule: 16 minors fail, any major fails", () => {
  const minor = { kind: "speeding" as const, severity: "minor" as const, detail: "", tag: "Speeding" };
  const major = { ...minor, severity: "major" as const };
  expect(aggregate(Array(15).fill(minor), 100).passed).toBe(true);
  expect(aggregate(Array(16).fill(minor), 100).passed).toBe(false);
  expect(aggregate([major], 100).passed).toBe(false);
  const r = aggregate([minor, minor, major], 1234);
  expect(r).toMatchObject({ minors: 2, majors: 1, score: 50, durationSeconds: 1234 });
  expect(r.tags).toEqual(["Speeding"]);
});

const mkMinor = { kind: "speeding" as const, severity: "minor" as const, detail: "", tag: "Speeding" };
const mkMajor = { ...mkMinor, severity: "major" as const };

test("credits lift a passing score but are capped at ten", () => {
  expect(aggregate([], 60, 0).score).toBe(100);
  expect(aggregate([mkMinor, mkMinor], 60, 4).score).toBe(94); // 100 - 10 + 4
  expect(aggregate([mkMinor, mkMinor], 60, 40).score).toBe(100); // 100 - 10 + 10, clamped by the 100 ceiling
  expect(aggregate([mkMinor, mkMinor, mkMinor, mkMinor], 60, 40).score).toBe(90); // 100 - 20 + 10
});

test("credits never change the verdict", () => {
  expect(aggregate([mkMajor], 60, 10).passed).toBe(false);
  const sixteen = Array.from({ length: 16 }, () => mkMinor);
  expect(aggregate(sixteen, 60, 10).passed).toBe(false);
});

test("a failed test can never show a pass-looking score", () => {
  // One major, no other faults, ten credits: 100 - 40 + 10 = 70 before the cap.
  expect(aggregate([mkMajor], 60, 10).score).toBe(55);
  const sixteen = Array.from({ length: 16 }, () => mkMinor);
  expect(aggregate(sixteen, 60, 10).score).toBeLessThanOrEqual(55);
});

test("credits default to zero so existing callers are unaffected", () => {
  expect(aggregate([mkMinor], 60).score).toBe(95);
  expect(aggregate([mkMinor], 60).credits).toBe(0);
});

// The home screen says "marked in 4 of your 5 mock tests". That is only true
// because a fault marked three times in one drive reaches user_progress once
// — faultCounts counts every entry in `mistakes` it is handed, so the dedupe
// has to happen here, on the way in.
test("a fault marked repeatedly in one drive is tagged once", () => {
  const speeding = {
    kind: "speeding" as const, severity: "minor" as const,
    detail: "Over the 30 mph limit for 3 s", tag: "Speeding",
  };
  const result = aggregate([speeding, speeding, speeding], 2400);

  expect(result.tags).toEqual(["Speeding"]);
  // The faults themselves are not collapsed — three of them still cost 15.
  expect(result.minors).toBe(3);
  expect(result.score).toBe(85);
});
