/**
 * What a RevenueCat event means for access.
 *
 * Split out of index.ts so it can be argued over in a test rather than only
 * by deploying and sending a webhook at a live project. Deliberately free of
 * Deno, Supabase and network: it is a pure decision, and it is the decision
 * that determines whether somebody who paid can drive.
 */

export type Access = "active" | "lapsed";

/**
 * What each event means for access — which is not the same as what it means
 * for billing, and the gap is where this would go wrong if it were written
 * from the event names alone.
 *
 * CANCELLATION maps to `active` on purpose. In Apple's vocabulary a
 * cancellation is auto-renew being switched off, not access ending: somebody
 * who cancels on day two of a month has twenty-eight days paid for. Taking
 * the routes away at CANCELLATION would be taking away something already
 * bought. EXPIRATION is the event that actually ends it.
 *
 * BILLING_ISSUE is the grace period — the card failed and Apple is retrying.
 * The person is still owed their routes while that plays out.
 */
const ACCESS: Record<string, Access> = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  PRODUCT_CHANGE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  CANCELLATION: "active",
  BILLING_ISSUE: "active",
  EXPIRATION: "lapsed",
};

/**
 * The one event type whose expiry is expected to be in the past while access
 * continues.
 *
 * A billing issue fires *because* the paid period ended and the renewal
 * failed, so its `expiration_at_ms` is behind the event by definition. That
 * is the grace period, not the end of access, and the guard below must not
 * read it as one.
 */
const EXPIRY_MEANS_NOTHING = new Set(["BILLING_ISSUE"]);

/**
 * The access this event implies, or null when it implies nothing.
 *
 * Null covers TEST, TRANSFER, and anything RevenueCat adds later. The caller
 * answers 200 to those rather than an error: a non-200 makes RevenueCat
 * retry, and retrying an event we have decided to drop just drops it again.
 *
 * The expiry guard exists for refunds. A refund arrives as CANCELLATION like
 * any other, but carries an expiry that has already passed, because Apple has
 * taken the money back — there is nothing left that was paid for. Without the
 * guard a refunded person keeps their routes until some later EXPIRATION
 * lands, and forever if one never does. Checked against the event's own
 * timestamp rather than the wall clock, so that replaying an old event
 * reaches the same answer it would have reached at the time.
 */
export function accessFor(event: Record<string, unknown>): Access | null {
  const type = String(event.type ?? "");
  const status = ACCESS[type];
  if (!status) return null;
  if (status === "lapsed" || EXPIRY_MEANS_NOTHING.has(type)) return status;

  const expiresAt = Number(event.expiration_at_ms ?? NaN);
  // Absent is not "in the past". Reading a missing field as zero would revoke
  // every subscription whose event happened not to carry one.
  if (Number.isNaN(expiresAt)) return status;

  const eventAt = Number(event.event_timestamp_ms ?? Date.now());
  return expiresAt <= eventAt ? "lapsed" : "active";
}
