import { stitchLegs } from "../navsteps";
import type { NavStep } from "@/types/db";

const mk = (type: string, instruction: string, road = "", distanceM = 100): NavStep =>
  ({ lat: 51.5, lng: -0.1, instruction, road, type, modifier: "", distanceM });

// One OSRM leg: depart, some driving, arrive.
const leg = (road: string, driveM: number) => [
  mk("depart", `Head off on ${road}`, road, driveM),
  mk("turn", `Turn left onto ${road}`, road, 200),
  mk("arrive", "You have reached the end of the route", "", 0),
];

test("a single-leg route is left exactly as it is", () => {
  const one = leg("Watford Way", 120);
  expect(stitchLegs(one)).toEqual(one);
});

test("a four-leg loop keeps one depart at the front and one arrive at the back", () => {
  const stitched = stitchLegs([
    ...leg("Watford Way", 120),
    ...leg("The Broadway", 90),
    ...leg("Bunn's Lane", 340),
    ...leg("Heritage Avenue", 67),
  ]);

  expect(stitched.filter((s) => s.type === "arrive")).toHaveLength(1);
  expect(stitched[stitched.length - 1].type).toBe("arrive");
  expect(stitched.filter((s) => s.type === "depart")).toHaveLength(1);
  expect(stitched[0].type).toBe("depart");
});

test("a mid-route depart is retyped rather than dropped, so its road length survives", () => {
  const raw = [...leg("Watford Way", 120), ...leg("Bunn's Lane", 3128)];
  const stitched = stitchLegs(raw);

  const total = (steps: NavStep[]) => steps.reduce((sum, s) => sum + s.distanceM, 0);
  // The only steps removed are mid-route arrivals, and those carry 0 m.
  expect(total(stitched)).toBe(total(raw));

  const retyped = stitched.find((s) => s.road === "Bunn's Lane" && s.distanceM === 3128)!;
  expect(retyped.type).toBe("continue");
  expect(retyped.instruction).toBe("Continue on Bunn's Lane");
});

test("a mid-route depart with no road name still reads as an instruction", () => {
  const stitched = stitchLegs([
    ...leg("Watford Way", 120),
    mk("depart", "Head off", "", 40),
    mk("arrive", "You have reached the end of the route", "", 0),
  ]);
  expect(stitched[stitched.length - 2].instruction).toBe("Continue");
});

test("stitching an already-stitched route changes nothing", () => {
  const once = stitchLegs([...leg("Watford Way", 120), ...leg("The Broadway", 90)]);
  expect(stitchLegs(once)).toEqual(once);
});

test("an empty step list survives", () => {
  expect(stitchLegs([])).toEqual([]);
});
