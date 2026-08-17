/**
 * The monogram an account actually deserves: its name when it has one, and the
 * address it signed up with when it does not.
 *
 * A typed name is the better source by a distance — "Sumeet Raheja" gives the
 * SR that `sumeetraheja@` can only guess at — so it wins whenever it is there.
 */
export function initialsFor(name: string, email: string): string {
  return initialsFromName(name) || initialsFromEmail(email);
}

/** "Sumeet Raheja" -> "SR". A single word gives a single letter. */
export function initialsFromName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => (/^[a-z]/i.test(word) ? word[0].toUpperCase() : ""))
    .join("");
}

/**
 * The monogram for an account, taken from the only thing an email sign-up
 * gives us: the address itself.
 *
 * The rule is deliberately timid. `sumeet.raheja@` is a name in two parts and
 * reads as "SR"; `sumeetraheja@` is one word, so it gives one letter rather
 * than the invented "SU". A plus-tag is an address label rather than a name,
 * and an address with no letters at the front of it gives nothing at all —
 * the avatar shows a person icon instead of a monogram made of punctuation.
 */
export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0].split("+")[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (/^[a-z]/i.test(part) ? part[0].toUpperCase() : ""))
    .join("");
}
