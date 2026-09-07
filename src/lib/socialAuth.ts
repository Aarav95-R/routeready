import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

/**
 * The two provider sheets, reduced to the one thing Supabase needs from them.
 *
 * Both Apple and Google hand back an OpenID `id_token` on the device, which
 * `signInWithIdToken` accepts directly. That is why there is no browser here,
 * no redirect and no deep link: the alternative — `signInWithOAuth` — leaves
 * the app, lands on a hosted page and comes back through a URL, which is
 * exactly the path this project deleted, and it would put `site_url` back on
 * the critical path of signing in. Nothing in this file leaves the app.
 *
 * The two SDKs disagree about almost everything — one rejects on cancel and
 * the other resolves a tagged union, one hands over a name once in an app's
 * lifetime and the other every time — so this module exists to make them
 * answer the same question the same way, and to keep those SDK types out of
 * the store.
 */

/**
 * What backing out of a provider sheet resolves to.
 *
 * Deliberately not a rejection, and deliberately a symbol rather than `null`:
 * a caller cannot reach the credential without having handled this case
 * first. Cancelling is the most ordinary thing anybody does on these sheets,
 * and it must leave the screen exactly as it was rather than accusing them of
 * a failure. Same shape, and the same reasoning, as `TIMED_OUT`.
 */
export const CANCELLED = Symbol("cancelled");

/** A credential, once we know there is a token in it. */
export type SocialCredential = {
  idToken: string;
  /**
   * The provider's name for the person, or "".
   *
   * "" rather than null because the caller's question is "is there a name to
   * write", and both providers have their own way of saying no.
   */
  fullName: string;
  /**
   * Apple's single-use `authorizationCode`, when there is one. Absent for
   * Google, which has no equivalent and needs none.
   *
   * Nothing in the sign-in itself uses this — Supabase opens the session from
   * the `identityToken` alone. It is carried for exactly one reason: it is the
   * only thing that can be traded for an Apple refresh token, and a refresh
   * token is the only thing App Store guideline 5.1.1(v) can be satisfied
   * with when the account is later deleted. It expires about five minutes
   * from now, so the exchange cannot wait for deletion day.
   */
  authorizationCode?: string;
};

/**
 * Thrown when a sheet completes with nothing to sign in with.
 *
 * Matched as a substring by `authError`, so the words are load-bearing: see
 * `SOCIAL_NO_TOKEN` there.
 */
export const NO_TOKEN = "The provider returned no token";

/** Thrown when the build shipped without its Google client IDs. */
export const MISCONFIGURED = "Google sign-in is not configured in this build";

/**
 * Apple's cancel code, under both spellings.
 *
 * The SDK documents `ERR_REQUEST_CANCELED` (one L, the American spelling),
 * but the double-L form has shipped in Expo runtimes too. Recognising only
 * one of them would turn a changed mind into a red sentence on whichever
 * runtime spells it the other way, so both are named here rather than
 * discovered on somebody's phone.
 */
const APPLE_CANCEL_CODES = ["ERR_REQUEST_CANCELED", "ERR_REQUEST_CANCELLED"];

function codeOf(thrown: unknown): string {
  return typeof thrown === "object" && thrown !== null && "code" in thrown
    ? String((thrown as { code: unknown }).code)
    : "";
}

/**
 * Whether to draw the Apple button at all.
 *
 * Asks the SDK rather than checking `Platform.OS`, because the real condition
 * is broader than the platform — false on Android *and* on iOS below 13 — and
 * the module that implements it is the one that knows.
 *
 * Answers false when the check itself fails, because the two wrong answers
 * cost different amounts: a button withheld from a device that could have
 * shown one leaves email sign-in exactly where it was, while a button shown
 * on a device that cannot honour it is a dead tap with no explanation.
 */
export async function appleAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple.
 *
 * `fullName` is the subtle one. Apple returns it on the **first** consent for
 * an app and never again — every later sign-in carries `null` there, for the
 * same person, forever. So the moment it arrives is the only moment it can be
 * saved, and no amount of re-authenticating gets it back. That is why the
 * caller writes it immediately rather than reading it off the session later.
 */
