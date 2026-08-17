import { render, screen } from "@testing-library/react-native";
import { ScoreSparkline, sparkPoints } from "../ScoreSparkline";

const at = (score: number) => ({ score, at: null });

test("points are evenly spaced across the width, oldest at the left", () => {
  const pts = sparkPoints([10, 20, 30], 100, 50);
  expect(pts).toHaveLength(3);
  expect(pts[0].x).toBeLessThan(pts[1].x);
  expect(pts[1].x).toBeLessThan(pts[2].x);
  expect(pts[1].x - pts[0].x).toBeCloseTo(pts[2].x - pts[1].x, 5);
});

// Screen coordinates grow downward, so the best score must sit highest.
test("a higher score is drawn higher", () => {
  const [low, high] = sparkPoints([40, 80], 100, 50);
  expect(high.y).toBeLessThan(low.y);
});

test("the band is fitted to the scores, not to zero", () => {
  const tight = sparkPoints([70, 72], 100, 50);
  // Two points four apart on a zero-based axis would be nearly touching; fitted
  // to their own band they use the full height.
  expect(Math.abs(tight[0].y - tight[1].y)).toBeGreaterThan(20);
});

test("marks stay inside the box", () => {
  for (const p of sparkPoints([0, 50, 100], 120, 60)) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(120);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(60);
  }
});

// Every score identical is a real run, and (score - lo) / span would divide by
// zero on it.
test("a flat run sits on the middle rather than dividing by zero", () => {
  const pts = sparkPoints([60, 60, 60], 100, 50);
  for (const p of pts) {
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.y).toBeCloseTo(25, 5);
  }
});

test("one attempt is centred rather than pinned to the left edge", () => {
  const [only] = sparkPoints([64], 100, 50);
  expect(only.x).toBeCloseTo(50, 5);
});

test("no attempts draws nothing at all", () => {
  expect(sparkPoints([], 100, 50)).toEqual([]);
  render(<ScoreSparkline attempts={[]} width={100} />);
  expect(screen.getByTestId("spark-empty")).toBeTruthy();
  expect(screen.queryByTestId("spark")).toBeNull();
});

test("the latest attempt is marked apart from the rest", () => {
  render(<ScoreSparkline attempts={[at(48), at(62), at(78)]} width={200} />);
  expect(screen.getByTestId("spark")).toBeTruthy();
  expect(screen.getByTestId("spark-latest")).toBeTruthy();
});
