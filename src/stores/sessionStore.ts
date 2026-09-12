import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { CodeType } from "@/lib/otpCode";
import { supabase } from "@/lib/supabase";
import { authError, AUTH_FALLBACK, AUTH_TIMEOUT } from "@/lib/authError";
import { profileToWrite, type TestWindow } from "@/lib/onboarding";
import { appleCredential, CANCELLED, googleCredential } from "@/lib/socialAuth";
import { TIMED_OUT, withTimeout } from "@/lib/withTimeout";
import { clearOutbox, clearUserCache } from "@/services/cache";
import { forgetWelcome } from "@/services/welcome";
import { deleteAccountError } from "@/lib/deleteError";

/**
 * Every action that can fail returns a sentence written for the person, or
 * null. The mapping happens here rather than at each screen so that no screen
 * can leak a raw Supabase string by forgetting to ask for one — which is
 * exactly what both auth screens used to do.
 */

/** The two providers whose sheets `signInWithProvider` knows how to open. */
export type SocialProvider = "apple" | "google";

/**
 * A provider failure, turned into a sentence — and, in development, printed.
 *
 * The rule that nothing raw reaches a person is right and stays. But it left
 * the provider paths undebuggable in the one place they actually break: the
 * console setup. A misconfigured audience, a provider switched off, a client
 * ID missing from Supabase's allow list — every one of those arrives here as
 * an unfamiliar string, falls through to `AUTH_FALLBACK`, and reaches the
 * screen as "Something went wrong", which is exactly as much as the developer
 * gets too.
 *
 * So the sentence is unchanged and the raw message is printed alongside it,
 * under `__DEV__` only. It never ships, and it never reaches the screen.
 *
 * `stage` says which half failed, because the two have completely different
 * causes: "sheet" is the device and the provider SDK, "exchange" is Supabase's
 * view of the token, and knowing which halves the search.
 */
function providerFailure(provider: SocialProvider, stage: "sheet" | "exchange", raw: string | null): string {
  const sentence = authError(raw);
  if (__DEV__) {
    console.warn(
      `[auth] ${provider} sign-in failed at the ${stage} step.\n` +
      `  raw: ${raw ?? "(no message)"}\n` +
      `  shown: ${sentence}` +
      (sentence === AUTH_FALLBACK
        ? "\n  note: unrecognised message — no sentence is mapped to it in authError.ts"
        : ""),
    );
  }
  return sentence;
}

