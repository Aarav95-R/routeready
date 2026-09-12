import { pickFreeRoute } from "../generate";

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
