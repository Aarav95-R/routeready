import { advance, ADVANCE_RADIUS_M, formatDistance, remainingM } from "../navigation";
import type { NavStep } from "@/types/db";

const mk = (lat: number, lng: number, instruction: string, distanceM = 100): NavStep =>
  ({ lat, lng, instruction, road: "", type: "turn", modifier: "", distanceM });

// three maneuvers spaced ~1.1km apart heading north
const steps: NavStep[] = [
  mk(51.50, -0.1, "Head off", 1112),
  mk(51.51, -0.1, "Turn right", 1112),
  mk(51.52, -0.1, "You have reached the end of the route", 0),
];

test("formatDistance rounds sensibly", () => {
  expect(formatDistance(12)).toBe("now");
  expect(formatDistance(184)).toBe("180 m");
  expect(formatDistance(950)).toBe("950 m");
  expect(formatDistance(1500)).toBe("1.5 km");
  expect(formatDistance(2340)).toBe("2.3 km");
});

test("advance keeps the current maneuver until you reach it", () => {
  // near start, heading toward step 1 (the turn)
  const s = advance(steps, { lat: 51.505, lng: -0.1 }, 1);
  expect(s.index).toBe(1);
  expect(s.distanceToManeuverM).toBeGreaterThan(400);
  expect(s.arrived).toBe(false);
});

test("advance moves to the next maneuver once within the radius", () => {
  // essentially on top of step 1's maneuver
  const s = advance(steps, { lat: 51.51, lng: -0.1 }, 1);
  expect(s.index).toBe(2);
});

test("advance never goes backwards", () => {
  const s = advance(steps, { lat: 51.50, lng: -0.1 }, 2);
  expect(s.index).toBe(2);
});

test("arrived is true at the final step within radius", () => {
  const s = advance(steps, { lat: 51.52, lng: -0.1 }, 2);
  expect(s.arrived).toBe(true);
});

test("ADVANCE_RADIUS_M is a small on-street threshold", () => {
  expect(ADVANCE_RADIUS_M).toBeGreaterThan(10);
  expect(ADVANCE_RADIUS_M).toBeLessThan(60);
});

test("remainingM sums the current leg plus the rest", () => {
  // ~550 m short of step 1, plus step 1's 1112 m leg to the end
  const r = remainingM(steps, { lat: 51.505, lng: -0.1 }, 1);
  expect(r).toBeGreaterThan(1500);
  expect(r).toBeLessThan(1800);
});
