import {
  ENTER_MS, ENTER_STAGGER_MS, ENTER_TRAVEL, STEP_TRAVEL,
  enterAfter, enterFrom, popIn, stepBack, stepForward,
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
  ["stepForward", stepForward()],
  ["stepBack", stepBack()],
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

const translateX = (builder: { initialValues?: unknown }) =>
  (builder.initialValues as { transform?: { translateX: number }[] }).transform?.[0].translateX;

/**
 * The mirror is the whole point. If both directions entered from the same
 * side, the flow would feel one-way whichever control was pressed, and Back
 * would read as another step forward.
 */
test("a card advances in from the trailing edge and returns from the leading one", () => {
  expect(translateX(stepForward())).toBe(STEP_TRAVEL);
  expect(translateX(stepBack())).toBe(-STEP_TRAVEL);
});

test("a whole card travels further than one row of a list", () => {
  expect(STEP_TRAVEL).toBeGreaterThan(ENTER_TRAVEL);
});

// A card is one thing arriving, not a list arriving in order, so neither
// direction is staggered.
test("neither step transition is delayed", () => {
  expect(stepForward().delayV).toBeFalsy();
  expect(stepBack().delayV).toBeFalsy();
});
