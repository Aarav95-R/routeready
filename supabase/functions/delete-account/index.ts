// Deletes the calling user's account, and nothing else.
//
// This is the project's only server-side code, and it exists for one reason:
// deleting an `auth.users` row needs the service-role key, and the service-role
// key must never be inside an app bundle. Supabase injects it into an Edge
// Function's environment, so it lives here and only here.
//
// The account being deleted is read from the caller's JWT and from nowhere
// else. There is deliberately no user id in the request body — accepting one
// would turn "delete my account" into "delete anyone's account" for anybody who
// could reach this URL with any valid token.
//
// Everything else follows from that one delete. `auth.identities`,
// `auth.sessions` and `auth.refresh_tokens` cascade off `auth.users.id`, and so
// do `user_progress`, `favourites` and `apple_credentials` (see
// supabase/schema.sql). The sign-up interview answers live in `user_metadata`
// on the row itself. There is no table to sweep by hand.
//
// One thing has to happen *before* the delete, though: telling Apple.
//
// App Store guideline 5.1.1(v) requires an app offering Sign in with Apple and
// account deletion to revoke the person's Apple tokens as part of deleting,
// and reviewers test it. The token to revoke was captured at sign-in by the
// `link-apple` function — the native sign-in flow never produces one on its
// own — and it has to be revoked while its row still exists, because the
// delete below takes that row with it.
//
// Runs under the platform's own JWT check (`verify_jwt` defaults to true), so
// an unauthenticated request never reaches this code. The check below is not
// redundant with it: the platform proves the token is valid, this reads *whose*
// it is.
//
// Deploy:  npx supabase functions deploy delete-account

import { createClient } from "jsr:@supabase/supabase-js@2";
import { appleConfig, revokeToken } from "../_shared/apple.ts";

/**
 * The app is React Native, where none of this applies. It is here because
 * app.config.js also configures a web target, and a browser build would fail
 * the preflight with no clue as to why.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { error: "Not signed in." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Both are injected by the platform. If either is missing the deployment is
  // broken, and saying so beats a stack trace about undefined.
  if (!url || !serviceRoleKey) {
    return json(500, { error: "Server is misconfigured." });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The whole authorisation model, in one call: whoever this token belongs to
  // is the only account this request can delete.
  const { data, error } = await admin.auth.getUser(authorization.replace("Bearer ", ""));
  if (error || !data.user) return json(401, { error: "Not signed in." });

  /**
   * Tell Apple first, delete second.
   *
   * The ordering is forced: `apple_credentials.user_id` cascades off
   * `auth.users.id`, so once the delete below runs there is no token left to
   * revoke and no way to find out there ever was one.
   *
   * Every failure here is swallowed, and that is a deliberate trade rather
   * than laziness. A person who has asked to delete their account must not be
   * held inside it because Apple's service is down, because the .p8 was
   * rotated, or because they signed in with Google and there is nothing to
   * revoke at all. The guideline asks that we make the call; it does not ask
   * that we refuse to delete anyone when the call fails. Anything that goes
   * wrong is logged, where it can be read without being shown to somebody
   * halfway out of the door.
   *
   * Nothing here logs the token itself.
   */
  const config = appleConfig();
  if (config) {
    try {
      const { data: credential } = await admin
        .from("apple_credentials")
        .select("refresh_token")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (credential?.refresh_token) {
        const revoked = await revokeToken(config, credential.refresh_token);
        if (!revoked) console.error("apple revoke returned false", { userId: data.user.id });
      }
    } catch (thrown) {
      console.error("apple revoke threw", {
        userId: data.user.id,
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    // Logged rather than returned verbatim. The client turns any failure into
    // one sentence a learner can act on; the detail belongs in the function
    // logs, where it can be read without being shown to a stranger.
    console.error("deleteUser failed", { userId: data.user.id, message: deleteError.message });
    return json(500, { error: "The account could not be deleted." });
  }

  return json(200, { deleted: true });
});
