import { deriveDifficulty, derivePassHistory, deriveSpeedProfile, detectTurnPoints } from "../derive";

// L-shaped path: sharp 90° right turn at vertex 2
const elbow = [
  { lat: 51.5, lng: -0.1 }, { lat: 51.51, lng: -0.1 }, { lat: 51.52, lng: -0.1 },
  { lat: 51.52, lng: -0.09 }, { lat: 51.52, lng: -0.08 },
];

test("detectTurnPoints finds the elbow", () => {
  const turns = detectTurnPoints(elbow, 45);
  expect(turns).toHaveLength(1);
  expect(turns[0].idx).toBe(2);
  expect(Math.abs(turns[0].angle)).toBeGreaterThan(80);
});

test("deriveDifficulty scales with turns and distance", () => {
  expect(deriveDifficulty(4, 2)).toBe(1);
  expect(deriveDifficulty(6, 8)).toBeGreaterThanOrEqual(2);
  expect(deriveDifficulty(9, 20)).toBe(5);
});

test("deriveSpeedProfile groups contiguous bands", () => {
  const profile = deriveSpeedProfile([12, 12.5, 12, 25, 26, 25.5]); // 30-band ×3 then 60-band ×3
  expect(profile).toEqual([
    { startIdx: 0, endIdx: 2, limitMph: 30 },
    { startIdx: 3, endIdx: 5, limitMph: 60 },
  ]);
});

test("derivePassHistory is deterministic, 8 entries, near pass_rate", () => {
  const h1 = derivePassHistory(45, 3);
  expect(h1).toHaveLength(8);
  expect(h1).toEqual(derivePassHistory(45, 3));
  h1.forEach((v) => { expect(v).toBeGreaterThan(35); expect(v).toBeLessThan(55); });
});
