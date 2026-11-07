import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";

/**
 * The seam between this app and whoever is taking the money.
 *
 * Everything RevenueCat-shaped lives behind these seven functions, so the store
 * above can be tested by faking one module rather than by faking a native SDK,
 * and so replacing the provider later is a change to one file.
 *
 * Every function is a no-op returning "I don't know" when there is no API key.
 * That is not a guard against misconfiguration so much as a supported build:
 * a checkout without the key still compiles, runs, and simply never offers a
 * door it cannot open — `offers()` comes back empty and the sheet shows no
 * plans, rather than the app crashing at launch inside `configure`.
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

/**
 * Read once, at module scope, because it cannot change while the app runs.
 *
 * `EXPO_PUBLIC_` means this is inlined into the bundle, which is correct here:
 * a RevenueCat *public* SDK key is designed to ship in a client. The secret
 * half of RevenueCat lives in the webhook, not in this file.
 */
const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

/**
 * RevenueCat's answer, reduced to the three facts this app uses.
 *
 * Grace and billing-retry both arrive here as an *active* entitlement, which is
 * what makes them map to "active" throughout: during either, the person is
 * still owed their routes.
 */
function toEntitlement(info: CustomerInfo | null): Entitlement | null {
  if (!info) return null;
  const active = info.entitlements.active[ENTITLEMENT_ID];
  return {
    active: Boolean(active),
    product: active?.productIdentifier ?? null,
    renewsAt: active?.expirationDate ?? null,
  };
}

/**
 * The package RevenueCat is currently offering for a plan, or null.
 *
 * Null is an ordinary answer, not a fault: an offering can be missing a
 * package because the product is still in review, or because somebody edited
 * the offering in the dashboard. Both are reasons to show one plan rather than
 * to fail.
 */
async function packageFor(plan: Plan): Promise<PurchasesPackage | null> {
  const current = (await Purchases.getOfferings()).current;
  if (!current) return null;
  return (plan === "weekly" ? current.weekly : current.monthly) ?? null;
}

/** Whether a thrown thing is RevenueCat saying "they closed the sheet". */
function wasCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "userCancelled" in error
    && (error as { userCancelled?: boolean }).userCancelled === true;
}

export async function configure(): Promise<void> {
  if (!API_KEY) return; // a build without the key simply never offers a door it cannot open
  // Deliberately not awaited. `Purchases.configure` below must run in the same
  // tick as the call, because `identify()` is fired from a sibling effect in
  // app/_layout.tsx and `logIn` before `configure` throws. Awaiting the log
  // level would yield between the two, and only in dev — the nastiest shape of
  // bug there is, one that cannot happen in the build you ship.
  if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: API_KEY });
}

/** Tie purchases to this Supabase account. Returns what the store already knows. */
export async function identify(userId: string): Promise<Entitlement | null> {
  if (!API_KEY) return null;
  const { customerInfo } = await Purchases.logIn(userId);
  return toEntitlement(customerInfo);
}

export async function signOutPurchases(): Promise<void> {
  if (!API_KEY) return;
  await Purchases.logOut();
}

export async function currentInfo(): Promise<Entitlement | null> {
  if (!API_KEY) return null;
  return toEntitlement(await Purchases.getCustomerInfo());
}

/** The two plans with their localised prices, in the order the sheet shows them. */
export async function offers(): Promise<PlanOffer[]> {
  if (!API_KEY) return [];
  const current = (await Purchases.getOfferings()).current;
  if (!current) return [];

  const plans: [Plan, PurchasesPackage | null][] = [
    ["weekly", current.weekly],
    ["monthly", current.monthly],
  ];
  return plans.flatMap(([plan, pkg]) =>
    pkg ? [{ plan, priceString: pkg.product.priceString }] : [],
  );
}

/**
 * Returns the new entitlement, or null if the person cancelled the sheet.
 *
 * A cancellation is not a failure and must not be reported as one — the store
 * above turns null into silence, because somebody who closed the sheet already
 * knows what they did. Everything else is rethrown so the sheet can say that
 * nothing was charged.
 */
export async function buy(plan: Plan): Promise<Entitlement | null> {
  if (!API_KEY) return null;
  const pkg = await packageFor(plan);
  if (!pkg) return null;

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return toEntitlement(customerInfo);
  } catch (error) {
    if (wasCancelled(error)) return null;
    throw error;
  }
}

export async function restore(): Promise<Entitlement | null> {
  if (!API_KEY) return null;
  return toEntitlement(await Purchases.restorePurchases());
}
