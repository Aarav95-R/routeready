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

test("brief speeding = minor, sustained = serious", () => {
  const brief = [at(0, 28, 0), at(1, 38, 1000), at(2, 38, 3000), at(3, 28, 4000)];
  expect(detectSpeedingFaults(brief, coords, profile30)).toEqual([
    expect.objectContaining({ kind: "speeding", severity: "minor", tag: "Speeding" }),
  ]);
  const sustained = [at(0, 38, 0), at(1, 38, 2000), at(2, 38, 4000), at(3, 38, 6000), at(4, 28, 7000)];
  expect(detectSpeedingFaults(sustained, coords, profile30)).toEqual([
    expect.objectContaining({ severity: "serious" }),
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

test("aggregate applies DVSA rule: 16 minors fail, any serious fails", () => {
  const minor = { kind: "speeding" as const, severity: "minor" as const, detail: "", tag: "Speeding" };
  const serious = { ...minor, severity: "serious" as const };
  expect(aggregate(Array(15).fill(minor), 100).passed).toBe(true);
  expect(aggregate(Array(16).fill(minor), 100).passed).toBe(false);
  expect(aggregate([serious], 100).passed).toBe(false);
  const r = aggregate([minor, minor, serious], 1234);
  expect(r).toMatchObject({ minors: 2, serious: 1, score: 50, durationSeconds: 1234 });
  expect(r.tags).toEqual(["Speeding"]);
});