type SessionState = {
  session: Session | null;
  initialized: boolean;
  /**
   * Set the moment a recovery code is verified, cleared the moment the
   * password is changed (or the person signs out instead). While true, the
   * root layout redirects to `update-password` no matter where else `session`
   * would otherwise send it.
   */
  recovering: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<string | null>;
  signInWithProvider: (provider: SocialProvider, metadata?: Record<string, unknown>) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  verifyCode: (email: string, token: string, type: CodeType) => Promise<string | null>;
  resendCode: (email: string, type: CodeType) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  saveInterview: (metadata: Record<string, unknown>) => Promise<string | null>;
  setName: (name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<string | null>;
};

/**
 * How long the app waits for a stored session to be restored before opening
 * on the sign-in screen instead.
 *
 * This one is a launch budget rather than a network one. `initialized` gates
 * every pixel the app draws, so the cost of waiting is a person looking at a
 * blank screen wondering whether the app is broken — and eight seconds is
 * already longer than anyone gives it. It is affordable only because giving
 * up is not final: `init` registers its listener first, so a refresh that
 * lands late still carries whoever was bounced to sign-in into the app.
 */
export const SESSION_RESTORE_DEADLINE_MS = 8_000;

/**
 * How long sign-in waits for an answer before saying so.
 *
 * Generous where sign-out's grace is brisk, because the two are not the same
 * kind of wait. Sign-out is a courtesy call whose answer changes nothing the
 * person can see; sign-in is the thing they are actually waiting for, and
 * giving up early on a slow-but-working connection would refuse a sign-in
 * that was about to succeed. Fifteen seconds is far longer than a healthy
 * round trip — this project's own Auth service answers in under half a second
 * when it is well — and far shorter than the minute React Native spends
 * before it gives up on a service that has gone quiet.
 */
export const SIGN_IN_DEADLINE_MS = 15_000;

/**
 * The name the account gave us, or "".
 *
 * `user_metadata` is a free-form bag — Supabase will hand back whatever was
 * written to it, including nothing at all for every account created before the
 * sign-up form asked — so this narrows to a string rather than trusting it.
 */
export function selectFullName(s: SessionState): string {
  const value = (s.session?.user?.user_metadata as Record<string, unknown> | undefined)?.full_name;
  return typeof value === "string" ? value.trim() : "";
}

/** Every value `test_window` can legitimately hold, for narrowing what comes back out of it. */
const TEST_WINDOWS: readonly TestWindow[] = ["two_weeks", "this_month", "later", "not_booked"];

/**
 * The interview's answer to "when is your test", or null.
 *
 * Same reasoning as `selectFullName`: `user_metadata` is a free-form bag, and
 * an account created before this question existed has nothing under this key
 * at all. Narrowed against `TEST_WINDOWS` rather than just checked for
 * "is it a string" — a stale or hand-edited value that is a string but not one
 * of the four the interview can produce is exactly as absent as no value.
 */
export function selectTestWindow(s: SessionState): TestWindow | null {
  const value = (s.session?.user?.user_metadata as Record<string, unknown> | undefined)?.test_window;
  return TEST_WINDOWS.includes(value as TestWindow) ? (value as TestWindow) : null;
}

/**
 * The signed-in account's id, or "" while there is nobody.
 *
 * Returned as a string rather than `string | null` so that callers scoping
 * something by account — `services/welcome` is the first — cannot accidentally
 * key on the word "null" and hand one person's flag to everybody signed out.
 * "" is the one value those functions already treat as "no account".
 */
export function selectUserId(s: SessionState): string {
  return s.session?.user?.id ?? "";
}

/**
 * Whether this account still owes us the four sign-up questions.
 *
 * Keyed on the answers being absent rather than on how the account was made,
 * because the two cannot be told apart later and both owe the same thing: a
 * provider sign-in from the *sign-in* screen never passes card 5, and an
 * account created before the interview existed never saw it either.
 *
 * `home_centre_id` stands for all four. It is the one `toMetadata` always
 * writes — the other three can legitimately be null — so its absence is the
 * only reliable "this interview never happened". An explicit null counts as
 * absent, because that is what card 5 writes for somebody who reached it
 * without choosing a centre.
 *
 * False with no session, and `nextAuthRoute` checks that independently. Both,
 * because either one alone deciding to gate a signed-out person would make
 * the sign-in screen unreachable — a far worse bug than the one this prevents.
 */
export function selectNeedsInterview(s: SessionState): boolean {
  if (!s.session) return false;
  const metadata = s.session.user?.user_metadata as Record<string, unknown> | undefined;
  return !metadata?.home_centre_id;
}

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  initialized: false,
  recovering: false,
  /**
   * Open the app, with or without a session.
   *
   * `initialized` gates everything — app/_layout.tsx draws a bare coloured
   * View until it flips — so the one thing this function may never do is
   * leave it false. It used to do exactly that in two ways.
   * `getSession()` reaches the network whenever the stored access token has
   * expired, which is every launch more than an hour after the last one: with
   * no deadline, a quiet Auth service was a blank screen for as long as it
   * stayed quiet, and with no catch, a rejected refresh skipped the `set` and
   * left that screen blank permanently — force-quitting only ran it again.
   *
   * Hence the ordering. The listener goes on first because the restore is the
   * part that can hang, and a listener registered behind it would miss the
   * session that arrives while it does. Then the restore, on a deadline and
   * inside a try. Then `initialized`, unconditionally, on every path.
   */
  init: async () => {
    supabase.auth.onAuthStateChange((_event, session) => set({ session }));

    try {
      const restored = await withTimeout(
        Promise.resolve().then(() => supabase.auth.getSession()),
        SESSION_RESTORE_DEADLINE_MS,
      );
      if (restored !== TIMED_OUT) set({ session: restored.data.session });
    } catch {
      // Nothing to restore, so the sign-in screen is the honest answer. The
      // listener above still picks up a session that turns up late.
    }

    set({ initialized: true });
  },
  /**
   * Every way this call can fail now ends as a sentence, including the two
   * that used to end as nothing at all.
   *
   * `signInWithPassword` had no deadline, so a service that accepts the
   * connection and then goes quiet held the button on "Signing in…" for about
   * a minute — the same failure sign-out was given a grace period for, at the
   * other door. And a rejection escaped the store entirely, which is worse
   * than the hang: the screen clears its own `busy` on the line after the
   * await, so a throw past it leaves the spinner running for good.
   *
   * Started inside a `then` for the third case, matching `signOut` below: a
   * synchronous throw reaching for `.signInWithPassword()` on a stubbed
   * client never returns a promise for `withTimeout` to watch.
   *
   * A request that outlives the deadline is not cancelled — supabase-js takes
   * no abort signal — so a late answer can still open a session and land the
   * person inside the app a moment after being told to try again. That is the
   * benign direction to be wrong in, and the only one available.
   */
  signIn: async (email, password) => {
    const attempt = Promise.resolve().then(() => supabase.auth.signInWithPassword({ email, password }));

    let answer;
    try {
      answer = await withTimeout(attempt, SIGN_IN_DEADLINE_MS);
    } catch (thrown) {
      return authError(thrown instanceof Error ? thrown.message : null);
    }
    if (answer === TIMED_OUT) return AUTH_TIMEOUT;
    return answer.error ? authError(answer.error.message) : null;
  },
  /**
   * The interview's answers ride along in `user_metadata` rather than a
   * profiles table: they are five scalars that belong to the account, and a
   * table would need a row, a policy and a migration to hold them.
   *
   * They go on this call rather than being written afterwards because email
   * confirmation is on — `signUp()` returns no session, so there is no
   * signed-in user to write a profile to until the code is entered in a later
   * session. This is the only moment they can be saved in one round trip.
   */
  signUp: async (email, password, metadata = {}) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    return error ? authError(error.message) : null;
  },

  /**
   * Sign in with Apple or Google, in one action for both.
   *
   * The provider hands back an OpenID `id_token` on the device and
   * `signInWithIdToken` accepts it directly, so nothing here leaves the app.
   * That is the reason for this shape rather than `signInWithOAuth`, which
   * would leave for a hosted page and come back through a URL — the deleted
   * deep-link path, and `site_url` back on the critical path of signing in.
   *
   * **The deadline goes on the exchange, not on the sheet.** This is the one
   * thing that would be wrong if `signIn` above were copied wholesale.
   * `SIGN_IN_DEADLINE_MS` is a budget for a network round trip; the sheet is
   * not one. It is a person reading a consent screen, typing an Apple ID
   * password and waiting on a 2FA code from another device, and fifteen
   * seconds is an ordinary amount of time to spend there. A deadline over it
   * would cancel sign-ins that were about to succeed, at the moment the
   * person finished typing.
   *
   * Cancelling returns null — the same as success, and deliberately so. Both
   * mean "nothing to say to this person": success is reported by `session`
   * changing, which is what the root layout already watches, and a cancel
   * leaves the screen exactly as it was. Only a genuine failure gets a
   * sentence.
   */
  signInWithProvider: async (provider, metadata) => {
    const sheet = Promise.resolve().then(() => (provider === "apple" ? appleCredential() : googleCredential()));

    let credential;
    try {
      credential = await sheet;
    } catch (thrown) {
      return providerFailure(provider, "sheet", thrown instanceof Error ? thrown.message : null);
    }
    if (credential === CANCELLED) return null;

    // Started inside a `then` for the same reason `signIn` is: a synchronous
    // throw reaching for `.signInWithIdToken()` on a stubbed client never
    // returns a promise for `withTimeout` to watch.
    const exchange = Promise.resolve().then(() =>
      supabase.auth.signInWithIdToken({ provider, token: credential.idToken }),
    );

    let answer;
    try {
      answer = await withTimeout(exchange, SIGN_IN_DEADLINE_MS);
    } catch (thrown) {
      return providerFailure(provider, "exchange", thrown instanceof Error ? thrown.message : null);
    }
    if (answer === TIMED_OUT) return AUTH_TIMEOUT;
    if (answer.error) return providerFailure(provider, "exchange", answer.error.message);

    const session = answer.data.session;
    // Set from the result rather than left to the auth listener, matching
    // `verifyCode`: both fire in the real client, and waiting on the slower
    // shows a frame of the sign-in screen to somebody already through it.
    if (session) set({ session });

    /**
     * The interview, and the name, written on the way in.
     *
     * `signUp()` carries both in the call that makes the account. These
     * providers do not — they open a session first — so this is the second
     * round trip that puts them on it, and `profileToWrite` decides whether
     * there is anything worth sending.
     *
     * Apple is the reason it happens here rather than later: it returns the
     * person's name on the **first** consent for an app and never again, so
     * this is the only moment it can be saved.
     *
     * Every failure past this point is swallowed. They are signed in — the
     * session is set, and the root layout is already on its way to the tabs.
     * Failing the whole sign-in over a profile write would strand somebody on
     * the sign-in screen holding a valid session, and telling them to try
     * again would only send them back through a sheet that is going to work.
     */
    const profile = profileToWrite(
      metadata,
      credential.fullName,
      session?.user?.user_metadata as Record<string, unknown> | undefined,
    );
    if (profile) {
      try {
        await supabase.auth.updateUser({ data: profile });
        // Re-read rather than trusting the local copy, for the reason
        // `setName` does: the greeting on Home renders from `session`, so
        // that is the thing that has to change when the name does.
        const { data } = await supabase.auth.getSession();
        if (data.session) set({ session: data.session });
      } catch { /* they are in; the name can be set in Settings */ }
    }

    /**
     * Hand Apple's authorization code to the server, so that deleting this
     * account can later tell Apple about it.
     *
     * Nothing about signing in needs this — the session above is already open.
     * It is spent here because it is the only thing that can be traded for an
     * Apple refresh token, that token is the only thing App Store guideline
     * 5.1.1(v) can be satisfied with on deletion, and the code expires about
     * five minutes from now. There is no later.
     *
     * Swallowed on failure, on the same trade as the profile write above:
     * they are signed in, and the cost of losing this is a deletion months
     * from now that cannot notify Apple — not anything the person in front of
     * us can see, act on, or be usefully told about.
     */
    if (credential.authorizationCode) {
      try {
        await supabase.functions.invoke("link-apple", {
          body: { authorizationCode: credential.authorizationCode },
        });
      } catch { /* logged server-side; nothing here is worth failing sign-in for */ }
    }

    return null;
  },

  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return error ? authError(error.message) : null;
  },
  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return error ? authError(error.message) : null;
  },

  /**
   * The typed code, whichever flow it came from.
   *
   * All three open the same kind of session; only `recovery` changes what the
   * app does next, which is why that alone is branched on — the same split the
   * deep-link callback used to make on its `type` fragment.
   *
   * The session is set from the result rather than left to the auth listener.
   * Both fire in the real client, but the screen navigates on this store, and
   * waiting on the slower of the two shows a frame of the code screen to
   * somebody who has already got it right.
   *
   * Wrapped in `withTimeout` and a `try` for the same reason `signIn` above
   * is: `verifyOtp` had neither, and the verify screen clears its own `busy`
   * on the line after the await, so a hang or an escaped throw left the code
   * field looking exactly like an ignored keystroke, for good. Reuses
   * `SIGN_IN_DEADLINE_MS` rather than a code-specific budget — this is the
   * same Auth service, hit the same way, and the recorded 52-86s health-check
   * incident was about that service in general, not about sign-in in
   * particular.
   */
  verifyCode: async (email, token, type) => {
    const attempt = Promise.resolve().then(() => supabase.auth.verifyOtp({ email, token, type }));

    let answer;
    try {
      answer = await withTimeout(attempt, SIGN_IN_DEADLINE_MS);
    } catch (thrown) {
      return authError(thrown instanceof Error ? thrown.message : null);
    }
    if (answer === TIMED_OUT) return AUTH_TIMEOUT;
    if (answer.error) return authError(answer.error.message);
    // Guarded on an actual session rather than set unconditionally: the
    // deleted link-era code carried this same guard, because a token that
    // fails without an `error` — Supabase does not promise one is always set
    // — would otherwise flag `recovering` with no session under it, stranding
    // someone on update-password leavable only by signing out.
    if (answer.data.session) set({ session: answer.data.session, recovering: type === "recovery" });
    return null;
  },

  /**
   * Ask for another code.
   *
   * Three flows, three calls: `auth.resend` handles signup and nothing else we
   * use, so recovery and magic link are re-sent by calling the same function
   * that sent them the first time. `max_frequency` is 60s on the project, so a
   * refusal here is ordinary impatience rather than a fault — `authError`
   * already turns it into a sentence about waiting a minute.
   *
   * The three calls are chosen with a `switch` on `type` rather than
   * `if`/`else` so that a fourth member added to `CodeType` later fails this
   * file at compile time instead of silently falling into the signup branch —
   * the `never` assignment below is unreachable only while the switch is
   * exhaustive.
   *
   * Wrapped in `withTimeout` and a `try` for the same reason `verifyCode`
   * above is: none of these three calls had a deadline or a catch, and the
   * screen's own resend guard clears on the line after the await, so a hang
   * or an escaped throw here left "Send a new code" permanently unable to
   * fire again.
   */
  resendCode: async (email, type) => {
    const send = (): Promise<{ error: { message: string } | null }> => {
      switch (type) {
        case "recovery": return supabase.auth.resetPasswordForEmail(email);
        case "email": return supabase.auth.signInWithOtp({ email });
        case "signup": return supabase.auth.resend({ type: "signup", email });
        default: {
          const exhaustive: never = type;
          throw new Error(`Unhandled code type: ${exhaustive as string}`);
        }
      }
    };
    const attempt = Promise.resolve().then(send);

    let answer;
    try {
      answer = await withTimeout(attempt, SIGN_IN_DEADLINE_MS);
    } catch (thrown) {
      return authError(thrown instanceof Error ? thrown.message : null);
    }
    if (answer === TIMED_OUT) return AUTH_TIMEOUT;
    return answer.error ? authError(answer.error.message) : null;
  },

  // The one action available on the update-password screen. Left in place on
  // failure — a rejected password still leaves the person mid-recovery, and
  // the alternative (dropping the flag) would bounce them into the app on a
  // password that was never actually changed.
  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return authError(error.message);
    set({ recovering: false });
    return null;
  },
  /**
   * Write the interview's answers to an account that already exists.
   *
   * `signUp()` carries them in the call that makes the account, and
   * `signInWithProvider` writes them right after the session opens. This is
   * the third way in: an account that reached the app owing them, sent to the
   * interview screen by `nextAuthRoute`.
   *
   * The failure is reported rather than swallowed, which is the opposite of
   * what the social profile write does — and deliberately. There, the person
   * was already through the door and the write was a bonus. Here it is the
   * only thing that opens the gate, so a silent failure would bounce them
   * straight back to the interview they just finished with nothing said.
   *
   * The session is re-read rather than patched locally, for the same reason
   * `setName` re-reads: the gate is computed from `session`, so that is the
   * thing that has to change for it to open.
   */
  saveInterview: async (metadata) => {
    let answer;
    try {
      answer = await supabase.auth.updateUser({ data: metadata });
    } catch (thrown) {
      return authError(thrown instanceof Error ? thrown.message : null);
    }
    if (answer.error) return authError(answer.error.message);

    const { data } = await supabase.auth.getSession();
    if (data.session) set({ session: data.session });
    return null;
  },

  // Re-read the session rather than trusting the caller to have it: the
  // greeting on the home screen is rendered from `session`, so it has to be the
  // thing that changes when the name does.
  setName: async (name) => {
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    if (error) return authError(error.message);
    const { data } = await supabase.auth.getSession();
    set({ session: data.session });
    return null;
  },

  /**
   * The local session is cleared whatever the server says — or does not say.
   *
   * There are three ways the round-trip can fail: a rejected promise, an
   * `{ error }` result, and the one that caused the original bug — a service
   * that neither rejects nor resolves. React Native waits about a minute on a
   * request that is never answered, and because the local teardown sat
   * *behind* that await, the button produced nothing observable for that whole
   * minute. It read as broken because, from the outside, it was.
   *
   * The first answer to that was a four-second grace, which turned a minute of
   * nothing into four seconds of nothing. This is the real answer: the wait
   * was never necessary. Signing out is a local act, and none of what the
   * person is waiting for depends on the reply.
   *
   * So the server is told and not awaited. The revoke still goes out — the app
   * is very much alive afterwards, sitting on the sign-in screen, and dropping
   * it would leave the refresh token live until it expired, which on a shared
   * phone is the difference between signing out and appearing to. It simply
   * does not get to hold the door shut on somebody trying to leave.
   */
  signOut: async () => {
    // Started inside a `then` and finished with a `catch` so that all three of
    // its failures are spent here rather than escaping as an unhandled
    // rejection: a synchronous throw (reaching for `.signOut()` on a stubbed
    // client), a rejected promise, and never settling.
    void Promise.resolve()
      .then(() => supabase.auth.signOut())
      .catch(() => { /* the local teardown below is the part that matters */ });

    // A full disk is not a reason to stay signed in, so the sweep cannot
    // strand anyone either.
    try { await clearUserCache(); } catch { /* the session below is what matters */ }

    set({ session: null, recovering: false });
  },

  /**
   * Delete the account, for good.
   *
   * The order is server first, local second, and the reason is that the two
   * failures are not symmetrical. A failed call has destroyed nothing, so the
   * account must be left exactly as it was and the person left signed in to
   * it. A successful call has destroyed everything, so nothing after it may
   * throw its way out and strand somebody inside an account that no longer
   * exists — hence the swallowed teardown and the unconditional `set`.
   *
   * No account id is sent. The Edge Function reads whose account to delete
   * from the caller's token and from nowhere else; a body carrying an id is
   * how "delete my account" becomes "delete anyone's account". The id read
   * here is only ever used against this phone's own storage.
   *
   * Deliberately not queued when offline. Every other write in this app has an
   * outbox behind it; a deletion that fires later, from a screen nobody is
   * looking at, is not something anybody asked for.
   */
  deleteAccount: async () => {
    const userId = get().session?.user?.id ?? "";

    const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
    if (error) return deleteAccountError(error.message);

    // Past this line the account is gone and this is only tidying.
    for (const sweep of [clearUserCache, clearOutbox, () => forgetWelcome(userId)]) {
      try { await sweep(); } catch { /* a full disk is not a reason to stay signed in */ }
    }
    try { await supabase.auth.signOut(); } catch { /* the session below is the part that matters */ }
    set({ session: null });
    return null;
  },
}));
