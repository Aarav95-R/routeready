import type { Hazard } from "@/types/db";
import {
  canAdvance, EMPTY_ANSWERS, EXPERIENCE_OPTIONS, FOCUS_OPTIONS, MAX_FOCUS,
  profileToWrite, TOTAL_STEPS, toggleFocus, toMetadata, WINDOW_OPTIONS, type Answers,
} from "../onboarding";

const answers = (over: Partial<Answers> = {}): Answers => ({ ...EMPTY_ANSWERS, ...over });

test("the interview is four questions and then the account", () => {
  expect(TOTAL_STEPS).toBe(5);
});

/**
 * The screen may not ask what the app cannot act on.
 *
 * `hazards.type` is the only per-route difficulty signal in the schema, and
 * these four values are the whole of it. An earlier draft of this card also
 * offered parallel parking, bay parking, dual carriageways and reversing —
 * `manoeuvres` has no route relation at all and there is no dual-carriageway
 * marker anywhere, so four of those six were questions nothing could answer.
 */
test("the weak-spot options are exactly the hazard types the schema holds", () => {
  const schema: Hazard["type"][] = ["roundabout", "zebra", "narrow", "junction"];
  expect(FOCUS_OPTIONS.map((o) => o.id).sort()).toEqual([...schema].sort());
});

test("every option carries copy for the person, not the column name", () => {
  for (const o of [...FOCUS_OPTIONS, ...EXPERIENCE_OPTIONS, ...WINDOW_OPTIONS]) {
    expect(o.label).not.toBe(o.id);
    expect(o.label[0]).toBe(o.label[0].toUpperCase());
  }
});

describe("canAdvance", () => {
  test("card 1 waits for a centre", () => {
    expect(canAdvance(0, EMPTY_ANSWERS)).toBe(false);
    expect(canAdvance(0, answers({ centreId: "c-1" }))).toBe(true);
  });

  test("card 2 waits for a window, and 'not booked' is an answer", () => {
    expect(canAdvance(1, EMPTY_ANSWERS)).toBe(false);
    expect(canAdvance(1, answers({ testWindow: "not_booked" }))).toBe(true);
    expect(canAdvance(1, answers({ testWindow: "two_weeks" }))).toBe(true);
  });

  test("card 3 waits for an experience", () => {
    expect(canAdvance(2, EMPTY_ANSWERS)).toBe(false);
    expect(canAdvance(2, answers({ experience: "ready" }))).toBe(true);
  });

  test("card 4 waits for at least one weak spot", () => {
    expect(canAdvance(3, EMPTY_ANSWERS)).toBe(false);
    expect(canAdvance(3, answers({ focus: ["roundabout"] }))).toBe(true);
  });

  // The account card is gated by the credentials on it, not by an answer.
  test("the account card is not this function's business", () => {
    expect(canAdvance(4, answers({ centreId: "c-1", testWindow: "later", experience: "ready", focus: ["zebra"] }))).toBe(false);
  });
});

describe("toggleFocus", () => {
  test("tapping a chosen one takes it off again", () => {
    expect(toggleFocus(["roundabout", "zebra"], "roundabout")).toEqual(["zebra"]);
  });

  test("two is the cap", () => {
    expect(MAX_FOCUS).toBe(2);
    expect(toggleFocus(["roundabout"], "zebra")).toEqual(["roundabout", "zebra"]);
  });

  /**
   * A third choice pushes the oldest off rather than being refused. A refusal
   * is a dead tap with no explanation attached to it, and swapping is what the
   * person meant by tapping a third thing.
   */
  test("a third pushes the oldest off rather than being refused", () => {
    expect(toggleFocus(["roundabout", "zebra"], "narrow")).toEqual(["zebra", "narrow"]);
  });

  test("it never mutates what it was given", () => {
    const before: readonly Hazard["type"][] = ["roundabout", "zebra"];
    toggleFocus(before, "narrow");
    expect(before).toEqual(["roundabout", "zebra"]);
  });
});

