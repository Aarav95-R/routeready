import { render, screen } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { Line, Text as SvgText } from "react-native-svg";
import { carMatrix, sceneFor, type Pose } from "@/lib/manoeuvreScenes";
import { ManoeuvreDiagram } from "../ManoeuvreDiagram";

const parallel = sceneFor("Parallel park")!;
const count = (kind: string) => parallel.shapes.filter((s) => s.kind === kind).length;

// react-native-svg normalises everything on the way to the native shim: a
// Polyline arrives as a path `d`, and a group's transform arrives as the
// affine matrix it composes to. Asserting on those rather than on the props
// handed in is what makes these tests about the drawing rather than about the
// call.
const renderedMatrix = () => screen.getByTestId("manoeuvre-car").props.matrix as number[];


/**
 * What the car is actually driven with, as opposed to what it first renders
 * with. Reanimated writes these straight to the native view every frame and
 * never goes back through React, so this is the only place the animated
 * channel is visible from a test.
 */
const drivenProps = (): Record<string, unknown> => {
  let node: ReactTestInstance | null = screen.getByTestId("manoeuvre-car");
  for (let i = 0; i < 6 && node !== null; i++) {
    const ap = node.props.animatedProps as { initial?: { value?: Record<string, unknown> } } | undefined;
    if (ap !== undefined) return ap.initial?.value ?? {};
    node = node.parent;
  }
  throw new Error("the car is not animated at all");
};

test("every shape the scene declares reaches the drawing", () => {
  render(<ManoeuvreDiagram scene={parallel} step={0} />);
  expect(screen.UNSAFE_getAllByType(Line)).toHaveLength(count("line"));
  expect(screen.UNSAFE_getAllByType(SvgText)).toHaveLength(count("label"));
  expect(screen.UNSAFE_getAllByType(SvgText)[0].props.children).toBe("KERB");
});

test("the whole path is drawn before the car has driven any of it", () => {
  // The faint dashed line is what makes a single frame legible: it shows
  // where this step sits in a manoeuvre the reader has not scrolled through.
  render(<ManoeuvreDiagram scene={parallel} step={0} />);
  expect(screen.getByTestId("manoeuvre-path").props.d)
    .toBe("M" + parallel.poses.map((p) => `${p.x} ${p.y}`).join(" "));
});

const at = (pose: Pose) => {
  const rad = (pose.deg * Math.PI) / 180;
  // translate(x y) rotate(deg), in the order carTransform writes them: the
  // rotation lands in the first four cells and the position in the last two.
  // Composed the other way round the position would be rotated too.
  return [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), pose.x, pose.y];
};

test("the car opens on the step it was given, not on step one", () => {
  // Coming back to a manoeuvre mid-list must not replay the whole thing.
  render(<ManoeuvreDiagram scene={parallel} step={3} />);
  renderedMatrix().forEach((v, i) => expect(v).toBeCloseTo(at(parallel.poses[3])[i], 6));
});

test("a step past the end of the poses holds the last one", () => {
  render(<ManoeuvreDiagram scene={parallel} step={99} />);
  const last = parallel.poses[parallel.poses.length - 1];
  renderedMatrix().forEach((v, i) => expect(v).toBeCloseTo(at(last)[i], 6));
});

test("the car is driven through the one prop the native group accepts", () => {
  // RNSVGGroup's native prop spec has `matrix` and no `transform`. The string
  // form works in a static render only because react-native-svg converts it
  // on the way through React — and Reanimated deliberately skips React. Drive
  // `transform` and you are setting a prop the view does not have: the car
  // draws once at its opening pose and then never moves, which is exactly how
  // this shipped the first time.
  render(<ManoeuvreDiagram scene={parallel} step={0} />);
  expect(Object.keys(drivenProps())).toEqual(["matrix"]);
});

test("the driven matrix is the same one the pure function computes", () => {
  // One formula for the first frame and every frame after it.
  render(<ManoeuvreDiagram scene={parallel} step={2} />);
  const { matrix } = drivenProps() as { matrix: number[] };
  carMatrix(parallel.poses[2]).forEach((v, i) => expect(matrix[i]).toBeCloseTo(v, 12));
});
