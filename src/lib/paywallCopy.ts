import type { Plan } from "@/services/purchases";
import type { TestWindow } from "@/lib/onboarding";

/**
 * What the paywall says, as data rather than as JSX.
 *
 * Here for the reason `verifyCopy` and `homeView` are: this is the copy that
 * decides whether anybody pays, it should be arguable over in a test rather
 * than inside a bottom sheet, and it reads from the sign-up interview's answers
 * — which are the app's one piece of genuine knowledge about the person.
 */

const NUMBERS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * "Nine more routes at Wood Green".
 *
 * Names the centre, because the sheet opens on somebody who was looking at that
 * centre's routes a moment ago. "Upgrade to Premium" describes what the company
 * wants; this describes what they were already trying to do.
 *
 * Past nine it switches to the numeral, matching `count` in routeSummary — the
 * same reason there: words read worse than digits once they get long.
 */
export function paywallHeadline(centreName: string, lockedCount: number): string {
  // Settings opens this sheet from nowhere in particular: no centre on screen
  // to name, and nothing counted. Counting is the whole shape of the sentence
  // everywhere else, so with no count there is no sentence to make — it
  // describes the offer instead. Falling through would read " more routes to
  // drive", because NUMBERS[0] is the empty string.
  if (lockedCount <= 0) return "Every route, at every test centre";
  const n = lockedCount < 10 ? NUMBERS[lockedCount] : String(lockedCount);
  const noun = lockedCount === 1 ? "route" : "routes";
  if (!centreName) return `${n} more ${noun} to drive`;
  return `${n} more ${noun} at ${centreName}`;
}

/**
 * The plan shown selected when the sheet opens.
 *
 * Somebody testing inside a fortnight genuinely needs about a fortnight, and
 * showing them the monthly plan first asks them to buy three weeks they will
 * not use. Everybody else is better served by the cheaper-per-week option, which
 * is the monthly one.
 */
export function defaultPlan(window: TestWindow | null): Plan {
  return window === "two_weeks" ? "weekly" : "monthly";
}

/**
 * One sentence under the headline.
 *
 * Silent about dates for anybody who has not given one. "Not booked yet" was
 * written on a card that promised "No countdown, no nagging", and inventing
 * urgency for that person would break the promise the interview made.
 */
export function paywallReason(window: TestWindow | null): string {
  switch (window) {
    case "two_weeks":
      return "Your test is in under two weeks. Every route you drive is one fewer road the examiner can surprise you with.";
    case "this_month":
      return "Your test is this month. The examiner picks the route; you can know all of them first.";
    case "later":
      return "There is time to drive all of them before your test, a route at a time.";
    default:
      return "The examiner picks the route on the day. This is how you have already driven it.";
  }
}
