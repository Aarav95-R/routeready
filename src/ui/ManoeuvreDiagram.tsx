import { useEffect, useState } from "react";
import Animated, { useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText, type GProps } from "react-native-svg";
import { carMatrix, carTransform, CAR, LABEL_FILL, poseAt, VIEWBOX, type Pose, type Scene } from "@/lib/manoeuvreScenes";
import { colors } from "@/ui/theme";
import { timing } from "@/ui/motion";

/**
 * `matrix` is on RNSVGGroup's native prop spec and is the only cell set the
 * platform accepts, but it is absent from `GProps` because the JS layer only
 * ever *emits* it: you hand that layer a `transform` and it emits the matrix.
 * Reanimated writes past that layer straight to the native view, so `matrix`
 * is the correct prop to drive here and the published types simply disown it
 * — the same situation as the centres sheet's scrollable and its `onScroll`.
 *
 * Declared once, here, rather than cast at the call site.
 */
const AnimatedG = Animated.createAnimatedComponent(G) as React.ComponentType<
  GProps & { animatedProps?: Partial<{ matrix: number[] }> }
>;

/**
 * Long enough to be read as travel rather than a cut, short enough that
 * flicking down the six steps does not feel like waiting for a cutscene.
 */
const DRIVE_MS = 620;

/** The roof, so which way the car is facing survives at 46pt. */
const ROOF = "#0F5C40";
/** The windscreen. Front of the car, and the whole difference between the
 *  two bay parks. */
const GLASS = "#8ED6B8";

function Car({ pose }: { pose: Pose }) {
  const x = useSharedValue(pose.x);
  const y = useSharedValue(pose.y);
  const deg = useSharedValue(pose.deg);

  // The first frame, captured once and never updated. React must not write a
  // new `matrix` when the step changes — the shared values own that property
  // from mount onwards, and a re-render setting it too would snap the car to
  // the new pose and then animate it back from the old one, which reads as a
  // flicker rather than as driving.
  //
  // It is still needed: animatedProps reach the native view rather than the
  // React tree, so without this the car has no matrix at all on its opening
  // frame and would appear at the origin, unrotated, until the first tick.
  const [initial] = useState(() => carTransform(pose));

  useEffect(() => {
    x.value = withTiming(pose.x, timing(DRIVE_MS));
    y.value = withTiming(pose.y, timing(DRIVE_MS));
    deg.value = withTiming(pose.deg, timing(DRIVE_MS));
    // Reanimated's timing honours ReduceMotion.System by default, so an
    // accessibility setting lands the car on the pose without the drive.
  }, [pose.x, pose.y, pose.deg, x, y, deg]);

  // `matrix`, never `transform` — see carMatrix for why the string form is a
  // no-op once Reanimated is the one writing it.
  const animatedProps = useAnimatedProps(() => ({
    matrix: carMatrix({ x: x.value, y: y.value, deg: deg.value }),
  }));

  const halfL = CAR.length / 2;
  const halfW = CAR.width / 2;

  return (
    <AnimatedG testID="manoeuvre-car" transform={initial} animatedProps={animatedProps}>
      <Rect x={-halfL} y={-halfW} width={CAR.length} height={CAR.width} rx={7} fill={colors.accent} />
      <Rect x={-15} y={-9} width={17} height={18} rx={4} fill={ROOF} />
      <Rect x={6} y={-8} width={8} height={16} rx={3} fill={GLASS} />
    </AnimatedG>
  );
}

/**
 * One manoeuvre, seen from above, at one step.
 *
 * The scene, the path and the markers are static; the car is the only thing
 * that moves, which is what keeps a step change readable — there is exactly
 * one thing to watch, and where it ends up is the answer to the step you just
 * scrolled to.
 *
 * `step` is clamped by `poseAt` rather than trusted, so a manoeuvre whose
 * copy has gained a step still draws.
 */
export function ManoeuvreDiagram({ scene, step }: { scene: Scene; step: number }) {
  const pose = poseAt(scene, step);

  return (
    <Svg
      testID="manoeuvre-diagram"
      width="100%"
      height="100%"
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      accessibilityRole="image"
    >
      {scene.shapes.map((s, i) => {
        if (s.kind === "rect") {
          return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={s.fill} />;
        }
        if (s.kind === "line") {
          return (
            <Line
              key={i}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash}
            />
          );
        }
        return (
          <SvgText
            key={i}
            x={s.x} y={s.y}
            fontSize={11} letterSpacing={1.1} fill={LABEL_FILL} textAnchor={s.anchor}
          >
            {s.text}
          </SvgText>
        );
      })}

      {/* Where the car has been and where it is going, at once. Without it a
          single step is a car sitting in a car park for no visible reason. */}
      <Polyline
        testID="manoeuvre-path"
        points={scene.poses.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={colors.accent}
        strokeOpacity={0.3}
        strokeWidth={2}
        strokeDasharray="5 5"
        strokeLinecap="round"
      />
      {scene.poses.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.6} fill={colors.accent} fillOpacity={0.32} />
      ))}

      <Car pose={pose} />
    </Svg>
  );
}
