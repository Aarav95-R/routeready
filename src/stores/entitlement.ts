import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isEntitled, resolveStatus, type EntitlementStatus, type StoredStatus } from "@/lib/gating";
import { clearRouteCache } from "@/services/cache";
import * as purchases from "@/services/purchases";
import type { Entitlement, Plan } from "@/services/purchases";

/**
 * Whether this account has paid, and what the app does about it.
 *
 * The store never *decides* the answer — Postgres does, through the policies on
 * `route_details` and `hazards`. Everything here exists so the app can draw the
 * right thing before the server is asked, and so a learner with no signal is
 * not locked out of a route they are paying for.
 */

/**
 * The last answer this device got, so it can be honoured while offline.
 *
 * Only ever "active" or "lapsed": "unknown" is the absence of a fact, and
 * writing it down would make the fallback meaningless.
 */
export const MIRROR_KEY = "entitlement:last";

type EntitlementState = {
  status: EntitlementStatus;
  product: string | null;
  renewsAt: string | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  identify: (userId: string) => Promise<void>;
  purchase: (plan: Plan) => Promise<string | null>;
  restore: () => Promise<string | null>;
  reset: () => Promise<void>;
};

export function selectStatus(s: EntitlementState): EntitlementStatus {
  return s.status;
}

export function selectEntitled(s: EntitlementState): boolean {
  return isEntitled(s.status);
}

async function readMirror(): Promise<StoredStatus | null> {
  const raw = await AsyncStorage.getItem(MIRROR_KEY).catch(() => null);
  return raw === "active" || raw === "lapsed" ? raw : null;
}

export const useEntitlement = create<EntitlementState>((set, get) => {
  /**
   * Fold an answer into the store, and sweep if access was just lost.
   *
   * The sweep fires on the *transition* into lapsed rather than on the state,
   * for two reasons. A person who was already lapsed may still have the free
   * routes cached, and dropping those on every refresh would break offline
   * practice for somebody who never paid anything and never did anything wrong.
   * And an unresolved status must never sweep: that is the offline case, where
   * the mirror is the only thing keeping a paying learner in.
   *
   * "Previous" is read from the *mirror*, not from `get().status`. The
   * in-memory field starts every fresh process at "unknown" — this store has
   * no `persist` middleware, only `MIRROR_KEY` survives a restart — and an
   * ordinary cancellation almost never happens while this screen is open to
   * see it. Somebody cancels through the App Store days later, then reopens
   * the app: `init()` calls this with the first `apply` of the new process,
   * `get().status` is still "unknown", and keying the transition off it would
   * make `lost` false forever for exactly the case `clearRouteCache` exists
   * for. The mirror is the one thing that remembers "active" across that gap.
   */
  const apply = async (answer: Entitlement | null) => {
    const live: EntitlementStatus = answer === null ? "unknown" : answer.active ? "active" : "lapsed";
    const mirrored = await readMirror();
    const status = resolveStatus(live, mirrored);
    const lost = mirrored === "active" && status === "lapsed";

    set({
      status,
      product: answer?.product ?? (status === "active" ? get().product : null),
      renewsAt: answer?.renewsAt ?? (status === "active" ? get().renewsAt : null),
    });

    if (status !== "unknown") {
      await AsyncStorage.setItem(MIRROR_KEY, status).catch(() => { /* a full disk is not a reason to lock someone out */ });
    }
    if (lost) {
      await clearRouteCache().catch(() => { /* the server refuses these reads anyway */ });
    }
  };

  return {
    status: "unknown",
    product: null,
    renewsAt: null,

    init: async () => {
      try { await purchases.configure(); } catch { /* the fallback below covers it */ }
      await apply(await purchases.currentInfo().catch(() => null));
    },

    refresh: async () => {
      await apply(await purchases.currentInfo().catch(() => null));
    },

    /**
     * Tie the store account to this Supabase account.
     *
     * Called on every session open rather than only on sign-in: the id is what
     * the webhook keys the entitlements row on, and a session restored from disk
     * has never been through `signIn`.
     */
    identify: async (userId) => {
      await apply(await purchases.identify(userId).catch(() => null));
    },

    /**
     * Buy a plan. Null means nothing to say — which covers both success and a
     * cancelled sheet, exactly as `signInWithProvider` does, because in both
     * cases the screen has nothing to tell the person that the new state does
     * not already say.
     */
    purchase: async (plan) => {
      let answer: Entitlement | null;
      try {
        answer = await purchases.buy(plan);
      } catch {
        return "That didn't go through. Nothing has been charged.";
      }
      if (answer === null) return null; // cancelled
      await apply(answer);
      return null;
    },

    restore: async () => {
      let answer: Entitlement | null;
      try {
        answer = await purchases.restore();
      } catch {
        return "Couldn't reach the App Store. Try again in a moment.";
      }
      await apply(answer);
      if (!answer?.active) return "No subscription found on this Apple ID.";
      return null;
    },

    /**
     * Sign-out. The mirror goes with it — it is this device's memory of one
     * account's subscription, and the next person to sign in on this phone must
     * not inherit it.
     */
    reset: async () => {
      try { await purchases.signOutPurchases(); } catch { /* local teardown is what matters */ }
      await AsyncStorage.removeItem(MIRROR_KEY).catch(() => {});
      set({ status: "unknown", product: null, renewsAt: null });
    },
  };
});
