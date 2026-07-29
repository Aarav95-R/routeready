import { bandSpeedMph, bearingDeg, cumulativeM, haversineM, isInZone, mpsToMph, nearestVertex, turnAngleDeg } from "../geo";

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
