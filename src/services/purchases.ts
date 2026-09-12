/**
 * The seam between this app and whoever is taking the money.
 *
 * Everything RevenueCat-shaped lives behind these seven functions, so the store
 * above can be tested by faking one module rather than by faking a native SDK,
 * and so replacing the provider later is a change to one file.
 *
 * Task 10 fills these in against `react-native-purchases`. Until then they are
 * honest no-ops that report an unknown entitlement, which is exactly what the
 * store is written to cope with.
 */

export type Plan = "weekly" | "monthly";

/** What the app needs to know, with nothing provider-shaped in it. */
export type Entitlement = {
  active: boolean;
  /** The store's own product identifier, for the Settings row. Null if none. */
  product: string | null;
  /** ISO 8601, or null when there is no renewal to name. */
  renewsAt: string | null;
};

/** A plan as the paywall shows it — price string comes from the store, never from us. */
export type PlanOffer = { plan: Plan; priceString: string };

export const ENTITLEMENT_ID = "full";

export async function configure(): Promise<void> {}

/** Tie purchases to this Supabase account. Returns what the store already knows. */
export async function identify(_userId: string): Promise<Entitlement | null> { return null; }

export async function signOutPurchases(): Promise<void> {}

export async function currentInfo(): Promise<Entitlement | null> { return null; }

/** The two plans with their localised prices, in the order the sheet shows them. */
export async function offers(): Promise<PlanOffer[]> { return []; }

/** Returns the new entitlement, or null if the person cancelled the sheet. */
export async function buy(_plan: Plan): Promise<Entitlement | null> { return null; }

export async function restore(): Promise<Entitlement | null> { return null; }
