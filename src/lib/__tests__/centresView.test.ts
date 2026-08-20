import type { Centre } from "@/types/db";
import { activeCentreId, buildSections, byDistance, nearSet, NEAR_MAX, NEAR_MIN } from "../centresView";

const MILL_HILL = { lat: 51.6087, lng: -0.2412 };

// Roughly one mile of latitude per 0.0145 degrees, so `n` below is ~n miles out.
const at = (id: string, milesNorth: number, over: Partial<Centre> = {}): Centre => ({
  id, name: id, address: "", lat: MILL_HILL.lat + milesNorth * 0.0145, lng: MILL_HILL.lng,
  pass_rate: 40, test_types: ["manual", "auto"], region: "Greater London",
  ...over,
});

// Exported so the screen can order the identity-assignment list the same
// way this module orders the near set and the "nearest" sort — one
// definition of "nearest" rather than a second comparator drifting from it.
test("byDistance sorts nearest first", () => {
  const centres = [at("far", 10), at("near", 1), at("mid", 5)];
  expect([...centres].sort(byDistance(MILL_HILL)).map((c) => c.id)).toEqual(["near", "mid", "far"]);
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

// ── activeCentreId ─────────────────────────────────────────────────────────

const PINS = [at("ash", 1), at("birch", 2), at("cedar", 3)];

// The map has to open pointed at something rather than at the middle of
// nowhere, so the nearest pin is active before anything has been chosen.
test("nothing chosen yet opens on the first pin", () => {
  expect(activeCentreId(undefined, PINS)).toBe("ash");
});

test("a chosen centre that is on screen is the answer", () => {
  expect(activeCentreId("birch", PINS)).toBe("birch");
});

// Filtering or searching takes the chosen centre's pin and its row away
// together. Left as it was, the map would keep a label for a pin it no longer
// draws and the sheet would tint no row at all.
test("a chosen centre filtered off the screen falls back to the first pin", () => {
  expect(activeCentreId("birch", [PINS[0], PINS[2]])).toBe("ash");
});

// Rows under "Further afield" have no pin to fly to, so scrolling onto one
// deliberately points at nothing — and must not be read as "nothing chosen
// yet", which would snap the camera straight back to the first pin.
test("choosing nothing is respected rather than re-seeded", () => {
  expect(activeCentreId(null, PINS)).toBeNull();
});

test("an empty list has no answer, whatever was chosen", () => {
  expect(activeCentreId("birch", [])).toBeNull();
  expect(activeCentreId(undefined, [])).toBeNull();
});

// The choice outlives a filter that hid it: searching a centre away and then
// clearing the search puts the map back where the user left it, rather than
// stranding it on whichever pin happened to be first while they typed.
test("a choice hidden and then restored comes back", () => {
  expect(activeCentreId("cedar", [PINS[0]])).toBe("ash");
  expect(activeCentreId("cedar", PINS)).toBe("cedar");
});
