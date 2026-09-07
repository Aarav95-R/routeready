// Turns the device's Apple `authorizationCode` into a stored refresh token.
//
// This exists only so that `delete-account` has something to revoke. App Store
// guideline 5.1.1(v) requires an app offering Sign in with Apple *and* account
// deletion to revoke the person's tokens on the way out, and the native
// sign-in flow never produces a token to revoke: the device hands Supabase an
// `identityToken`, Supabase issues its own session, and no authorization-code
// exchange takes place.
//
// The code that could buy a refresh token is single-use and lives about five
// minutes, so the exchange cannot wait until deletion day. It happens here, at
// sign-in, and the result is parked in `apple_credentials` — a table with RLS
// on and no policies, reachable only by the service role.
//
// Whose row it writes is read from the caller's JWT and from nowhere else, for
// the same reason `delete-account` reads it that way: a user id in the body
// would let anyone with a valid token park a credential against somebody
// else's account.
//
// Deploy:  npx supabase functions deploy link-apple

import { createClient } from "jsr:@supabase/supabase-js@2";
import { appleConfig, exchangeCode } from "../_shared/apple.ts";

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
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Not signed in." });

  const body = await req.json().catch(() => null);
  const code = body?.authorizationCode;
  if (typeof code !== "string" || !code) return json(400, { error: "No authorization code." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(500, { error: "Server is misconfigured." });

  const config = appleConfig();
  // 200, not an error. A project that has not been given the Apple secrets yet
  // is a project where revocation cannot work — but the person signing in has
  // done nothing wrong and their sign-in has already succeeded, so this reports
  // what happened rather than handing the app a failure to render.
  if (!config) return json(200, { linked: false, reason: "apple-not-configured" });

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(authorization.replace("Bearer ", ""));
  if (error || !data.user) return json(401, { error: "Not signed in." });

  const refreshToken = await exchangeCode(config, code);
  if (!refreshToken) return json(200, { linked: false, reason: "exchange-failed" });

  // Upserted rather than inserted: signing in again on a new device produces a
  // fresh code and a fresh refresh token for the same account, and the newest
  // is the one worth keeping.
  const { error: writeError } = await admin
    .from("apple_credentials")
    .upsert({ user_id: data.user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });

  if (writeError) {
    // The message, not the token. Nothing in this function may log the
    // credential it is handling.
    console.error("apple_credentials upsert failed", { userId: data.user.id, message: writeError.message });
    return json(200, { linked: false, reason: "store-failed" });
  }

  return json(200, { linked: true });
});
