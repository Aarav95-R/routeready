import { buildNavSteps, formatInstruction, OsrmStep } from "../navsteps";

const step = (type: string, modifier: string | undefined, name: string, exit?: number, dist = 100): OsrmStep => ({
  name,
  distance: dist,
  maneuver: { type, modifier, location: [-0.1, 51.5], exit },
});

test("formats common maneuvers with road names", () => {
  expect(formatInstruction(step("depart", undefined, "Watford Way"))).toBe("Head off on Watford Way");
  expect(formatInstruction(step("turn", "right", "High Street"))).toBe("Turn right onto High Street");
  expect(formatInstruction(step("turn", "left", "Mill Hill Road"))).toBe("Turn left onto Mill Hill Road");
  expect(formatInstruction(step("end of road", "right", "The Broadway"))).toBe("At the end of the road, turn right onto The Broadway");
  expect(formatInstruction(step("roundabout", undefined, "A41", 2))).toBe("At the roundabout, take the 2nd exit onto A41");
  expect(formatInstruction(step("arrive", undefined, ""))).toBe("You have reached the end of the route");
});

test("continue/straight has no turn word", () => {
  expect(formatInstruction(step("turn", "straight", "London Road"))).toBe("Continue onto London Road");
  expect(formatInstruction(step("new name", undefined, "Apex Corner"))).toBe("Continue on Apex Corner");
});

test("missing road name degrades gracefully", () => {
  expect(formatInstruction(step("turn", "left", ""))).toBe("Turn left");
  expect(formatInstruction(step("depart", undefined, ""))).toBe("Head off");
});

test("buildNavSteps maps OSRM steps to NavStep shape", () => {
  const steps = buildNavSteps([
    step("depart", undefined, "Watford Way", undefined, 240.6),
    step("turn", "right", "High Street", undefined, 80.2),
    step("arrive", undefined, "", undefined, 0),
  ]);
  expect(steps).toHaveLength(3);
  expect(steps[1]).toEqual({
    lat: 51.5, lng: -0.1,
    instruction: "Turn right onto High Street",
    road: "High Street", type: "turn", modifier: "right", distanceM: 80,
  });
  expect(steps[0].distanceM).toBe(241);
});

test("buildNavSteps stitches a multi-leg response into one drive", () => {
  // What OSRM returns for a loop planned as centre -> feature -> centre.
  const steps = buildNavSteps([
    step("depart", undefined, "Watford Way", undefined, 120),
    step("turn", "left", "The Broadway", undefined, 200),
    step("arrive", undefined, "", undefined, 0),
    step("depart", undefined, "The Broadway", undefined, 340),
    step("turn", "right", "Watford Way", undefined, 180),
    step("arrive", undefined, "", undefined, 0),
  ]);

  expect(steps.map((s) => s.type)).toEqual(["depart", "turn", "continue", "turn", "arrive"]);
  expect(steps[2].instruction).toBe("Continue on The Broadway");
  expect(steps[2].distanceM).toBe(340);
});
