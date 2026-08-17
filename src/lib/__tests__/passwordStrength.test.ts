import { MIN_PASSWORD, passwordStrength } from "../passwordStrength";

test("nothing typed is not a criticism", () => {
  expect(passwordStrength("")).toMatchObject({ level: "empty", segments: 0, message: "" });
});

// The rule is stated before it is enforced. Today it is enforced after the
// tap, by being told off for submitting.
test("under the floor it counts down rather than scolding", () => {
  expect(passwordStrength("abcde")).toMatchObject({ level: "short", segments: 0 });
  expect(passwordStrength("abcde").message).toBe("3 more characters");
  expect(passwordStrength("abcdefg").message).toBe("1 more character");
});

test("the floor is eight characters", () => {
  expect(MIN_PASSWORD).toBe(8);
  expect(passwordStrength("abcdefg").level).toBe("short");
  expect(passwordStrength("abcdefgh").level).toBe("weak");
});

// A point for every four characters past eight, up to three, plus one each
// for mixed case, a digit and a symbol.
test.each([
  ["abcdefgh", "weak"],
  ["abcdefghijkl", "weak"],
  ["abcdefghijklmnop", "fair"],
  ["abcdefghijklmnopqrst", "good"],
])("length alone earns %s → %s", (password, level) => {
  expect(passwordStrength(password).level).toBe(level);
});

/**
 * Each contribution is checked at the weak/fair boundary rather than on its
 * own, because the weak band deliberately covers both nought and one point —
 * one improvement to a bad password does not make it a decent one, and a bar
 * that jumps on the first capital says otherwise.
 *
 * Every pair below is worth exactly two points, so each entry proves its own
 * attribute is counted: drop any one of them and the pair falls back to weak.
 */
test.each([
  ["mixed case, with a digit", "abcdefgH1"],
  ["a digit, with a symbol", "abcdefg1!"],
  ["a symbol, with mixed case", "abcdefgH!"],
  ["length, with mixed case", "abcdefghijklH"],
])("%s reaches fair — so both halves are counted", (_name, password) => {
  expect(passwordStrength(password).level).toBe("fair");
});

test("one improvement to a bad password does not make it a decent one", () => {
  expect(passwordStrength("abcdefgH").level).toBe("weak");
  expect(passwordStrength("abcdefg1").level).toBe("weak");
});

test("segments track the level, so the bar and the label never disagree", () => {
  expect(passwordStrength("abcdefgh").segments).toBe(1);
  expect(passwordStrength("abcdefghijklmnop").segments).toBe(2);
  expect(passwordStrength("abcdefghijklmnopqrst").segments).toBe(3);
  expect(passwordStrength("Tr0ub4dor&3Xk!").segments).toBe(4);
});

/**
 * The documented reason the meter advises rather than gates.
 *
 * A meter that refuses to let you continue is a meter people defeat, and what
 * they defeat it with is exactly this: a password on every breach list there
 * is, scoring near the top of any rule simple enough to run on a keystroke.
 * Only the eight-character floor is allowed to disable the button.
 */
test("Password1! scores well, which is the argument against gating on the meter", () => {
  expect(passwordStrength("Password1!").level).toBe("good");
});

// The other half of the same argument: length is worth more than decoration,
// so a passphrase someone can actually remember is not punished for having no
// punctuation in it.
test("a long lowercase passphrase reaches good with no symbol at all", () => {
  const passphrase = "correcthorsebatterystaplecorrecthorse";
  expect(passphrase).not.toMatch(/[^a-z]/);
  expect(passwordStrength(passphrase).level).toBe("good");
});

test("every level above the floor carries a label", () => {
  for (const p of ["abcdefgh", "abcdefghijklmnop", "Password1!", "Tr0ub4dor&3Xk!"]) {
    expect(passwordStrength(p).message).not.toBe("");
  }
});
