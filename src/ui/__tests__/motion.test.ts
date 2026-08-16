import {
  ENTER_MS, ENTER_STAGGER_MS, ENTER_TRAVEL, STEP_EXIT_MS, STEP_TRAVEL,
  enterAfter, enterFrom, popIn, stepBack, stepExit, stepForward,
} from "../motion";

// The numbers are the spec, so they are asserted rather than left to drift.
test("entrances are brisk enough never to sit in front of a tap", () => {
  expect(ENTER_MS).toBe(280);
  expect(ENTER_STAGGER_MS).toBe(45);
  expect(ENTER_TRAVEL).toBe(10);
});

test("each item in a list starts one stagger after the one above it", () => {
  expect(enterFrom(0).delayV).toBe(0);
  expect(enterFrom(1).delayV).toBe(ENTER_STAGGER_MS);
  expect(enterFrom(4).delayV).toBe(4 * ENTER_STAGGER_MS);
});

// The whole point of this module: no builder may carry spring config, because
// a spring is what overshoots, and an overshoot is what wobbles.
test.each([
  ["enterFrom", enterFrom(2)],
  ["enterAfter", enterAfter(350)],
  ["popIn", popIn(150)],
])("%s is a timing curve with no spring in it", (_name, builder) => {
  const b = builder as unknown as Record<string, unknown>;
  expect(b.durationV).toBeDefined();
  expect(b.easingV).toBeDefined();
  expect(b.dampingV).toBeUndefined();
  expect(b.stiffnessV).toBeUndefined();
  expect(b.dampingRatioV).toBeUndefined();
  expect(b.type).not.toBe("spring");
});

test("an explicit delay is honoured as given", () => {
  expect(enterAfter(450).delayV).toBe(450);
  expect(popIn(150).delayV).toBe(150);
});

test("entering items travel a short distance, since they do not bounce back", () => {
  const initial = enterFrom(0).initialValues as { transform?: { translateY: number }[] };
  expect(initial.transform?.[0].translateY).toBe(ENTER_TRAVEL);
});

test("a card leaves faster than the next one arrives", () => {
  expect(STEP_EXIT_MS).toBe(180);
  expect(STEP_TRAVEL).toBe(14);
  expect(STEP_EXIT_MS).toBeLessThan(ENTER_MS);
});

// Back must read as back. Same distance, opposite sign — if both directions
// entered from the same edge, the flow would feel one-way whichever button
// you pressed.
test("forward and back enter from opposite edges", () => {
  const fwd = stepForward().initialValues as { transform?: { translateX: number }[] };
  const back = stepBack().initialValues as { transform?: { translateX: number }[] };
  expect(fwd.transform?.[0].translateX).toBe(STEP_TRAVEL);
  expect(back.transform?.[0].translateX).toBe(-STEP_TRAVEL);
});

test.each([
  ["stepForward", stepForward()],
  ["stepBack", stepBack()],
  ["stepExit forward", stepExit(false)],
  ["stepExit back", stepExit(true)],
])("%s is a timing curve with no spring in it", (_name, builder) => {
  const b = builder as unknown as Record<string, unknown>;
  expect(b.durationV).toBeDefined();
  expect(b.easingV).toBeDefined();
  expect(b.dampingV).toBeUndefined();
  expect(b.stiffnessV).toBeUndefined();
  expect(b.type).not.toBe("spring");
});

test("an exiting card takes the exit duration", () => {
  expect((stepExit(false) as unknown as Record<string, unknown>).durationV).toBe(STEP_EXIT_MS);
});
