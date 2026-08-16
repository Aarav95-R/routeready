import { MIN_PASSWORD, passwordStrength } from "../passwordStrength";

test("nothing typed states the rule rather than judging it", () => {
  expect(passwordStrength("")).toEqual({ level: "empty", segments: 0, message: "At least 8 characters" });
});

// The boundary is the only number that gates anything, so it is asserted from
// both sides.
test("the floor is eight characters", () => {
  expect(MIN_PASSWORD).toBe(8);
  expect(passwordStrength("abcdefg").level).toBe("short");
  expect(passwordStrength("abcdefgh").level).toBe("weak");
});

test("a short password counts down rather than scolding", () => {
  expect(passwordStrength("abcde").message).toBe("3 more characters");
  expect(passwordStrength("abcdefg").message).toBe("1 more character");
});

// Four points, one for each thing worth having, each earned independently.
test("each point is earned on its own", () => {
  expect(passwordStrength("abcdefgh").segments).toBe(1);        // length only
  expect(passwordStrength("abcdefgH").segments).toBe(2);        // + mixed case
  expect(passwordStrength("abcdefg1").segments).toBe(2);        // + digit
  expect(passwordStrength("abcdefg!").segments).toBe(2);        // + symbol
  expect(passwordStrength("abcdefgH1").segments).toBe(3);       // case + digit
  expect(passwordStrength("abcdefghijkH1!").segments).toBe(4);  // all four
});

test("the levels follow the segments", () => {
  expect(passwordStrength("abcdefgh").level).toBe("weak");
  expect(passwordStrength("abcdefgH").level).toBe("fair");
  expect(passwordStrength("abcdefgH1").level).toBe("good");
  expect(passwordStrength("abcdefghijkH1!").level).toBe("strong");
});

// The documented reason the meter does not gate: the password everyone
// reaches for to beat a meter scores full marks and is on every breach list
// there is. A meter that blocks is a meter people defeat.
test("Password1! scores full marks, which is exactly why the bar is advisory", () => {
  expect(passwordStrength("Password1!").segments).toBe(4);
});

// A long passphrase is a good password and must not be told to add a symbol.
test("a long passphrase is not punished for having no symbol", () => {
  const s = passwordStrength("correct horse battery staple");
  expect(s.segments).toBeGreaterThanOrEqual(3);
  expect(s.level).not.toBe("weak");
});

test("only the levels below fair carry advice", () => {
  expect(passwordStrength("abcdefgh").message).toBe("Weak — add a capital or a number");
  expect(passwordStrength("abcdefgH").message).toBe("Fair");
  expect(passwordStrength("abcdefgH1").message).toBe("Good");
  expect(passwordStrength("abcdefghijkH1!").message).toBe("Strong");
});
