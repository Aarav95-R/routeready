/**
 * How good a password is, scored from the string and nothing else.
 *
 * Pure on purpose: no React, no Supabase, no network. It runs on every
 * keystroke of the account card, and it is the one part of sign-up whose
 * behaviour can be pinned down completely without rendering anything.
 *
 * **The meter advises; it does not police.** Only the eight-character floor
 * is allowed to disable the button. A meter that refuses to let you continue
 * is a meter people defeat, and what they defeat it with is `Password1!` —
 * which scores near the top of any rule cheap enough to run on a keystroke and
 * is on every breach list there is. Everything above the floor is advice.
 */

export type Level = "empty" | "short" | "weak" | "fair" | "good" | "strong";

export type Strength = {
  level: Level;
  /** Filled segments of four. Tracks the level so the bar and label agree. */
  segments: 0 | 1 | 2 | 3 | 4;
  /** What the label says. "" only when nothing has been typed. */
  message: string;
};

/** Supabase's own minimum is six. Eight is ours, and it is stated before it is enforced. */
export const MIN_PASSWORD = 8;

const LABELS: Record<Exclude<Level, "empty" | "short">, string> = {
  weak: "Weak — a little longer would help",
  fair: "Fair password",
  good: "Good password",
  strong: "Strong password",
};

/**
 * Length is weighted above decoration — a point for every four characters
 * past the floor, up to three — because it is what actually costs an attacker
 * anything. Scoring it the other way is what teaches people to write
 * `Password1!` instead of something they could remember.
 */
function points(password: string): number {
  const forLength = [12, 16, 20].filter((n) => password.length >= n).length;
  const forVariety =
    Number(/[a-z]/.test(password) && /[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^a-zA-Z0-9]/.test(password));
  return forLength + forVariety;
}

export function passwordStrength(password: string): Strength {
  if (password.length === 0) return { level: "empty", segments: 0, message: "" };

  if (password.length < MIN_PASSWORD) {
    const missing = MIN_PASSWORD - password.length;
    return {
      level: "short",
      segments: 0,
      message: `${missing} more character${missing === 1 ? "" : "s"}`,
    };
  }

  const level: Exclude<Level, "empty" | "short"> =
    points(password) >= 4 ? "strong" : points(password) === 3 ? "good" : points(password) === 2 ? "fair" : "weak";
  const segments = ({ weak: 1, fair: 2, good: 3, strong: 4 } as const)[level];

  return { level, segments, message: LABELS[level] };
}
