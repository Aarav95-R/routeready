import type { Centre } from "@/types/db";
import { buildSections, nearSet, NEAR_MAX, NEAR_MIN } from "../centresView";

const MILL_HILL = { lat: 51.6087, lng: -0.2412 };

// Roughly one mile of latitude per 0.0145 degrees, so `n` below is ~n miles out.
const at = (id: string, milesNorth: number, over: Partial<Centre> = {}): Centre => ({
  id, name: id, address: "", lat: MILL_HILL.lat + milesNorth * 0.0145, lng: MILL_HILL.lng,
  pass_rate: 40, pass_rate_history: [], test_types: ["manual", "auto"], region: "Greater London",
  ...over,
});

test("the near set takes what is within thirty miles", () => {
  const centres = [at("a", 1), at("b", 5), at("c", 40), at("d", 60)];
  expect(nearSet(centres, MILL_HILL).map((c) => c.id)).toEqual(["a", "b"]);
});

test("the near set never exceeds the cap", () => {
  const centres = Array.from({ length: 20 }, (_, i) => at(`c${i}`, i + 1));
  expect(nearSet(centres, MILL_HILL)).toHaveLength(NEAR_MAX);
});

test("the near set falls back to the nearest few when nothing is within range", () => {
  // A rural driver: an empty map is worse than a wide one.
  const centres = Array.from({ length: 12 }, (_, i) => at(`c${i}`, 40 + i));
  const near = nearSet(centres, MILL_HILL);
  expect(near).toHaveLength(NEAR_MIN);
  expect(near[0].id).toBe("c0");
});

test("there is no near set without a fix", () => {
  expect(nearSet([at("a", 1)], null)).toEqual([]);
});

test("sorting by pass rate survives a type filter", () => {
  const centres = [
    at("low", 1, { pass_rate: 30 }),
    at("high", 2, { pass_rate: 60 }),
    at("autoOnly", 3, { pass_rate: 90, test_types: ["auto"] }),
  ];
  const sections = buildSections({
    centres, me: MILL_HILL, sort: "pass", filter: "manual", query: "",
  });
  const ids = sections.flatMap((s) => s.data.map((v) => v.centre.id));
  expect(ids).toEqual(["high", "low"]);
});

test("centres beyond the near set are listed apart and carry no pin", () => {
  const centres = [at("near", 2), at("far", 80, { region: "Tyne and Wear" })];
  const sections = buildSections({
    centres, me: MILL_HILL, sort: "nearest", filter: "all", query: "",
  });
  expect(sections.map((s) => s.title)).toEqual(["Near you", "Further afield"]);
  expect(sections[0].data[0].pinned).toBe(true);
  expect(sections[1].data[0].pinned).toBe(false);
});

test("without a fix everything is one section sorted by pass rate", () => {
  const centres = [at("a", 1, { pass_rate: 30 }), at("b", 2, { pass_rate: 50 })];
  const sections = buildSections({
    centres, me: null, sort: "pass", filter: "all", query: "",
  });
  expect(sections).toHaveLength(1);
  expect(sections[0].title).toBe("All centres");
  expect(sections[0].data.map((v) => v.centre.id)).toEqual(["b", "a"]);
  expect(sections[0].data[0].distanceM).toBeNull();
});

test("search matches name and region, and an empty result is still a valid view", () => {
  const centres = [at("Mill Hill", 1), at("Newcastle", 80, { region: "Tyne and Wear" })];
  const byRegion = buildSections({
    centres, me: MILL_HILL, sort: "nearest", filter: "all", query: "tyne",
  });
  expect(byRegion.flatMap((s) => s.data.map((v) => v.centre.id))).toEqual(["Newcastle"]);

  const none = buildSections({
    centres, me: MILL_HILL, sort: "nearest", filter: "all", query: "brixton",
  });
  expect(none.flatMap((s) => s.data)).toEqual([]);
});
