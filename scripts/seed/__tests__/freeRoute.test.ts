import { pickFreeRoute, assertOneFreeRoutePerCentre } from "../generate";

const route = (difficulty: number, name: string) => ({ difficulty, name });

test("picks a middle-difficulty route, not the easiest", () => {
  const routes = [route(1, "A"), route(2, "B"), route(3, "C"), route(4, "D"), route(5, "E")];
  expect(pickFreeRoute(routes)).toBe(2);
});

test("is deterministic for the same input", () => {
  const routes = [route(4, "D"), route(1, "A"), route(3, "C")];
  expect(pickFreeRoute(routes)).toBe(pickFreeRoute(routes));
});

test("breaks a difficulty tie by name, so a reseed does not move the free route", () => {
  const routes = [route(3, "Zebra loop"), route(3, "Alpha loop")];
  expect(pickFreeRoute(routes)).toBe(1);
});

test("returns 0 for a single route", () => {
  expect(pickFreeRoute([route(5, "Only")])).toBe(0);
});

test("returns -1 when a centre somehow has no routes", () => {
  expect(pickFreeRoute([])).toBe(-1);
});

// `assertOneFreeRoutePerCentre` is what actually stands between a refactor
// and a centre going silently, fully paywalled — `pickFreeRoute` only picks
// among routes that already exist. It reports problems as strings (matching
// how `failures` is accumulated everywhere else in generate.ts) rather than
// throwing.
const freeRoute = (centre: string) => ({ centre, is_free: true });
const lockedRoute = (centre: string) => ({ centre, is_free: false });

test("a centre with exactly one free route passes", () => {
  const problems = assertOneFreeRoutePerCentre(
    ["Centre A"],
    [freeRoute("Centre A"), lockedRoute("Centre A"), lockedRoute("Centre A")],
  );
  expect(problems).toEqual([]);
});

test("a centre with zero free routes is reported by name", () => {
  const problems = assertOneFreeRoutePerCentre(
    ["Centre A"],
    [lockedRoute("Centre A"), lockedRoute("Centre A")],
  );
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("Centre A");
});

test("a centre with two free routes is reported", () => {
  const problems = assertOneFreeRoutePerCentre(
    ["Centre A"],
    [freeRoute("Centre A"), freeRoute("Centre A"), lockedRoute("Centre A")],
  );
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("Centre A");
});

// The important case: a centre that is in the centre list but produced no
// routes at all this run must still be reported. The check is threaded
// against the centre-name list rather than inferred from the routes array
// precisely so this centre cannot pass by simply not appearing in it.
test("a centre with no routes at all in the array is still reported", () => {
  const problems = assertOneFreeRoutePerCentre(
    ["Centre A", "Centre B"],
    [freeRoute("Centre A")],
  );
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("Centre B");
});
