// Talking to Apple's identity service from the server.
//
// Two calls are needed and both are guarded by the same thing: Apple does not
// take an API key, it takes a **client secret that you mint yourself** — a JWT
// signed with an ES256 private key downloaded from the developer portal. That
// signing is most of this file.
//
// Required environment (set with `npx supabase secrets set …`):
//
//   APPLE_TEAM_ID      10 characters, top right of the developer portal
//   APPLE_KEY_ID       10 characters, shown when the key is created
//   APPLE_CLIENT_ID    the bundle identifier, com.sumeetraheja.routeready
//   APPLE_PRIVATE_KEY  the whole .p8 file, BEGIN/END lines included
//
// The .p8 is downloadable exactly once, when it is created. Losing it means
// making a new key, not recovering the old one.

const APPLE = "https://appleid.apple.com";

export type AppleConfig = {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
};

/**
 * The four secrets, or null if the deployment has not been given them.
 *
 * Null rather than a throw, because the callers want to carry on without Apple
 * rather than fail: a project that has not finished the Apple setup should
 * still be able to delete an account.
 */
export function appleConfig(): AppleConfig | null {
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const keyId = Deno.env.get("APPLE_KEY_ID");
  const clientId = Deno.env.get("APPLE_CLIENT_ID");
  const privateKey = Deno.env.get("APPLE_PRIVATE_KEY");
  if (!teamId || !keyId || !clientId || !privateKey) return null;
  return { teamId, keyId, clientId, privateKey };
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

/**
 * Turn the .p8's PEM text into a key Web Crypto will sign with.
 *
 * The header, footer and every newline come out, the rest is base64 DER, and
 * the result is imported as PKCS#8. `\n` is unescaped first because secrets set
 * through a shell or a dashboard field routinely arrive with literal
 * backslash-n rather than real newlines, and the base64 decode below is
 * indifferent to which — but only once they are stripped consistently.
 */
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * The client secret Apple wants in place of an API key.
 *
 * Apple allows up to six months of life; this asks for an hour. The token is
 * minted per request and used immediately, so a long expiry would buy nothing
 * and would matter more if it ever leaked.
 *
 * Web Crypto's ECDSA signatures come out as the raw r‖s pair, which is exactly
 * what JWS ES256 specifies — no DER unwrapping needed, which is the step this
 * would otherwise get wrong.
 */
export async function clientSecret(config: AppleConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = {
    iss: config.teamId,
    iat: now,
    exp: now + 3600,
    aud: APPLE,
    sub: config.clientId,
  };

  const signingInput = `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(payload))}`;
  const key = await importKey(config.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

/**
 * Trade the device's `authorizationCode` for a refresh token.
 *
 * The code is single-use and expires in about five minutes, so this has to
 * happen at sign-in rather than being deferred to the day somebody deletes
 * their account — which is the whole reason `apple_credentials` exists.
 *
 * No `redirect_uri` is sent: there was no redirect. The code came from the
 * native sheet on the device, and Apple only requires that field for the web
 * flow.
 *
 * Returns null on any refusal rather than throwing. The caller is a sign-in
 * that has already succeeded, and none of this is worth failing it over.
 */
export async function exchangeCode(config: AppleConfig, code: string): Promise<string | null> {
  const response = await fetch(`${APPLE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await clientSecret(config),
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    console.error("apple token exchange failed", { status: response.status, body: await response.text() });
    return null;
  }

  const body = await response.json().catch(() => null);
  const token = body?.refresh_token;
  return typeof token === "string" && token ? token : null;
}

/**
 * Revoke a refresh token, which signs the person out of the app at Apple's end
 * and is what guideline 5.1.1(v) actually asks for.
 *
 * Apple answers 200 with an empty body on success. A token that was already
 * revoked also comes back 200, so this is safe to call twice.
 */
export async function revokeToken(config: AppleConfig, refreshToken: string): Promise<boolean> {
  const response = await fetch(`${APPLE}/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await clientSecret(config),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
  });

  if (!response.ok) {
    console.error("apple revoke failed", { status: response.status, body: await response.text() });
    return false;
  }
  return true;
}
