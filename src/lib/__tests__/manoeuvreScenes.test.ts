import { CAR, carMatrix, carTransform, poseAt, sceneFor, SEEDED_NAMES, VIEWBOX, type Pose } from "../manoeuvreScenes";

test("every seeded manoeuvre has a scene", () => {
  for (const name of SEEDED_NAMES) expect(sceneFor(name)).not.toBeNull();
});

test("an unrecognised name has no scene rather than a broken one", () => {
  expect(sceneFor("Emergency stop")).toBeNull();
  expect(sceneFor("parallel park")).toBeNull();
});

test("every scene has one pose per seeded step", () => {
  for (const name of SEEDED_NAMES) expect(sceneFor(name)!.poses).toHaveLength(6);
});

test("no pose puts any part of the car outside the viewBox", () => {
  // Half the diagonal, so the bound holds at every heading rather than only
  // at the two the car happens to finish on.
  const reach = Math.hypot(CAR.length, CAR.width) / 2;
  for (const name of SEEDED_NAMES) {
    for (const p of sceneFor(name)!.poses) {
      expect(p.x).toBeGreaterThanOrEqual(reach);
      expect(p.x).toBeLessThanOrEqual(VIEWBOX.w - reach);
      expect(p.y).toBeGreaterThanOrEqual(reach);
      expect(p.y).toBeLessThanOrEqual(VIEWBOX.h - reach);
    }
  }
});

test("the two bay parks end facing opposite ways", () => {
  // The entire difference between the manoeuvres, and the thing the diagram
  // exists to show. Reverse finishes nose-out; forward finishes nose-in.
  const reverse = sceneFor("Bay park (reverse)")!.poses;
  const forward = sceneFor("Forward bay park")!.poses;
  expect(reverse[reverse.length - 1].deg).toBe(90);
  expect(forward[forward.length - 1].deg).toBe(-90);
});

test("poseAt clamps rather than returning undefined off the end", () => {
  // A seventh step added to the seed copy must show the last pose, not crash
  // the screen.
  const scene = sceneFor("Parallel park")!;
  expect(poseAt(scene, 6)).toEqual(scene.poses[5]);
  expect(poseAt(scene, -1)).toEqual(scene.poses[0]);
});

test("carMatrix rotates the car about itself, not about the corner of the map", () => {
  // Order is the whole of this. Rotating before translating spins the car
  // around the viewBox origin and flings it off the drawing; translating
  // first turns it on the spot, which is what a car does. In an affine
  // matrix that is the difference between the position surviving in the last
  // two cells and being rotated along with everything else.
  // Compared cell by cell rather than with toEqual: -sin(0) is -0, which is
  // the same number to every renderer on earth and a different one to
  // Object.is.
  const cells = (pose: Pose, want: number[]) =>
    carMatrix(pose).forEach((v, i) => expect(v).toBeCloseTo(want[i], 12));

  cells({ x: 129, y: 64, deg: 0 }, [1, 0, 0, 1, 129, 64]);

  const [a, b, c, d, e, f] = carMatrix({ x: 129, y: 64, deg: -90 });
  expect(a).toBeCloseTo(0, 12);
  expect(b).toBeCloseTo(-1, 12);
  expect(c).toBeCloseTo(1, 12);
  expect(d).toBeCloseTo(0, 12);
  expect(e).toBe(129);
  expect(f).toBe(64);
});

test("the two ways of placing the car agree with each other", () => {
  // One paints the opening frame through React, the other drives every frame
  // after through Reanimated. If they ever disagree the car jumps on its
  // first tick, and nothing else in the app would notice.
  for (const name of SEEDED_NAMES) {
    for (const pose of sceneFor(name)!.poses) {
      const [a, b, c, d, e, f] = carMatrix(pose);
      const rad = (pose.deg * Math.PI) / 180;
      expect(carTransform(pose)).toBe(`translate(${pose.x} ${pose.y}) rotate(${pose.deg})`);
      expect(a).toBeCloseTo(Math.cos(rad), 12);
      expect(b).toBeCloseTo(Math.sin(rad), 12);
      expect(c).toBeCloseTo(-Math.sin(rad), 12);
      expect(d).toBeCloseTo(Math.cos(rad), 12);
      expect([e, f]).toEqual([pose.x, pose.y]);
    }
  }
});
