/**
 * Where `app/_layout.tsx` should send someone after `session`, `recovering`
 * or the current route changes — or null to leave them exactly where they
 * are. Pulled out as a pure function because the branches interact in ways
 * that are easy to get half right by eye: `update-password` looks like an
 * ordinary member of the `(auth)` group (fine to sit on with no session,
 * like sign-in or reset) but isn't — it is only ever a legitimate place to
 * be while `recovering` is true, and the instant that stops being so, it has
 * to actively send the person on rather than being read as "already home".
 */
export type AuthRouteState = {
  session: unknown;
  recovering: boolean;
  /**
   * Whether this account still owes us the four sign-up questions.
   *
   * Required rather than optional on purpose. Signing in with Apple or Google
   * from the *sign-in* screen makes an account without ever passing card 5, so
   * the gate below is the only thing standing between those accounts and an
   * app with nothing to personalise. A defaulted field would let a new call
   * site quietly opt out of it, and the failure — everybody skipping the
   * interview — is invisible until somebody looks at the data.
   */
  needsInterview: boolean;
  segments: readonly (string | undefined)[];
};

type AuthRoute = "/(auth)/update-password" | "/(auth)/interview" | "/(tabs)" | "/(auth)/sign-in";

export function nextAuthRoute({ session, recovering, needsInterview, segments }: AuthRouteState): AuthRoute | null {
  const inAuth = segments[0] === "(auth)";
  const onUpdatePassword = inAuth && segments[1] === "update-password";
  const onInterview = inAuth && segments[1] === "interview";

  if (recovering) {
    return onUpdatePassword ? null : "/(auth)/update-password";
  }

  if (onUpdatePassword) return session ? "/(tabs)" : "/(auth)/sign-in";

  /**
   * The interview gate, above the general rules and below recovery.
   *
   * Below recovery because the two can genuinely overlap — `recovering` is
   * only ever true with a session — and asking somebody locked out of their
   * account to describe their driving test before they may set a new password
   * would be absurd.
   *
   * Gated on `session` because there is nobody to write answers for without
   * one; without that check, sign-in itself would be unreachable.
   *
   * Sign-up is excluded because it asks these same four questions on its own
   * cards. Firing here would yank somebody out of the flow that was already
   * collecting the answers.
   */
  const onSignUp = inAuth && segments[1] === "sign-up";
  if (session && needsInterview && !onSignUp) return onInterview ? null : "/(auth)/interview";

  // The same trap `update-password` sets. The interview lives under (auth), so
  // once the answers land the "already inAuth" rule below would read it as a
  // resting state and nobody would ever leave the screen.
  if (onInterview) return session ? "/(tabs)" : "/(auth)/sign-in";

  if (!session && !inAuth) return "/(auth)/sign-in";
  if (session && inAuth) return "/(tabs)";
  return null;
}
