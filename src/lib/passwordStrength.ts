/**
 * How good a password is, as a function of the string and nothing else.
 *
 * Eight characters is the floor Supabase enforces and the only thing that
 * gates the button. Everything above it is advice, deliberately: a meter that
 * refuses to let you continue is a meter people defeat, and what they defeat
 * it with is `Password1!` — which scores four segments here and is on every
 * breach list there is. The bar informs; it does not police. There is a test
 * asserting exactly that, so the behaviour cannot be tightened by accident.
 *
 * The four points are independent, which is what keeps a long passphrase from
 * being told to add a symbol.
 */

export type Level = "empty" | "short" | "weak" | "fair" | "good" | "strong";
export type Strength = { level: Level; segments: 0 | 1 | 2 | 3 | 4; message: string };

export const MIN_PASSWORD = 8;

type Scored = Exclude<Level, "empty" | "short">;

/**
 * Clearing the floor is itself the first segment, which is why this is
 * `1 + points` rather than `points`.
 *
 * The alternative — scoring from zero and flooring the bar at one segment —
 * makes the first point invisible: the meter says "add a capital", you add
 * one, and nothing moves. A meter that does not respond to the thing it just
 * asked for is worse than no meter.
 */
const LEVEL_FOR: Record<1 | 2 | 3 | 4, Scored> = {
  1: "weak", 2: "fair", 3: "good", 4: "strong",
};

const MESSAGE: Record<Scored, string> = {
  weak: "Weak — add a capital or a number",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

export function passwordStrength(password: string): Strength {
  if (password.length === 0) {
    return { level: "empty", segments: 0, message: `At least ${MIN_PASSWORD} characters` };
  }

  if (password.length < MIN_PASSWORD) {
    const left = MIN_PASSWORD - password.length;
    return { level: "short", segments: 0, message: `${left} more character${left === 1 ? "" : "s"}` };
  }

  let points = 0;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;

  const segments = Math.min(4, 1 + points) as 1 | 2 | 3 | 4;
  const level = LEVEL_FOR[segments];
  return { level, segments, message: MESSAGE[level] };
}
