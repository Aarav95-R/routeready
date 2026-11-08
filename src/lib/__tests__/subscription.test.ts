import { planLabel, renewalLine, MANAGE_URL } from "../subscription";

describe("planLabel", () => {
  test("names the weekly plan", () => {
    expect(planLabel("routeready_weekly")).toBe("Weekly");
  });

  test("names the monthly plan", () => {
    expect(planLabel("routeready_monthly")).toBe("Monthly");
  });

  /**
   * The live App Store product is `Routeready_weekly`, with a capital R,
   * because product identifiers are immutable once created and that is what
   * got typed. Matching case-sensitively would print the raw identifier at
   * somebody who is only trying to find out what they are paying for.
   */
  test("does not care how the store capitalised the identifier", () => {
    expect(planLabel("Routeready_weekly")).toBe("Weekly");
    expect(planLabel("ROUTEREADY_MONTHLY")).toBe("Monthly");
  });

  test("has nothing to say about a product it does not recognise", () => {
    expect(planLabel("some_other_thing")).toBeNull();
  });

  test("has nothing to say when there is no product at all", () => {
    expect(planLabel(null)).toBeNull();
  });
});

describe("renewalLine", () => {
  test("names the day it renews", () => {
    expect(renewalLine("2026-10-12T00:00:00Z")).toBe("Renews 12 October");
  });

  /**
   * Formatted in UTC on purpose. An expiry a few hours after midnight UTC
   * would otherwise name the previous day for anybody west of it, and a
   * renewal date that is wrong by a day is worse than one that is vague.
   */
  test("names the same day wherever the phone is", () => {
    expect(renewalLine("2026-01-01T00:30:00Z")).toBe("Renews 1 January");
  });

  test("says nothing when there is no renewal to name", () => {
    expect(renewalLine(null)).toBeNull();
  });

  test("says nothing rather than 'Invalid Date' when the store sends nonsense", () => {
    expect(renewalLine("not a date")).toBeNull();
  });
});

test("the manage link points at Apple's own subscriptions page", () => {
  expect(MANAGE_URL).toBe("https://apps.apple.com/account/subscriptions");
});
