import { parseDirections } from "../directions";

const osrm = {
  code: "Ok",
  routes: [
    {
      distance: 1240.5,
      geometry: { coordinates: [[-0.47, 51.75], [-0.471, 51.751], [-0.472, 51.752]] },
      legs: [
        {
          steps: [
            { name: "Leverstock Green Road", distance: 300, maneuver: { type: "depart", location: [-0.47, 51.75] } },
            { name: "Queensway", distance: 200, maneuver: { type: "turn", modifier: "left", location: [-0.471, 51.751] } },
            { name: "", distance: 0, maneuver: { type: "arrive", location: [-0.472, 51.752] } },
          ],
        },
      ],
    },
  ],
};

test("parseDirections converts geometry, steps and distance", () => {
  const d = parseDirections(osrm);
  expect(d.distanceM).toBe(1240.5);
  expect(d.coords[0]).toEqual({ lat: 51.75, lng: -0.47 });
  expect(d.steps).toHaveLength(3);
  expect(d.steps[0].instruction).toBe("Head off on Leverstock Green Road");
  expect(d.steps[1].instruction).toBe("Turn left onto Queensway");
  expect(d.steps[2].type).toBe("arrive");
});

test("parseDirections throws on a non-Ok response", () => {
  expect(() => parseDirections({ code: "NoRoute", routes: [] })).toThrow(/NoRoute/);
  expect(() => parseDirections({})).toThrow();
});
