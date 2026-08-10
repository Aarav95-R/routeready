import type { ObservationZone } from "@/types/db";
import { MAX_THUMB_POINTS, projectZones, thumbPath } from "../routeThumb";

const W = 200;
const H = 100;
const PAD = 8;

// A rectangle of [lng, lat] around a London test centre.
const box: [number, number][] = [
  [-0.25, 51.60], [-0.23, 51.60], [-0.23, 51.61], [-0.25, 51.61], [-0.25, 51.60],
];

const xs = (t: ReturnType<typeof thumbPath>) => t.points.map((p) => p.x);
const ys = (t: ReturnType<typeof thumbPath>) => t.points.map((p) => p.y);
const span = (n: number[]) => Math.max(...n) - Math.min(...n);

describe("thumbPath", () => {
  test("fits inside the box, honouring the padding", () => {
    const t = thumbPath(box, W, H, PAD);
    expect(Math.min(...xs(t))).toBeGreaterThanOrEqual(PAD - 0.01);
    expect(Math.max(...xs(t))).toBeLessThanOrEqual(W - PAD + 0.01);
    expect(Math.min(...ys(t))).toBeGreaterThanOrEqual(PAD - 0.01);
    expect(Math.max(...ys(t))).toBeLessThanOrEqual(H - PAD + 0.01);
  });

  test("touches the constraining axis so the route is not left small in its box", () => {
    const t = thumbPath(box, W, H, PAD);
    // This box is taller than it is wide once projected, so height constrains.
    expect(span(ys(t))).toBeCloseTo(H - 2 * PAD, 1);
  });

  test("scales both axes equally rather than stretching to fill", () => {
    // A route twice as wide as it is tall must stay twice as wide.
    const wide: [number, number][] = [[-0.25, 51.60], [-0.23, 51.60], [-0.23, 51.605], [-0.25, 51.60]];
    const t = thumbPath(wide, W, H, PAD);
    const rawRatio = span(wide.map(([lng]) => lng)) * Math.cos((51.6025 * Math.PI) / 180)
      / span(wide.map(([, lat]) => lat));
    expect(span(xs(t)) / span(ys(t))).toBeCloseTo(rawRatio, 1);
  });

  test("puts north at the top", () => {
    const northSouth: [number, number][] = [[-0.24, 51.60], [-0.24, 51.61]];
    const t = thumbPath(northSouth, W, H, PAD);
    // Higher latitude must land at a smaller y — SVG counts downward.
    expect(t.points[1].y).toBeLessThan(t.points[0].y);
  });

  test("starts the path at the first coordinate", () => {
    const t = thumbPath(box, W, H, PAD);
    expect(t.start).toEqual(t.points[0]);
    expect(t.d.startsWith(`M ${t.points[0].x}`)).toBe(true);
  });

  test("decimates a long geometry", () => {
    const long: [number, number][] = Array.from({ length: 300 }, (_, i) => [-0.25 + i * 1e-4, 51.6 + i * 1e-4]);
    const t = thumbPath(long, W, H, PAD);
    expect(t.points.length).toBeLessThanOrEqual(MAX_THUMB_POINTS);
    expect(t.points.length).toBeGreaterThan(2);
  });

  test("keeps the last coordinate when decimating, so a loop still closes", () => {
    const long: [number, number][] = Array.from({ length: 301 }, (_, i) => [-0.25 + i * 1e-4, 51.6]);
    const t = thumbPath(long, W, H, PAD);
    expect(Math.max(...xs(t))).toBeCloseTo(W - PAD, 1);
  });

  test("survives an empty or single-point geometry", () => {
    expect(thumbPath([], W, H, PAD)).toEqual({ d: "", start: null, points: [], project: expect.any(Function) });
    const one = thumbPath([[-0.24, 51.6]], W, H, PAD);
    expect(one.d).toBe("");
    expect(one.start).toEqual({ x: W / 2, y: H / 2 });
  });
});

describe("projectZones", () => {
  test("places a zone on the same transform as the line", () => {
    const t = thumbPath(box, W, H, PAD);
    const zones: ObservationZone[] = [{ kind: "roundabout", lat: 51.60, lng: -0.25, radiusM: 30 }];
    expect(projectZones(t, zones)).toEqual([t.points[0]]);
  });

  test("returns nothing for a route with no zones", () => {
    expect(projectZones(thumbPath(box, W, H, PAD), [])).toEqual([]);
  });
});
