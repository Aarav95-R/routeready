import {
  canAdvance, EMPTY_ANSWERS, EXPERIENCE_OPTIONS, FOCUS_OPTIONS,
  MAX_FOCUS, TOTAL_STEPS, toggleFocus, toMetadata, type Answers,
} from "../onboarding";

const filled: Answers = {
  centreId: "c-1", booked: true, testDate: "2026-09-24",
  experience: "progressing", focus: ["roundabout"],
};

// The four options are exactly hazards.type. An option the data cannot sort
// by is a question that does nothing, and the first draft of this card had
// two of them.
test("the weak-spot options are exactly the hazard types the schema stores", () => {
  expect(FOCUS_OPTIONS.map((o) => o.id).slice().sort())
    .toEqual(["junction", "narrow", "roundabout", "zebra"]);
});

test("the flow is five cards and the experience card offers three", () => {
  expect(TOTAL_STEPS).toBe(5);
  expect(EXPERIENCE_OPTIONS).toHaveLength(3);
});

test("no card can be left until it has been answered", () => {
  expect(canAdvance(0, EMPTY_ANSWERS)).toBe(false);
  expect(canAdvance(0, { ...EMPTY_ANSWERS, centreId: "c-1" })).toBe(true);
  expect(canAdvance(2, EMPTY_ANSWERS)).toBe(false);
  expect(canAdvance(2, { ...EMPTY_ANSWERS, experience: "ready" })).toBe(true);
  expect(canAdvance(3, EMPTY_ANSWERS)).toBe(false);
  expect(canAdvance(3, { ...EMPTY_ANSWERS, focus: ["zebra"] })).toBe(true);
});

// "Booked" without a date is a half-answer: the countdown it exists to feed
// cannot be built from it.
test("saying the test is booked requires saying when", () => {
  expect(canAdvance(1, { ...EMPTY_ANSWERS, booked: true })).toBe(false);
  expect(canAdvance(1, { ...EMPTY_ANSWERS, booked: true, testDate: "2026-09-24" })).toBe(true);
  expect(canAdvance(1, { ...EMPTY_ANSWERS, booked: false })).toBe(true);
});

test("a third weak spot replaces the oldest rather than being refused", () => {
  expect(MAX_FOCUS).toBe(2);
  expect(toggleFocus([], "zebra")).toEqual(["zebra"]);
  expect(toggleFocus(["zebra"], "narrow")).toEqual(["zebra", "narrow"]);
  expect(toggleFocus(["zebra", "narrow"], "junction")).toEqual(["narrow", "junction"]);
});

test("tapping a chosen weak spot takes it off", () => {
  expect(toggleFocus(["zebra", "narrow"], "zebra")).toEqual(["narrow"]);
});

test("toggleFocus does not mutate what it was given", () => {
  const before: Answers["focus"] = ["zebra"];
  toggleFocus(before, "narrow");
  expect(before).toEqual(["zebra"]);
});

test("the metadata carries every answer under its stored name", () => {
  expect(toMetadata(filled, "Sumeet")).toEqual({
    full_name: "Sumeet",
    home_centre_id: "c-1",
    test_date: "2026-09-24",
    experience: "progressing",
    focus: ["roundabout"],
  });
});

// An account with no name is greeted by the hour instead. Writing "" would
// make it a name that happens to be empty, which reads differently to every
// consumer that checks for presence.
test("a blank name is omitted rather than stored empty", () => {
  expect(toMetadata(filled, "   ")).not.toHaveProperty("full_name");
});

test("not booked stores an explicit null, not a missing key", () => {
  const m = toMetadata({ ...filled, booked: false, testDate: null }, "Sumeet");
  expect(m).toHaveProperty("test_date", null);
});