describe("toMetadata", () => {
  const full = answers({
    centreId: "c-1", testWindow: "two_weeks", experience: "progressing", focus: ["roundabout", "junction"],
  });

  test("every answer arrives under the name its reader will look for", () => {
    expect(toMetadata(full, "Sam")).toEqual({
      full_name: "Sam",
      home_centre_id: "c-1",
      test_window: "two_weeks",
      experience: "progressing",
      focus: ["roundabout", "junction"],
    });
  });

  /**
   * A blank name is omitted rather than written as "". An empty string is a
   * name that happens to be empty, and every consumer checking for presence
   * would read it as one — the greeting on Home falls back to the time of day
   * only when the key is absent.
   */
  test("a blank name is left out, not written as an empty string", () => {
    expect(toMetadata(full, "   ")).not.toHaveProperty("full_name");
  });

  test("a name is trimmed on the way in", () => {
    expect(toMetadata(full, "  Sam  ")).toMatchObject({ full_name: "Sam" });
  });

  test("not booked is stored, so Home knows not to count down", () => {
    expect(toMetadata(answers({ testWindow: "not_booked" }), "")).toMatchObject({ test_window: "not_booked" });
  });
});

/**
 * ── What a provider sign-in writes ────────────────────────────────────────
 *
 * A social sign-in arrives with a session already open, so unlike `signUp()`
 * there is no single call to hang the interview answers on. `profileToWrite`
 * decides what the follow-up `updateUser` should carry — or that it should
 * not happen at all, since a round trip writing nothing is still a round trip
 * somebody is waiting on.
 */
describe("profileToWrite", () => {
  const answered = answers({
    centreId: "c-1", testWindow: "two_weeks", experience: "progressing",
    focus: ["roundabout", "junction"],
  });
  const interview = toMetadata(answered, "");

  test("the interview's answers are written after a social sign-up", () => {
    expect(profileToWrite(interview, "", undefined)).toMatchObject({
      home_centre_id: "c-1",
      test_window: "two_weeks",
      experience: "progressing",
      focus: ["roundabout", "junction"],
    });
  });

  /**
   * Signing in on the sign-in screen carries no interview and no stored name,
   * so the provider's name is the only thing there is to write.
   */
  test("a returning social sign-in writes the provider's name", () => {
    expect(profileToWrite(undefined, "Aarav Raheja", undefined)).toEqual({ full_name: "Aarav Raheja" });
  });

  /**
   * The whole point of returning null: a returning Apple user brings no name
   * (Apple hands it over once, ever) and no interview, so there is nothing to
   * write and no call to make.
   */
  test("nothing to write means no round trip", () => {
    expect(profileToWrite(undefined, "", { full_name: "Aarav" })).toBeNull();
  });

  /**
   * A name already on the account outranks the provider's, because the person
   * may have changed it in Settings since. Apple's arrives only on first
   * consent anyway, so in practice this guards the Google case, which sends
   * the Google account's name on every single sign-in.
   */
  test("a stored name is never overwritten by the provider's", () => {
    expect(profileToWrite(undefined, "A. Raheja", { full_name: "Aarav" })).toBeNull();
  });

  // A typed name outranks both. It is the most recent thing the person said
  // about themselves, and they said it on the card this call came from.
  test("a name typed on the sign-up card wins", () => {
    expect(profileToWrite(toMetadata(answered, "Sam"), "Aarav Raheja", { full_name: "Old" }))
      .toMatchObject({ full_name: "Sam" });
  });

  // "" on an account is the same as no name — `selectFullName` already trims
  // to "" — so it must not block the provider's.
  test("an empty stored name does not count as a name", () => {
    expect(profileToWrite(undefined, "Aarav", { full_name: "   " })).toEqual({ full_name: "Aarav" });
  });
});