export async function appleCredential(): Promise<SocialCredential | typeof CANCELLED> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (thrown) {
    if (APPLE_CANCEL_CODES.includes(codeOf(thrown))) return CANCELLED;
    throw thrown;
  }

  // The one failure that could pass for success: the sheet completed, nothing
  // threw, and there is nothing to sign in with. Supabase would answer this
  // with a message written for a log.
  if (!credential.identityToken) throw new Error(NO_TOKEN);

  const { givenName, familyName } = credential.fullName ?? {};
  return {
    idToken: credential.identityToken,
    fullName: [givenName, familyName].filter(Boolean).join(" "),
    // Spread rather than set to undefined, so a credential without a code has
    // no key at all — the caller's test is "is there a code worth sending",
    // and an explicit undefined would read as one until it was unwrapped.
    ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
  };
}

/**
 * Whether this build was given its Google credentials.
 *
 * The counterpart to `appleAvailable`, and gated for the same reason: a
 * button that cannot work should not be drawn. Here the condition is the
 * build rather than the device — `app.config.js` leaves the Google config
 * plugin out when the iOS client ID is absent, so such a build has no URL
 * scheme to receive the sheet's result and Google sign-in cannot work in it
 * at all.
 *
 * Synchronous, because `EXPO_PUBLIC_*` is inlined at build time — there is
 * nothing to wait for, and the answer cannot change while the app is running.
 */
export function googleConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
}

/**
 * Sign in with Google.
 *
 * Two client IDs, and both are needed for different reasons: the iOS one
 * opens the sheet, and the web one is the audience Google mints the token
 * for — it is what Supabase validates against. Configuring with only the
 * first produces a token Supabase rejects, at the far end, in a sentence
 * about audiences.
 *
 * Read from `process.env` at the call rather than at module scope. Expo
 * inlines `EXPO_PUBLIC_*` at build time either way, so nothing is lost, and
 * it means a build shipped without them fails with a sentence instead of at
 * import.
 *
 * `configure` is synchronous, idempotent and cheap, so it sits here rather
 * than in an init path somebody has to remember to call.
 *
 * Unlike Apple, cancelling resolves rather than rejects — `{ type:
 * "cancelled" }` — so the two are normalised to the same `CANCELLED` here.
 */
export async function googleCredential(): Promise<SocialCredential | typeof CANCELLED> {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!iosClientId || !webClientId) throw new Error(MISCONFIGURED);

  GoogleSignin.configure({ iosClientId, webClientId });

  const response = await GoogleSignin.signIn();
  if (response.type !== "success") return CANCELLED;

  if (!response.data.idToken) throw new Error(NO_TOKEN);
  if (__DEV__) reportAudience(response.data.idToken);
  return {
    idToken: response.data.idToken,
    fullName: response.data.user.name?.trim() ?? "",
  };
}

/**
 * Print which client ID Google actually minted the token for.
 *
 * This is the one fact that decides whether Supabase will accept it, and the
 * one fact nothing else in the system reveals. Supabase checks the token's
 * `aud` against its Authorized Client IDs list and, when they disagree,
 * answers with a message about audiences that names neither value — so the
 * failure tells you a rule was broken and not which two things differ.
 *
 * Whether `aud` is the iOS client or the web client depends on how Google's
 * SDK was configured, which is exactly why Supabase's list wants both. Printing
 * it turns "try adding client IDs until it works" into a comparison.
 *
 * Dev only, and only the audience — the token itself is a live credential and
 * is never logged.
 */
function reportAudience(idToken: string): void {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return;
    // atob wants standard base64; JWTs are base64url, and the padding is
    // stripped. React Native provides atob via the URL polyfill already loaded
    // for supabase-js.
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    console.warn(
      `[auth] Google minted this token for:\n` +
      `  aud: ${claims.aud}\n` +
      `  This exact value must appear in Supabase → Providers → Google →\n` +
      `  Authorized Client IDs, or the exchange is refused.`,
    );
  } catch {
    // A diagnostic that cannot itself break sign-in.
  }
}
