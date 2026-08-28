import { CODE_LENGTH, isComplete, normaliseCode } from "../otpCode";

test("it keeps a plain six-digit code as it is", () => {
  expect(normaliseCode("418302")).toBe("418302");
});

// Mail clients and the artifact both show the code grouped for reading. What
// gets pasted is therefore rarely six bare digits, and a field that rejects
// what it told the person to copy is the worst kind of small bug.
test.each([
  ["a space in the middle", "418 302"],
  ["a hyphen in the middle", "418-302"],
  ["leading and trailing space", "  418302 "],
  ["a non-breaking space", "418 302"],
])("it strips %s", (_label, raw) => {
  expect(normaliseCode(raw)).toBe("418302");
});

test("it drops letters rather than holding a code that can never verify", () => {
  expect(normaliseCode("4a1b8c3d0e2f")).toBe("418302");
});

// A paste of a longer string must not silently fill the field with the wrong
// six characters — taking the first six is the only reading that matches what
// the boxes show.
test("it caps at the code length", () => {
  expect(normaliseCode("4183021234")).toBe("418302");
  expect(normaliseCode("418302").length).toBe(CODE_LENGTH);
});

test("nothing usable normalises to nothing", () => {
  expect(normaliseCode("")).toBe("");
  expect(normaliseCode("no digits here")).toBe("");
});

test("only a full-length code counts as complete", () => {
  expect(isComplete("418302")).toBe(true);
  expect(isComplete("41830")).toBe(false);
  expect(isComplete("")).toBe(false);
});
