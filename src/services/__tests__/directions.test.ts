import { directionsUrl, parseDirections } from "../directions";
import mapboxResponse from "./fixtures/mapbox-directions.json";

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

// ── The Mapbox shape ───────────────────────────────────────────────────────
//
// The fixture is a real response, captured from api.mapbox.com for a drive
// north out of the Mill Hill test centre and trimmed to three coordinates.
// It is in the repo rather than fetched, because the claim being tested is
// "Mapbox returns what parseDirections already reads" — and a claim that
// depends on the network to check is not a test.
//
// Mapbox Directions is built on OSRM and answers in OSRM's own vocabulary,
// which is why this file swapped provider without buildNavSteps,
// formatInstruction or stitchLegs moving at all.

test("a real Mapbox response parses without the parser changing", () => {
  const d = parseDirections(mapboxResponse);

  expect(d.distanceM).toBeCloseTo(1309.964);
  expect(d.coords[0]).toEqual({ lat: 51.608728, lng: -0.240884 });
  expect(d.steps).toHaveLength(6);
});

// Reading maneuver.exit is the whole reason roundabout instructions are worth
// anything, and it is the field most likely to go missing behind a provider
// swap. The Mill Hill circus is a `rotary`, not a `roundabout`.
test("a Mapbox rotary keeps the exit number the instruction is built from", () => {
  const d = parseDirections(mapboxResponse);
  const rotary = d.steps.find((s) => s.type === "rotary")!;

  expect(rotary.instruction).toBe("At the roundabout, take the 1st exit onto Watford Way");
});

test("Mapbox instructions read as the seeded ones do", () => {
  const d = parseDirections(mapboxResponse);

  expect(d.steps[0].instruction).toBe("Head off on Watford Way");
  expect(d.steps[2].instruction).toBe("Turn left onto The Broadway");
  expect(d.steps[5].instruction).toBe("You have reached the end of the route");
});

// ── The URL ────────────────────────────────────────────────────────────────

const FROM = { lat: 51.6087, lng: -0.2412 };
const TO = { lat: 51.6155, lng: -0.247 };

// The classic silent failure of this API. Latitude first returns a plausible
// route somewhere off the coast of Africa rather than an error, so nothing
// downstream can catch it — only the URL can.
test("coordinates go out longitude first, as the API expects", () => {
  expect(directionsUrl(FROM, TO, "pk.test")).toContain("/-0.2412,51.6087;-0.247,51.6155");
});

test("the request asks for the geometry and steps the parser needs", () => {
  const url = directionsUrl(FROM, TO, "pk.test");

  expect(url).toContain("https://api.mapbox.com/directions/v5/mapbox/driving/");
  expect(url).toContain("geometries=geojson");
  expect(url).toContain("overview=full");
  expect(url).toContain("steps=true");
  expect(url).toContain("access_token=pk.test");
});

// The seeded routes' instructions were generated with plain `driving`. Using
// `driving-traffic` for the approach leg would give the same drive two
// different voices.
test("the profile matches the one the seeded routes were built with", () => {
  expect(directionsUrl(FROM, TO, "pk.test")).toContain("/mapbox/driving/");
  expect(directionsUrl(FROM, TO, "pk.test")).not.toContain("driving-traffic");
});

// Without a token every call 401s, and both call sites swallow a failure into
// fallback mode — so the one thing that must not happen is a URL containing
// the word "undefined" and a silent downgrade nobody can diagnose.
test("a missing token is refused rather than sent as undefined", () => {
  expect(() => directionsUrl(FROM, TO, "")).toThrow(/token/i);
  expect(() => directionsUrl(FROM, TO, undefined)).toThrow(/token/i);
});
