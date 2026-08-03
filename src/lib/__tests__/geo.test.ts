import { bandSpeedMph, bearingDeg, cumulativeM, haversineM, isInZone, mpsToMph, nearestVertex, turnAngleDeg, projectOnSegment, snapToPath, smoothHeading } from "../geo";

const london = { lat: 51.5074, lng: -0.1278 };
const birmingham = { lat: 52.4862, lng: -1.8904 };

test("haversineM London-Birmingham ≈ 163 km", () => {
  expect(haversineM(london, birmingham)).toBeGreaterThan(160_000);
  expect(haversineM(london, birmingham)).toBeLessThan(166_000);
});

test("bearingDeg due north is ~0, due east is ~90", () => {
  expect(bearingDeg(london, { ...london, lat: london.lat + 0.01 })).toBeCloseTo(0, 0);
  expect(bearingDeg(london, { ...london, lng: london.lng + 0.01 })).toBeCloseTo(90, 0);
});

test("turnAngleDeg wraps correctly", () => {
  expect(turnAngleDeg(350, 10)).toBe(20);   // right across north
  expect(turnAngleDeg(10, 350)).toBe(-20);  // left across north
  expect(turnAngleDeg(90, 180)).toBe(90);
});

test("cumulativeM starts at 0 and increases", () => {
  const c = cumulativeM([london, { ...london, lat: london.lat + 0.01 }, { ...london, lat: london.lat + 0.02 }]);
  expect(c[0]).toBe(0);
  expect(c[1]).toBeCloseTo(1112, -1);
  expect(c[2]).toBeCloseTo(2224, -1);
});

test("nearestVertex finds closest point", () => {
  const line = [london, { lat: 51.52, lng: -0.1278 }, { lat: 51.53, lng: -0.1278 }];
  const r = nearestVertex(line, { lat: 51.5205, lng: -0.128 });
  expect(r.idx).toBe(1);
  expect(r.distM).toBeLessThan(100);
});

test("isInZone respects radius", () => {
  expect(isInZone(london, { ...london, radiusM: 50 })).toBe(true);
  expect(isInZone(birmingham, { ...london, radiusM: 50 })).toBe(false);
});

test("speed conversions and banding", () => {
  expect(mpsToMph(13.4112)).toBeCloseTo(30, 1);
  expect(bandSpeedMph(8)).toBe(20);    // 17.9 mph → 20 band
  expect(bandSpeedMph(12.5)).toBe(30); // 28 mph → 30
  expect(bandSpeedMph(16)).toBe(40);   // 35.8 mph → 40
  expect(bandSpeedMph(24)).toBe(60);   // 53.7 mph → 60
  expect(bandSpeedMph(31)).toBe(70);   // 69.3 mph → 70
});

// A due-east segment at lat 51.5. 0.001 deg of latitude is ~111 m.
const segA = { lat: 51.5, lng: -0.1 };
const segB = { lat: 51.5, lng: -0.09 };

test("projectOnSegment drops a perpendicular onto the segment", () => {
  const r = projectOnSegment(segA, segB, { lat: 51.501, lng: -0.095 });
  expect(r.t).toBeCloseTo(0.5, 2);
  expect(r.point.lat).toBeCloseTo(51.5, 5);
  expect(r.point.lng).toBeCloseTo(-0.095, 5);
  expect(r.distM).toBeCloseTo(111, 0);
});

test("projectOnSegment clamps past either end", () => {
  const past = projectOnSegment(segA, segB, { lat: 51.5, lng: -0.08 });
  expect(past.t).toBe(1);
  expect(past.point.lng).toBeCloseTo(-0.09, 6);

  const before = projectOnSegment(segA, segB, { lat: 51.5, lng: -0.11 });
  expect(before.t).toBe(0);
  expect(before.point.lng).toBeCloseTo(-0.1, 6);
});

test("projectOnSegment handles a zero-length segment", () => {
  const r = projectOnSegment(segA, segA, { lat: 51.501, lng: -0.1 });
  expect(r.t).toBe(0);
  expect(r.distM).toBeCloseTo(111, 0);
});

// A loop: 11 vertices north up lng -0.1, then 11 back south up lng -0.1002
// (~14 m to the east). This is the shape of the seeded test-centre routes.
const OUT = Array.from({ length: 11 }, (_, i) => ({ lat: 51.5 + i * 0.001, lng: -0.1 }));
const BACK = Array.from({ length: 11 }, (_, i) => ({ lat: 51.51 - i * 0.001, lng: -0.1002 }));
const loop = [...OUT, ...BACK];

// Sitting on the outbound leg but physically nearer the return leg.
const driver = { lat: 51.5055, lng: -0.10015 };

test("snapToPath stays on the outbound leg inside the window", () => {
  const s = snapToPath(loop, driver, 5, 3)!;
  expect(s.idx).toBe(5);
  expect(s.distM).toBeCloseTo(10.4, 0);
  expect(s.bearing).toBeCloseTo(0, 0); // due north
  expect(s.point.lng).toBeCloseTo(-0.1, 5);
});

test("snapToPath without a window jumps onto the return leg", () => {
  // Proves the window is what prevents cross-snapping on loop routes.
  const s = snapToPath(loop, driver, 5, 100)!;
  expect(s.idx).toBeGreaterThan(10);
  expect(s.bearing).toBeCloseTo(180, 0);
});

test("snapToPath returns null for a path with no segments", () => {
  expect(snapToPath([], driver, 0)).toBeNull();
  expect(snapToPath([segA], driver, 0)).toBeNull();
});

test("smoothHeading eases toward the target", () => {
  expect(smoothHeading(0, 90, 0.15)).toBeCloseTo(13.5, 3);
  expect(smoothHeading(90, 90, 0.15)).toBeCloseTo(90, 3);
});

test("smoothHeading takes the short way across north", () => {
  // 355 -> 5 must move forward through 0, not backward through 180.
  expect(smoothHeading(355, 5, 0.5)).toBeCloseTo(0, 3);
  expect(smoothHeading(5, 355, 0.5)).toBeCloseTo(0, 3);
  expect(smoothHeading(350, 10, 0.25)).toBeCloseTo(355, 3);
});

import { iconRotationDeg } from "../geo";

test("iconRotationDeg is zero when the phone points down the road", () => {
  expect(iconRotationDeg(0, 0)).toBe(0);
  expect(iconRotationDeg(217, 217)).toBe(0);
});

test("iconRotationDeg measures the phone against the rotated map", () => {
  // Map is heading-up along 100 deg; phone points 190 deg, i.e. 90 to its right.
  expect(iconRotationDeg(100, 190)).toBe(90);
  expect(iconRotationDeg(100, 10)).toBe(-90);
});

test("iconRotationDeg takes the short way across north", () => {
  expect(iconRotationDeg(350, 10)).toBe(20);
  expect(iconRotationDeg(10, 350)).toBe(-20);
});

test("iconRotationDeg stays within a half turn either way", () => {
  for (const [map, compass] of [[0, 0], [0, 179], [0, 181], [359, 1], [90, 271]]) {
    const r = iconRotationDeg(map, compass);
    expect(r).toBeGreaterThanOrEqual(-180);
    expect(r).toBeLessThanOrEqual(180);
  }
});
