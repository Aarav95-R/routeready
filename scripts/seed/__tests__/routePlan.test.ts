import { classify, nameFromSteps, planRoutes, type Feature } from "../routePlan";
import type { OsrmStep } from "../osrm";

const CENTRE = { lat: 51.748, lng: -0.336 };

// A feature at a given bearing and distance from the centre, so a test can say
// "put a roundabout 1.5 km north-east" instead of hand-computing coordinates.
function at(kind: Feature["kind"], bearing: number, km: number): Feature {
  const rad = (bearing * Math.PI) / 180;
  return {
    kind,
    lat: CENTRE.lat + (km / 111) * Math.cos(rad),
    lng: CENTRE.lng + (km / (111 * Math.cos((CENTRE.lat * Math.PI) / 180))) * Math.sin(rad),
  };
}

function spread(kind: Feature["kind"], count: number): Feature[] {
  return Array.from({ length: count }, (_, i) => at(kind, (i * 360) / count, 1.2 + (i % 4) * 0.6));
}

describe("classify", () => {
  test("reads the kind off the OSM tags, not the element type", () => {
    expect(classify({ tags: { junction: "roundabout" }, center: { lat: 1, lon: 2 } })?.kind).toBe("roundabout");
    expect(classify({ tags: { highway: "crossing", "crossing:markings": "zebra" }, lat: 1, lon: 2 })?.kind).toBe("crossing");
    expect(classify({ tags: { highway: "primary" }, center: { lat: 1, lon: 2 } })?.kind).toBe("fast");
    expect(classify({ tags: { highway: "trunk" }, center: { lat: 1, lon: 2 } })?.kind).toBe("fast");
    expect(classify({ tags: { highway: "residential" }, center: { lat: 1, lon: 2 } })?.kind).toBe("estate");
  });

  // Overpass returns a way's position under `center` and a node's on the
  // element itself. Reading only one of them silently drops half the results.
  test("takes the position from either center or the element", () => {
    expect(classify({ tags: { junction: "roundabout" }, center: { lat: 51.7, lon: -0.3 } })).toMatchObject({ lat: 51.7, lng: -0.3 });
    expect(classify({ tags: { highway: "residential" }, lat: 51.7, lon: -0.3 })).toMatchObject({ lat: 51.7, lng: -0.3 });
  });

  test("drops anything with no position or no usable tag", () => {
    expect(classify({ tags: { junction: "roundabout" } })).toBeNull();
    expect(classify({ tags: { highway: "footway" }, lat: 1, lon: 2 })).toBeNull();
    expect(classify({ lat: 1, lon: 2 })).toBeNull();
  });
});

describe("planRoutes", () => {
  const features = [...spread("roundabout", 8), ...spread("crossing", 8), ...spread("estate", 12), ...spread("fast", 6)];

  test("plans the number of routes asked for", () => {
    expect(planRoutes(CENTRE, features, 10)).toHaveLength(10);
  });

  test("every route leaves from and returns to the centre", () => {
    for (const r of planRoutes(CENTRE, features, 10)) {
      expect(r.waypoints[0]).toEqual(CENTRE);
      expect(r.waypoints[r.waypoints.length - 1]).toEqual(CENTRE);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(4);
    }
  });

  /**
   * The whole argument for querying OSM at all. A route that never meets a
   * roundabout or a crossing is the compass-ring generator with extra steps.
   */
  test("a route touches more than one kind of feature", () => {
    for (const r of planRoutes(CENTRE, features, 10)) {
      expect(new Set(r.kinds).size).toBeGreaterThanOrEqual(2);
    }
  });

  test("routes do not all reuse the same features", () => {
    const routes = planRoutes(CENTRE, features, 10);
    const keys = routes.map((r) => r.waypoints.slice(1, -1).map((w) => `${w.lat},${w.lng}`).join("|"));
    expect(new Set(keys).size).toBe(routes.length);
  });

  test("is deterministic — the same inputs plan the same routes", () => {
    expect(planRoutes(CENTRE, features, 10)).toEqual(planRoutes(CENTRE, features, 10));
  });

  /**
   * Rural centres exist. Fifteen residential ways and nothing else must still
   * produce ten routes rather than throwing or returning a short list.
   */
  test("falls back to compass rings when a centre has too few features", () => {
    const sparse = spread("estate", 3);
    const routes = planRoutes(CENTRE, sparse, 10);
    expect(routes).toHaveLength(10);
    for (const r of routes) expect(r.waypoints.length).toBeGreaterThanOrEqual(4);
  });

  test("plans ten routes even with no features at all", () => {
    expect(planRoutes(CENTRE, [], 10)).toHaveLength(10);
  });
});

describe("nameFromSteps", () => {
  const step = (name: string, distance: number): OsrmStep => ({
    name,
    distance,
    maneuver: { type: "turn", location: [0, 0] },
  });

  test("names the route after the two roads it spends longest on", () => {
    const steps = [step("Sandpit Lane", 1200), step("Holywell Hill", 800), step("Alma Road", 90)];
    expect(nameFromSteps(steps, new Set())).toBe("Sandpit Lane and Holywell Hill");
  });

  test("adds up a road driven in several separate steps", () => {
    const steps = [step("Verulam Road", 400), step("Chequer Street", 700), step("Verulam Road", 500)];
    expect(nameFromSteps(steps, new Set())).toBe("Verulam Road and Chequer Street");
  });

  // Two routes out of the same centre often share their biggest road. Naming
  // both after it reads like a mistake even though the names stay unique.
  test("skips roads already used to name another route at this centre", () => {
    const steps = [step("Purley Way", 2000), step("Mitcham Road", 900), step("Croydon Road", 500)];
    expect(nameFromSteps(steps, new Set(["Purley Way"]))).toBe("Mitcham Road and Croydon Road");
  });

  test("ignores unnamed roads", () => {
    expect(nameFromSteps([step("", 5000), step("Camp Road", 300)], new Set())).toBe("Camp Road");
  });

  test("returns null when nothing is left to name it after", () => {
    expect(nameFromSteps([step("", 900)], new Set())).toBeNull();
    expect(nameFromSteps([step("Purley Way", 900)], new Set(["Purley Way"]))).toBeNull();
  });
});
