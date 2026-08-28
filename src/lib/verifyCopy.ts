import type { CodeType } from "@/lib/otpCode";

/**
 * What the one verify screen says, per flow.
 *
 * Separated from the screen because it is the part that differs and the part
 * worth reading in one place: three flows share every pixel and disagree only
 * about six sentences, and inlining them would bury that in JSX conditionals.
 *
 * Words only — the per-flow badge glyph lives in the screen instead. Typing an
 * icon name properly costs `keyof typeof Ionicons.glyphMap`, and importing a
 * vector-icon package into `src/lib` to get it would put a UI dependency in the
 * one directory that has none: `authRoute`, `authError` and `otpCode` are all
 * dependency-free, and that is what makes them trivially testable.
 */
type Copy = {
  title: string;
  subtitle: (email: string) => string;
};

const COPY: Record<CodeType, Copy> = {
  signup: {
    title: "Check your email",
    subtitle: (email) => `We've sent a six-digit code to ${email}. Enter it to activate your account.`,
  },
  recovery: {
    title: "Enter your code",
    subtitle: (email) => `We've sent a six-digit code to ${email}. Enter it, then you can set a new password.`,
  },
  email: {
    title: "Sign in with your code",
    subtitle: (email) => `We've sent a six-digit code to ${email}. Enter it and you're in.`,
  },
};

export function verifyCopy(type: CodeType): Copy {
  return COPY[type] ?? COPY.signup;
}
