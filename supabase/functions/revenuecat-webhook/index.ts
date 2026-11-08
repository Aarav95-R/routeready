// Writes the entitlements row, and is the only thing that may.
//
// The app never writes its own entitlement — an app that could would be an app
// that can grant itself a subscription. This runs under the service role, which
// bypasses RLS, which is exactly why the authorisation check below is the whole
// security of the paywall rather than a formality.
//
// Runs with verify_jwt = false (see supabase/config.toml). It has to: RevenueCat
// sends its own configured Authorization header, not a Supabase JWT. That is
// precisely why the shared-secret comparison is not optional — without it this
// is a public URL that grants subscriptions.
//
// Deploy:  npx supabase functions deploy revenuecat-webhook
//          npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<generated>

import { createClient } from "jsr:@supabase/supabase-js@2";
import { accessFor } from "./access.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

/**
 * Compared in constant time so the endpoint does not leak the secret one byte
 * at a time to anybody willing to measure how long it takes to say no.
 *
 * The length check first is not a leak worth caring about — the length of a
 * secret is not the secret — and it is what lets the loop below be a fixed
 * number of comparisons.
 */
function secretMatches(given: string): boolean {
  if (SECRET.length === 0 || given.length !== SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < SECRET.length; i++) diff |= given.charCodeAt(i) ^ SECRET.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!secretMatches(req.headers.get("Authorization") ?? "")) {
    return new Response("unauthorized", { status: 401, headers: CORS });
  }

  let event: Record<string, unknown>;
  try {
    const body = await req.json();
    event = (body.event ?? {}) as Record<string, unknown>;
  } catch {
    return new Response("bad request", { status: 400, headers: CORS });
  }

  const type = String(event.type ?? "");
  const userId = String(event.app_user_id ?? "");
  const status = accessFor(event);

  // 200 rather than 4xx for everything understood-but-ignored. A non-200 makes
  // RevenueCat retry, and retrying an event we have decided to drop just means
  // dropping it repeatedly. TRANSFER and TEST land here.
  if (!status) return new Response("ignored", { status: 200, headers: CORS });

  // A row keyed on nonsense is worse than no row: it is invisible and it never
  // matches anybody. This fires if Purchases.logIn was never called with the
  // Supabase id, which is the one wiring mistake this whole design can make.
  if (!UUID.test(userId)) {
    console.error(`[revenuecat] app_user_id is not a uuid: ${userId} (event ${type})`);
    return new Response("ignored", { status: 200, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const eventAt = new Date(Number(event.event_timestamp_ms ?? Date.now()));

  /**
   * Webhooks arrive out of order, and the damage is asymmetric: a late
   * EXPIRATION landing after a fresh RENEWAL would cancel a subscription that
   * is very much alive, and the person would have no way to tell us.
   *
   * So the row's own `updated_at` is the clock. An event older than what is
   * already recorded is dropped, and dropping a stale one costs nothing — the
   * newer event it lost a race to already said everything true.
   */
  const { data: existing } = await supabase
    .from("entitlements").select("updated_at").eq("user_id", userId).maybeSingle();

  if (existing && new Date(existing.updated_at) > eventAt) {
    console.log(`[revenuecat] dropping stale ${type} for ${userId}`);
    return new Response("stale", { status: 200, headers: CORS });
  }

  const { error } = await supabase.from("entitlements").upsert({
    user_id: userId,
    status,
    product: (event.product_id as string | null) ?? null,
    renews_at: event.expiration_at_ms ? new Date(Number(event.expiration_at_ms)).toISOString() : null,
    updated_at: eventAt.toISOString(),
  }, { onConflict: "user_id" });

  if (error) {
    // 500 so RevenueCat retries — this one is worth retrying, because the event
    // was valid and the write is what failed.
    console.error(`[revenuecat] upsert failed for ${userId}: ${error.message}`);
    return new Response("write failed", { status: 500, headers: CORS });
  }

  return new Response("ok", { status: 200, headers: CORS });
});
