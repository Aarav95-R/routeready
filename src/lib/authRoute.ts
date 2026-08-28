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
  segments: readonly (string | undefined)[];
};

type AuthRoute = "/(auth)/update-password" | "/(tabs)" | "/(auth)/sign-in";

export function nextAuthRoute({ session, recovering, segments }: AuthRouteState): AuthRoute | null {
  const onUpdatePassword = segments[0] === "(auth)" && segments[1] === "update-password";

  if (recovering) {
    return onUpdatePassword ? null : "/(auth)/update-password";
  }

  // `auth-callback` (app/auth-callback.tsx) is a landing pad, not a screen —
  // every emailed link passes through it for a moment while the tokens in the
  // URL fragment are applied. Treated exactly like update-password once
  // recovery is no longer in play: send the person on based on whether that
  // application actually produced a session.
  if (onUpdatePassword || segments[0] === "auth-callback") return session ? "/(tabs)" : "/(auth)/sign-in";

  const inAuth = segments[0] === "(auth)";
  if (!session && !inAuth) return "/(auth)/sign-in";
  if (session && inAuth) return "/(tabs)";
  return null;
}
