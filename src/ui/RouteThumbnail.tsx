import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { projectZones, thumbPath } from "@/lib/routeThumb";
import type { GeoLineString, ObservationZone } from "@/types/db";
import { colors } from "@/ui/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const DRAW_MS = 900;

function polylineLength(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/**
 * A route's own shape, drawn small.
 *
 * This is the piece that stops three routes at a centre looking like the same
 * route: a town loop and a main-road run are different shapes, and until now
 * that difference was a tap away. It draws the polyline itself rather than
 * loading map tiles — a list of these has to scroll, and tiles for every row
 * would cost far more than the faint street hints below buy.
 */
export function RouteThumbnail({
  geometry, zones = [], numbered = [], width, height = 88, drawDelayMs = 0, youAreHere = false,
}: {
  geometry: GeoLineString;
  zones?: ObservationZone[];
  /**
   * Points that get a numeral rather than a dot, drawn in the order given.
   * The number is the whole point: it is what lets a row in a list below say
   * which mark on the line it is talking about.
   */
  numbered?: { lat: number; lng: number }[];
  width: number;
  height?: number;
  drawDelayMs?: number;
  /**
   * Draw the start marker as the person rather than as the road: a clay dot in
   * a clay halo, per the split theme.ts sets out. Used on the one screen where
   * the route is an example rather than a route you chose — the first-run home
   * card, where nobody has driven anything yet and the point of the drawing is
   * that you are already standing on it.
   */
  youAreHere?: boolean;
}) {
  const thumb = useMemo(
    () => thumbPath(geometry?.coordinates ?? [], width, height, 12),
    [geometry, width, height]
  );
  const length = useMemo(() => polylineLength(thumb.points), [thumb]);
  const pins = useMemo(() => projectZones(thumb, zones), [thumb, zones]);
  // Same transform as the line, so a hazard recorded slightly off the polyline
  // is drawn slightly off it too rather than being snapped onto it.
  const marks = useMemo(() => numbered.map((n) => thumb.project(n.lng, n.lat)), [thumb, numbered]);

  // 1 holds the whole line off the canvas; 0 has it fully drawn.
  const hidden = useSharedValue(1);
  useEffect(() => {
    hidden.value = 1;
    hidden.value = withDelay(drawDelayMs, withTiming(0, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) }));
  }, [hidden, drawDelayMs, thumb]);

  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: length * hidden.value }));

  if (!thumb.d) return <View style={{ width, height }} testID="route-thumb-empty" />;

  return (
    <View style={{ width, height }} testID="route-thumb">
      <Svg width={width} height={height}>
        {/* Faint street hints — enough to read the line as a map, not so much
            that it competes with the route. */}
        <Line x1={0} y1={height * 0.3} x2={width} y2={height * 0.3} stroke={colors.line} strokeWidth={1.2} />
        <Line x1={0} y1={height * 0.72} x2={width} y2={height * 0.72} stroke={colors.line} strokeWidth={1.2} />
        <Line x1={width * 0.28} y1={0} x2={width * 0.28} y2={height} stroke={colors.line} strokeWidth={1.2} />
        <Line x1={width * 0.68} y1={0} x2={width * 0.68} y2={height} stroke={colors.line} strokeWidth={1.2} />

        <AnimatedPath
          d={thumb.d}
          stroke={colors.accent}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={length}
          animatedProps={drawProps}
        />

        {pins.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill={colors.warning} />
        ))}

        {thumb.start && youAreHere && (
          <Circle cx={thumb.start.x} cy={thumb.start.y} r={9} fill={colors.clayTint} />
        )}
        {thumb.start && (
          <Circle
            testID="thumb-start"
            cx={thumb.start.x}
            cy={thumb.start.y}
            r={5}
            fill={youAreHere ? colors.clay : "#fff"}
            stroke={youAreHere ? colors.clayTint : colors.accent}
            strokeWidth={3}
          />
        )}

        {/* Drawn last so a numbered mark is never buried under the start dot
            or a zone pin it happens to share a corner with. */}
        {marks.map((p, i) => (
          <Circle key={`m${i}`} testID={`thumb-mark-${i + 1}`} cx={p.x} cy={p.y} r={9.5} fill={colors.warning} stroke="#fff" strokeWidth={2} />
        ))}
        {marks.map((p, i) => (
          <SvgText
            key={`t${i}`} x={p.x} y={p.y + 3.4} fontSize={9.5} fontWeight="bold"
            fill="#fff" textAnchor="middle"
          >
            {i + 1}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
