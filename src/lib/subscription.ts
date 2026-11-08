/**
 * Turning what the store says into what a person reads.
 *
 * Kept out of the Settings screen for the usual reason: these are the two
 * places a subscription can be described wrongly to somebody paying for it,
 * and both should be provable without mounting a screen.
 */

/**
 * Apple's own subscriptions page.
 *
 * Opened with `Linking.openURL` rather than an in-app browser, deliberately —
 * this URL hands off to the App Store app, which is where a subscription can
 * actually be cancelled. Rendered inside a web view it is a dead end.
 */
export const MANAGE_URL = "https://apps.apple.com/account/subscriptions";

/**
 * Which plan a store product identifier names.
 *
 * Matched on the suffix, case-insensitively, rather than against a literal
 * table of identifiers. The live App Store product is `Routeready_weekly` with
 * a capital R — product identifiers cannot be renamed once created, so the
 * typo is permanent — and an exact-match table would print that raw string at
 * somebody who only wants to know what they are paying for.
 *
 * Null for anything unrecognised. A plan this code cannot name is better shown
 * as no name than as a guess.
 */
export function planLabel(product: string | null): string | null {
  const id = (product ?? "").toLowerCase();
  if (id.endsWith("weekly")) return "Weekly";
  if (id.endsWith("monthly")) return "Monthly";
  return null;
}

/**
 * "Renews 12 October", or null when there is nothing to name.
 *
 * Formatted in UTC. The store sends an instant, and an expiry a few hours
 * after midnight UTC would name the previous day for anybody west of it — a
 * renewal date wrong by a day is worse than one that is absent, because it
 * looks authoritative.
 *
 * No year. The renewal that matters is always within the month or the week,
 * and "Renews 12 October 2026" reads like a contract rather than a reminder.
 */
export function renewalLine(renewsAt: string | null): string | null {
  if (!renewsAt) return null;
  const date = new Date(renewsAt);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return `Renews ${formatted}`;
}
