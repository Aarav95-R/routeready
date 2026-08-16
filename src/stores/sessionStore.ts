import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/authError";
import { clearUserCache } from "@/services/cache";

type SessionState = {
  session: Session | null;
  initialized: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, name?: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  setName: (name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

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

export const useSession = create<SessionState>((set) => ({
  session: null,
  initialized: false,
  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, initialized: true });
    supabase.auth.onAuthStateChange((_event, session) => set({ session }));
  },
  // Every action returns something showable. The mapping lives here rather
  // than on each screen because forgetting it on a screen is silent: the raw
  // string renders and looks like a decision.
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return error ? authErrorMessage(error.message) : null;
  },
  // The name rides along in user_metadata rather than a profiles table: it is
  // one string, it belongs to the account, and a table would need a row, a
  // policy and a migration to hold it.
  signUp: async (email, password, name = "") => {
    const trimmed = name.trim();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      ...(trimmed ? { options: { data: { full_name: trimmed } } } : {}),
    });
    return error ? error.message : null;
  },
  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: "routeready://auth-callback" },
    });
    return error ? authErrorMessage(error.message) : null;
  },
  /**
   * The way back into an account whose password was mistyped at sign-up.
   *
   * `resetPasswordForEmail` was never wired, which made a typo unrecoverable
   * in-app — the magic link was the only route back, and it is presented as a
   * convenience rather than a rescue.
   *
   * Same deep link as the magic link: the root layout already parses
   * `access_token`/`refresh_token` out of the fragment, and a recovery link
   * carries the same pair.
   */
  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: "routeready://auth-callback",
    });
    return error ? authErrorMessage(error.message) : null;
  },
  // Re-read the session rather than trusting the caller to have it: the
  // greeting on the home screen is rendered from `session`, so it has to be the
  // thing that changes when the name does.
  setName: async (name) => {
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    if (error) return error.message;
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
}));
