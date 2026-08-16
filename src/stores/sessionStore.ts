import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type SessionState = {
  session: Session | null;
  initialized: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  session: null,
  initialized: false,
  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, initialized: true });
    supabase.auth.onAuthStateChange((_event, session) => set({ session }));
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  },
  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  },
  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "routeready://auth-callback" },
    });
    return error ? error.message : null;
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
