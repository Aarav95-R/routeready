import { accessFor } from "../access.ts";

/** A RevenueCat event, with the fields this decision actually reads. */
const event = (type: string, expiresMs: number | null, atMs = 1_760_000_000_000) => ({
  type,
  event_timestamp_ms: atMs,
  ...(expiresMs === null ? {} : { expiration_at_ms: expiresMs }),
});

const AT = 1_760_000_000_000;
const FUTURE = AT + 30 * 24 * 60 * 60 * 1000;
const PAST = AT - 24 * 60 * 60 * 1000;

describe("events that grant access", () => {
  test.each(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"])(
    "%s with a future expiry is active",
    (type) => { expect(accessFor(event(type, FUTURE))).toBe("active"); },
  );
});

describe("cancellation", () => {
  /**
   * The case the whole mapping exists for. In Apple's vocabulary cancelling
   * is switching auto-renew off, not losing access — cancel on day two of a
   * month and twenty-eight days are already paid for.
   */
  test("an ordinary cancellation keeps access until the period ends", () => {
    expect(accessFor(event("CANCELLATION", FUTURE))).toBe("active");
  });

  /**
   * A refund also arrives as CANCELLATION, but carries an expiry that has
   * already passed — Apple has taken the money back, so there is nothing
   * left that was paid for. Treating this as "active" would leave a refunded
   * person with access until some later EXPIRATION arrived, and indefinitely
   * if one never did.
   */
  test("a refund revokes immediately, because the expiry has already passed", () => {
    expect(accessFor(event("CANCELLATION", PAST))).toBe("lapsed");
  });
});

describe("billing issues", () => {
  /**
   * The grace period, and the one place a past expiry must NOT revoke: the
   * card failed, Apple is retrying, and the person is still owed their
   * routes while that plays out. The period they paid for has ended by
   * definition — that is what triggered the event.
   */
  test("a billing issue keeps access even though the period has ended", () => {
    expect(accessFor(event("BILLING_ISSUE", PAST))).toBe("active");
  });
});

describe("expiry", () => {
  test("EXPIRATION ends access", () => {
    expect(accessFor(event("EXPIRATION", PAST))).toBe("lapsed");
  });

  test("EXPIRATION ends access even with no expiry field at all", () => {
    expect(accessFor(event("EXPIRATION", null))).toBe("lapsed");
  });
});

describe("events with nothing to say about access", () => {
  test.each(["TEST", "TRANSFER", "INVOICE_ISSUANCE", "SOMETHING_NEW"])(
    "%s decides nothing",
    (type) => { expect(accessFor(event(type, FUTURE))).toBeNull(); },
  );
});

describe("a missing expiry never revokes a granting event", () => {
  /**
   * `expiration_at_ms` is absent on some events. Absent is not "in the past"
   * — reading it as zero would revoke every subscription that ever hit one.
   */
  test("an active event with no expiry stays active", () => {
    expect(accessFor(event("RENEWAL", null))).toBe("active");
  });
});
