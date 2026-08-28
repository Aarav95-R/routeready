/**
 * What `routeready://auth-callback#access_token=…&refresh_token=…&type=…`
 * carries, or null when the opened URL is not one of these links at all —
 * including every other deep link the app has (a shared route, for instance),
 * which reach the same listener in `app/_layout.tsx`.
 *
 * `type` is Supabase's own field and is not narrowed to a union here: it adds
 * values (`email_change`, `invite`, …) without announcing it, and a union that
 * silently stops matching a new one is worse than a plain string the caller
 * switches on defensively.
 */
export type AuthCallback = {
  access_token: string;
  refresh_token: string;
  type: string | null;
};

export function parseAuthCallback(url: string): AuthCallback | null {
  const fragment = url.split("#")[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, type: params.get("type") };
}
