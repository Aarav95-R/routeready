import type { ObservationZone, ProgressEntry, Route, SpeedProfileSegment } from "@/types/db";
import {
  attemptLine,
  difficultyWord,
  plainSummary,
  progressBadge,
  progressLine,
  shortRouteName,
} from "../routeSummary";

const zone = (kind: ObservationZone["kind"]): ObservationZone => ({ kind, lat: 51.6, lng: -0.24, radiusM: 30 });
const limit = (limitMph: SpeedProfileSegment["limitMph"]): SpeedProfileSegment => ({ startIdx: 0, endIdx: 10, limitMph });

const route = (over: Partial<Route> = {}): Route => ({
  id: "r1", centre_id: "c1", name: "Route 1 · Town loop",
  geometry: { type: "LineString", coordinates: [] },
  estimated_minutes: 18, distance_km: 6.2, difficulty: 2,
  speed_profile: [], observation_zones: [], is_free: true,
  ...over,
});

const entry = (score: number | null): ProgressEntry => ({
  user_id: "u1", route_id: "r1", mock_test_score: score, mistakes: [], duration_seconds: 1200,
});

describe("difficultyWord", () => {
  test("names all five levels", () => {
    expect([1, 2, 3, 4, 5].map((l) => difficultyWord(l as 1))).toEqual([
      "Very gentle", "Gentle", "Steady", "Testing", "Demanding",
    ]);
  });
});

describe("plainSummary", () => {
  test("counts one zone with an article, not a numeral", () => {
    const s = plainSummary(route({ observation_zones: [zone("roundabout")], speed_profile: [limit(30)] }));
    expect(s).toBe("Quiet streets, with a roundabout.");
  });

  test("spells small counts and pluralises", () => {
    const s = plainSummary(route({
      observation_zones: [zone("roundabout"), zone("roundabout")],
      speed_profile: [limit(30)],
    }));
    expect(s).toBe("Quiet streets, with two roundabouts.");
  });

  test("joins three kinds with commas and a final and", () => {
    const s = plainSummary(route({
      observation_zones: [
        zone("roundabout"), zone("junction"), zone("junction"), zone("pedestrian"),
      ],
      speed_profile: [limit(30)],
    }));
    expect(s).toBe("Quiet streets, with a roundabout, two junctions and a crossing.");
  });

  test("leads with the fastest stretch on the route", () => {
    expect(plainSummary(route({ speed_profile: [limit(30), limit(60)] })))
      .toBe("Open 60 mph road.");
    expect(plainSummary(route({ speed_profile: [limit(30), limit(40)] })))
      .toBe("Town roads and a 40 mph stretch.");
    expect(plainSummary(route({ speed_profile: [limit(20)] })))
      .toBe("Slow, narrow streets.");
  });

  test("uses numerals once a count reaches ten", () => {
    const many = Array.from({ length: 11 }, () => zone("junction"));
    expect(plainSummary(route({ observation_zones: many, speed_profile: [limit(30)] })))
      .toBe("Quiet streets, with 11 junctions.");
  });

  test("falls back when a route carries neither zones nor a profile", () => {
    expect(plainSummary(route())).toBe("A steady drive around the area.");
  });
});

describe("progressLine and progressBadge", () => {
  test("no history reads as new", () => {
    expect(progressLine([])).toBeNull();
    expect(progressBadge([])).toBe("New");
  });

  test("a single mock test stays singular", () => {
    expect(progressLine([entry(82)])).toBe("1 mock test · best score 82");
    expect(progressBadge([entry(82)])).toBe("Best 82");
  });

  test("reports the best score across attempts, not the latest", () => {
    const rows = [entry(64), entry(82), entry(71)];
    expect(progressLine(rows)).toBe("3 mock tests · best score 82");
    expect(progressBadge(rows)).toBe("Best 82");
  });

  test("attempts without scores report the count alone", () => {
    const rows = [entry(null), entry(null)];
    expect(progressLine(rows)).toBe("2 mock tests");
    expect(progressBadge(rows)).toBe("Attempted");
  });
});

// The same two numbers progressLine reports, said the way an instructor would.
describe("attemptLine", () => {
  test("a route never tested has nothing to say", () => {
    expect(attemptLine([])).toBeNull();
  });

  test("one attempt has a score, not a best", () => {
    expect(attemptLine([entry(74)])).toBe("You've taken this once — you scored 74");
  });

  test("two attempts are counted in words", () => {
    expect(attemptLine([entry(64), entry(82)])).toBe("You've taken this twice — your best is 82");
  });

  test("past two, the numeral reads better than the word", () => {
    expect(attemptLine([entry(50), entry(64), entry(82)])).toBe("You've taken this 3 times — your best is 82");
  });

  test("attempts without scores report the count alone", () => {
    expect(attemptLine([entry(null), entry(null)])).toBe("You've taken this twice");
    expect(attemptLine([entry(null)])).toBe("You've taken this once");
  });
});

describe("shortRouteName", () => {
  test("drops the seeded Route n prefix", () => {
    expect(shortRouteName("Route 1 · Town loop")).toBe("Town loop");
    expect(shortRouteName("Route 12 · Main-road run")).toBe("Main-road run");
  });

  test("leaves a name without the prefix alone", () => {
    expect(shortRouteName("Town loop")).toBe("Town loop");
    expect(shortRouteName("Route to nowhere")).toBe("Route to nowhere");
  });
});
