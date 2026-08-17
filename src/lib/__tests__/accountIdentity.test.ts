import { initialsFromEmail } from "../accountIdentity";

test("a two-part local address gives two initials", () => {
  expect(initialsFromEmail("sumeet.raheja@yahoo.com")).toBe("SR");
  expect(initialsFromEmail("ann_smith@example.co.uk")).toBe("AS");
  expect(initialsFromEmail("ann-smith@example.co.uk")).toBe("AS");
});

// One letter, not a made-up pair: "SU" would look like a surname the account
// never gave us.
test("a single-word local address gives one initial", () => {
  expect(initialsFromEmail("sumeetraheja@yahoo.com")).toBe("S");
});

test("a plus-tag is an address label, not a name", () => {
  expect(initialsFromEmail("sumeet+dvsa@yahoo.com")).toBe("S");
});

test("only the first two parts are used", () => {
  expect(initialsFromEmail("ann.marie.smith@example.com")).toBe("AM");
});

// The avatar falls back to an icon on an empty string, so these must not
// return punctuation or digits that would render as a nonsense monogram.
test("an address with no letters to take gives nothing", () => {
  expect(initialsFromEmail("123456@example.com")).toBe("");
  expect(initialsFromEmail("")).toBe("");
  expect(initialsFromEmail("@example.com")).toBe("");
});
