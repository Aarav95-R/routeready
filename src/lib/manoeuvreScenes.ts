/**
 * Where the car actually goes.
 *
 * The `manoeuvres` table holds the words — a name, six steps, three tips —
 * and nothing that could place a car on a road. That half is geometry, it
 * changes with the drawing rather than with the DVSA, and it ships in the
 * bundle. The two meet on the manoeuvre's name, which is the seam: rename a
 * row in the database and `sceneFor` returns null, so the diagram disappears
 * rather than misdraws.
 *
 * Every scene is drawn heading east, so `deg: 0` is nose-right and the kerb a
 * learner parks against is the top edge. Pull up on the right is the one
 * manoeuvre that finishes against the *bottom* edge, and that inversion is
 * the diagram teaching the manoeuvre rather than decorating it.
 *
 * The materials are local rather than in `theme.ts`. Every value there has a
 * twin in `tailwind.config.js` because a class name has to be able to reach
 * it; these five are SVG fills that no class name will ever reach, and they
 * only mean anything next to the coordinates they colour.
 */

/** Tarmac. A shade under `colors.drawing`, so white bay paint has ground. */
const ROAD = "#E7E3DB";
/** Pavement. A shade over it, so the kerb reads as an edge without a border. */
const PAVE = "#F3F0E9";
const KERB = "#C9C3B8";
/** Road markings — bay lines, centre lines. */
const PAINT = "#FDFCFA";
/** Somebody else's car. */
const OTHER = "#CFC8BC";
/** Kerb and aisle captions. Exported because the caption is drawn by the
 *  component, not baked into a shape the way every other material is. */
export const LABEL_FILL = "#A79D94";

export type Pose = { x: number; y: number; deg: number };

export type SceneShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; fill: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: string }
  | { kind: "label"; x: number; y: number; text: string; anchor: "start" | "end" };

export type Scene = {
  /** Painted in order, so later shapes sit on earlier ones. */
  shapes: SceneShape[];
  /** One per step, in step order. */
  poses: Pose[];
};

/** The coordinate space every scene and every pose is written in. */
export const VIEWBOX = { w: 320, h: 190 } as const;

/** The learner's car, in the same units. */
export const CAR = { length: 54, width: 26 } as const;

/**
 * The four names as `seed.sql` spells them. This is the join key, so it is
 * written once and the suite asserts a scene exists for each — which is what
 * keeps the two spellings from drifting apart in a copy edit.
 */
export const SEEDED_NAMES = [
  "Parallel park",
  "Bay park (reverse)",
  "Forward bay park",
  "Pull up on the right",
] as const;

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0): SceneShape =>
  ({ kind: "rect", x, y, w, h, rx, fill });
const line = (
  x1: number, y1: number, x2: number, y2: number, stroke: string, width: number, dash?: string,
): SceneShape => ({ kind: "line", x1, y1, x2, y2, stroke, width, dash });
const label = (x: number, y: number, text: string, anchor: "start" | "end" = "start"): SceneShape =>
  ({ kind: "label", x, y, text, anchor });

/**
 * A row of bays across the top, shared by both bay-park scenes.
 *
 * The target bay is the middle one and both its neighbours are occupied,
 * because a bay with open space either side is not the manoeuvre anyone needs
 * to practise.
 */
const BAYS: SceneShape[] = [
  rect(0, 0, VIEWBOX.w, VIEWBOX.h, ROAD),
  line(0, 22, VIEWBOX.w, 22, PAINT, 3),
  line(42, 22, 42, 96, PAINT, 3),
  line(100, 22, 100, 96, PAINT, 3),
  line(158, 22, 158, 96, PAINT, 3),
  line(216, 22, 216, 96, PAINT, 3),
  line(274, 22, 274, 96, PAINT, 3),
  rect(58, 26, 26, 54, OTHER, 7),
  rect(174, 26, 26, 54, OTHER, 7),
  label(8, 176, "AISLE"),
];

