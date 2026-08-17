import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import type { Attempt } from "@/lib/homeView";
import { DECELERATE, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const DRAW_MS = 640;
const DRAW_DELAY_MS = 200;
/** Room above the highest score and below the lowest, so dots never touch the edge. */
const PAD_Y = 8;
const PAD_X = 6;

type Point = { x: number; y: number };

/**
 * A shape, not a scale.
 *
 * The full line chart this replaced carried a zero-based axis, because a
 * truncated one turns a four-point wobble into a cliff. This draws no axis at
 * all, which is the other honest option: it fits the band the scores actually
 * occupy, and the screen labels both ends in words underneath. What it must
 * never do is imply a scale it is not drawing.
 *
 * Points are evenly spaced rather than placed in time. Six attempts are six
 * marks; the gaps between them are not to be read.
 */
export function sparkPoints(scores: number[], width: number, height: number): Point[] {
  if (scores.length === 0) return [];

  const innerW = Math.max(1, width - PAD_X * 2);
  const innerH = Math.max(1, height - PAD_Y * 2);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  // A flat run has no band to fit, so it sits on the middle line rather than
  // dividing by zero and flying off the top.
  const span = hi - lo;

  return scores.map((score, i) => ({
    x: PAD_X + (scores.length === 1 ? innerW / 2 : (innerW * i) / (scores.length - 1)),
    y: PAD_Y + (span === 0 ? innerH / 2 : innerH * (1 - (score - lo) / span)),
  }));
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

export function ScoreSparkline({
  attempts, width, height = 52,
}: {
  attempts: Attempt[];
  width: number;
  height?: number;
}) {
  const points = useMemo(
    () => sparkPoints(attempts.map((a) => a.score), width, height),
    [attempts, width, height]
  );
  const length = useMemo(() => polylineLength(points), [points]);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const area = points.length
    ? `${line} L${points[points.length - 1].x} ${height} L${points[0].x} ${height} Z`
    : "";

  // 1 holds the whole line off the canvas; 0 has it fully drawn. The same
  // device RouteThumbnail uses, on the same curve — a score line and a route
  // line are the same gesture at different scales.
  const hidden = useSharedValue(1);
  useEffect(() => {
    hidden.value = 1;
    hidden.value = withDelay(DRAW_DELAY_MS, withTiming(0, { duration: DRAW_MS, easing: DECELERATE }));
  }, [hidden, line]);

  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: length * hidden.value }));

  // The wash follows the line rather than arriving with it, so the shape reads
  // before the fill under it does.
  const washed = useSharedValue(0);
  useEffect(() => {
    washed.value = 0;
    washed.value = withDelay(DRAW_DELAY_MS + 140, withTiming(1, timing(520)));
  }, [washed, line]);
  const washProps = useAnimatedProps(() => ({ opacity: washed.value * 0.1 }));

  if (points.length === 0) return <View testID="spark-empty" style={{ width, height }} />;

  const last = points[points.length - 1];
  // Marks scale with the box rather than sitting at one fixed size, so the
  // same component reads correctly at 52pt in a tight card and at 78pt on the
  // home screen — a 3pt dot on a tall chart looks like dust.
  const dot = Math.max(3, height * 0.058);
  const stroke = Math.max(2, height * 0.038);

  return (
    <View testID="spark" style={{ width, height }}>
      <Svg width={width} height={height}>
        <AnimatedPath d={area} fill={colors.accent} animatedProps={washProps} />
        <AnimatedPath
          d={line}
          stroke={colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={length}
          animatedProps={drawProps}
        />
        {/* Every attempt keeps a dot: six tests should stay six countable
            things, which is the one thing a bare sparkline gives up. */}
        {points.slice(0, -1).map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={dot} fill={colors.card} stroke={colors.accent} strokeWidth={stroke} />
        ))}
        <Circle
          testID="spark-latest"
          cx={last.x} cy={last.y} r={dot * 1.5}
          fill={colors.accent} stroke={colors.card} strokeWidth={stroke}
        />
      </Svg>
    </View>
  );
}
