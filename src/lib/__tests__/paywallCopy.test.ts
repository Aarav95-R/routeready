import { defaultPlan, paywallHeadline, paywallReason } from "../paywallCopy";

describe("paywallHeadline", () => {
  test("names the centre and counts what is behind the gate", () => {
    expect(paywallHeadline("Wood Green", 9)).toBe("Nine more routes at Wood Green");
  });

  test("uses a numeral past nine, matching routeSummary's rule", () => {
    expect(paywallHeadline("Mill Hill", 14)).toBe("14 more routes at Mill Hill");
  });

  test("stays singular for one", () => {
    expect(paywallHeadline("Barnet", 1)).toBe("One more route at Barnet");
  });

  test("falls back when the centre is not known yet", () => {
    expect(paywallHeadline("", 9)).toBe("Nine more routes to drive");
  });
});

describe("defaultPlan", () => {
  test("a test inside two weeks pre-selects the weekly plan", () => {
    expect(defaultPlan("two_weeks")).toBe("weekly");
  });

  test("everybody else sees the monthly plan first", () => {
    expect(defaultPlan("this_month")).toBe("monthly");
    expect(defaultPlan("later")).toBe("monthly");
    expect(defaultPlan("not_booked")).toBe("monthly");
    expect(defaultPlan(null)).toBe("monthly");
  });
});

describe("paywallReason", () => {
  test("leans on the date when there is one", () => {
    expect(paywallReason("two_weeks")).toContain("under two weeks");
  });

  test("says nothing about a date nobody has given", () => {
    expect(paywallReason("not_booked")).not.toMatch(/week|month/);
    expect(paywallReason(null)).not.toMatch(/week|month/);
  });

  test("is always a complete sentence", () => {
    for (const w of ["two_weeks", "this_month", "later", "not_booked", null] as const) {
      expect(paywallReason(w).endsWith(".")).toBe(true);
    }
  });
});
