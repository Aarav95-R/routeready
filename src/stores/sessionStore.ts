import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { authError } from "@/lib/authError";
import { clearOutbox, clearUserCache } from "@/services/cache";
import { forgetWelcome } from "@/services/welcome";
import { deleteAccountError } from "@/lib/deleteError";

/**
 * Every action that can fail returns a sentence written for the person, or
 * null. The mapping happens here rather than at each screen so that no screen
 * can leak a raw Supabase string by forgetting to ask for one — which is
 * exactly what both auth screens used to do.
 */
type SessionState = {
  session: Session | null;
  initialized: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  setName: (name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<string | null>;
};

/** Where an emailed link lands. Handled by the deep-link listener in app/_layout.tsx. */
const REDIRECT = "routeready://auth-callback";

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

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  initialized: false,
  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, initialized: true });
    supabase.auth.onAuthStateChange((_event, session) => set({ session }));
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? authError(error.message) : null;
  },
  /**
   * The interview's answers ride along in `user_metadata` rather than a
   * profiles table: they are five scalars that belong to the account, and a
   * table would need a row, a policy and a migration to hold them.
   *
   * They go on this call rather than being written afterwards because email
   * confirmation is on — `signUp()` returns no session, so there is no
   * signed-in user to write a profile to until the link is opened in a later
   * session. This is the only moment they can be saved in one round trip.
   */
  signUp: async (email, password, metadata = {}) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    return error ? authError(error.message) : null;
  },
  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: REDIRECT },
    });
    return error ? authError(error.message) : null;
  },
  // Without this an account whose password was mistyped at sign-up cannot be
  // recovered inside the app at all — the magic link was the only way back in,
  // and it was presented as a convenience rather than as a rescue.
  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
    return error ? authError(error.message) : null;
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

  // The local session is cleared whatever the server says. signOut() reports a
  // failed round-trip two ways — a rejected promise and an `{ error }` result —
  // and neither is a reason to hold someone inside an account they have asked
  // to leave: the root layout redirects off `session` alone, so leaving it set
  // would make the button do nothing at all on a bad connection.
  signOut: async () => {
    try { await supabase.auth.signOut(); } catch { /* local sign-out below is the part that matters */ }
    await clearUserCache();
    set({ session: null });
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