const SCENES: Record<string, Scene> = {
  "Parallel park": {
    shapes: [
      rect(0, 0, VIEWBOX.w, 34, PAVE),
      rect(0, 34, VIEWBOX.w, VIEWBOX.h - 34, ROAD),
      line(0, 34, VIEWBOX.w, 34, KERB, 2.5),
      line(0, 132, VIEWBOX.w, 132, PAINT, 2.5, "14 12"),
      rect(50, 38, 60, 28, OTHER, 7),
      rect(200, 38, 60, 28, OTHER, 7),
      label(8, 22, "KERB"),
    ],
    poses: [
      { x: 250, y: 86, deg: 0 },   // alongside the car in front of the gap
      { x: 227, y: 86, deg: 0 },   // rear bumpers level
      { x: 192, y: 74, deg: 30 },  // reversing, wheel full towards the kerb
      { x: 168, y: 62, deg: 15 },  // steering back the other way
      { x: 158, y: 54, deg: 4 },
      { x: 155, y: 52, deg: 0 },   // parallel, a car's width off the kerb
    ],
  },

  "Bay park (reverse)": {
    shapes: BAYS,
    poses: [
      { x: 245, y: 130, deg: 0 },  // driven past, two bays clear
      { x: 252, y: 130, deg: 0 },  // reverse selected
      { x: 200, y: 124, deg: 38 },
      { x: 150, y: 112, deg: 78 },
      { x: 129, y: 72, deg: 90 },
      { x: 129, y: 64, deg: 90 },  // nose out, facing the aisle
    ],
  },

  "Forward bay park": {
    shapes: BAYS,
    poses: [
      { x: 46, y: 130, deg: 0 },
      { x: 92, y: 130, deg: 0 },
      { x: 124, y: 120, deg: -38 },
      { x: 133, y: 96, deg: -72 },
      { x: 129, y: 64, deg: -90 },
      { x: 129, y: 58, deg: -90 }, // nose in, facing the back of the bay
    ],
  },

  "Pull up on the right": {
    shapes: [
      rect(0, 0, VIEWBOX.w, 30, PAVE),
      rect(0, 30, VIEWBOX.w, 130, ROAD),
      rect(0, 160, VIEWBOX.w, 30, PAVE),
      line(0, 30, VIEWBOX.w, 30, KERB, 2.5),
      line(0, 160, VIEWBOX.w, 160, KERB, 2.5),
      line(0, 95, VIEWBOX.w, 95, PAINT, 2.5, "14 12"),
      label(8, 20, "NEARSIDE"),
      label(VIEWBOX.w - 8, 182, "OFFSIDE", "end"),
    ],
    poses: [
      { x: 44, y: 62, deg: 0 },
      { x: 118, y: 80, deg: 16 },   // crossing the centre line
      { x: 180, y: 110, deg: 10 },
      { x: 232, y: 144, deg: 0 },   // stopped at the offside kerb
      { x: 236, y: 144, deg: 0 },
      { x: 288, y: 116, deg: -18 }, // the one that does not finish parked
    ],
  },
};

/** The scene for a manoeuvre, or null for a name this build does not draw. */
export function sceneFor(name: string): Scene | null {
  return SCENES[name] ?? null;
}

/**
 * Clamped, so the copy and the geometry are allowed to disagree.
 *
 * A seventh step added to a seeded manoeuvre would otherwise index past the
 * end and hand the diagram an undefined pose. Holding the last pose is wrong
 * in a way a learner can see and ignore; a blank card is not.
 */
export function poseAt(scene: Scene, index: number): Pose {
  const i = Math.min(Math.max(index, 0), scene.poses.length - 1);
  return scene.poses[i];
}

/**
 * The car's affine transform for a pose, as the six cells react-native-svg
 * hands the platform.
 *
 * A matrix and not a `translate(...) rotate(...)` string, because the string
 * form only survives a React render: `RNSVGGroup`'s native prop spec has
 * `matrix` and no `transform` at all, and the JS layer is what converts one
 * to the other. Reanimated writes to the native view directly and skips that
 * conversion, so a driven `transform` sets a prop the view does not have and
 * the car renders once and then never moves again. Ask for the cells.
 *
 * Order matters as much as the channel: translate first, rotate second, so
 * the car turns about its own middle and its position survives in the last
 * two cells rather than being rotated along with it.
 *
 * A worklet, so the same function places the car on the first frame from the
 * JS thread and on every frame after it from the UI thread. One formula.
 */
export function carMatrix(pose: Pose): number[] {
  "worklet";
  const rad = (pose.deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, pose.x, pose.y];
}

/**
 * The same pose, as the string react-native-svg's JS layer understands.
 *
 * Two functions for one pose, because two layers place this car and they take
 * different prop names. React renders `transform` and react-native-svg turns
 * it into the matrix the platform wants; `matrix` is not a prop that layer
 * accepts at all. Reanimated writes past React to the native view, where the
 * opposite is true: `matrix` is the only cell set it has, and a `transform`
 * string means nothing.
 *
 * So: this one paints the opening frame, `carMatrix` drives every frame
 * after. The suite asserts they agree, which is what keeps the pair honest.
 */
export function carTransform(pose: Pose): string {
  return `translate(${pose.x} ${pose.y}) rotate(${pose.deg})`;
}
