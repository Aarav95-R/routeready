import { deriveInstructions, nextInstruction, TRIGGER_DISTANCE_M } from "../instructions";

// straight north, then 90° right turn east at idx 2
const elbow = [
  { lat: 51.5, lng: -0.1 }, { lat: 51.51, lng: -0.1 }, { lat: 51.52, lng: -0.1 },
  { lat: 51.52, lng: -0.09 }, { lat: 51.52, lng: -0.08 },
];

test("deriveInstructions emits right turn and end-of-route", () => {
  const ins = deriveInstructions(elbow);
  expect(ins[0]).toMatchObject({ idx: 2, text: "In 200 yards, turn right" });
  expect(ins[ins.length - 1].text).toMatch(/end of the route/);
});

test("nextInstruction fires within trigger distance, once", () => {
  const ins = deriveInstructions(elbow);
  const spoken = new Set<number>();
  const near = { lat: 51.5185, lng: -0.1 }; // ~165 m south of the turn
  const far = { lat: 51.51, lng: -0.1 };    // > TRIGGER_DISTANCE_M
  expect(nextInstruction(far, ins, spoken)).toBeNull();
  const fired = nextInstruction(near, ins, spoken);
  expect(fired?.idx).toBe(2);
  spoken.add(fired!.idx);
  expect(nextInstruction(near, ins, spoken)).toBeNull(); // not re-fired
});

test("TRIGGER_DISTANCE_M is about 200 yards", () => {
  expect(TRIGGER_DISTANCE_M).toBeGreaterThan(175);
  expect(TRIGGER_DISTANCE_M).toBeLessThan(190);
});
