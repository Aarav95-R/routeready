import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { Centre } from "@/types/db";

const PIN_W = 30;
const PIN_H = 40;
const CALLOUT_W = 152;

const miles = (m: number) => `${(m / 1609.34).toFixed(1)} mi away`;

/**
 * The one centre the sheet is currently on, drawn as a real view rather than
 * a map layer.
 *
 * The other pins are a CircleLayer, which is cheap and static — and static is
 * the problem: a layer's `circleRadius` reads `["case", ["get","active"], …]`,
 * so when the active centre changes it is the *source data* that changed, not
 * the property, and Mapbox's paint transitions only animate a property's own
 * value. The radius snapped with nothing in between. A view can spring.
 *
 * Only ever one of these is mounted, so the cost scales with how many centres
 * are active rather than with how many exist.
 */
export function ActiveCentreMarker({
  centre, identity, distanceM,
}: {
  centre: Centre;
  identity: CentreIdentity;
  /** Straight line from the driver; null when there is no fix. */
  distanceM: number | null;
}) {
  const reducedMotion = useReducedMotion();
  const pop = useSharedValue(reducedMotion ? 1 : 0);

  // Keyed on the centre, so arriving at a new one pops again rather than
  // sliding a pin that is already up.
  useEffect(() => {
    if (reducedMotion) { pop.value = 1; return; }
    pop.value = 0;
    pop.value = withSequence(
      withTiming(1.42, { duration: 190 }),
      withSpring(1, { damping: 11, stiffness: 190 })
    );
  }, [centre.id, pop, reducedMotion]);

  // The pin overshoots to 1.42 and settles at 1.24 — it never leaves the
  // ground, which keeps it from covering the neighbours it sits between.
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.24 }],
  }));

  // The callout holds still while the pin moves: text that springs is text
  // you cannot read.
  const calloutStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value),
    transform: [{ scale: 0.86 + Math.min(1, pop.value) * 0.14 }],
  }));

  const rate = centre.pass_rate;

  return (
    <View
      testID="active-marker"
      style={{ alignItems: "center", width: CALLOUT_W }}
      accessibilityLabel={`${centre.name}, ${rate === null ? "pass rate unknown" : `${rate.toFixed(0)} percent pass rate`}${distanceM !== null ? `, ${miles(distanceM)}` : ""}`}
    >
      <Animated.View
        style={[
          calloutStyle,
          {
            width: CALLOUT_W, borderRadius: 13, backgroundColor: "#FFFFFF",
            paddingVertical: 9, paddingHorizontal: 12, alignItems: "center",
            shadowColor: "#0F172A", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
          },
        ]}
      >
        <Text testID="active-marker-name" numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", letterSpacing: -0.4, color: "#0F172A" }}>
          {centre.name}
        </Text>
        <Text testID="active-marker-rate" style={{ marginTop: 2, fontSize: 11.5, fontWeight: "700", color: identity.hue }}>
          {rate === null ? "Pass rate unknown" : `${rate.toFixed(0)}% pass rate`}
        </Text>
        {distanceM !== null && (
          <Text testID="active-marker-distance" style={{ marginTop: 1, fontSize: 11, fontWeight: "500", color: "#64748B" }}>
            {miles(distanceM)}
          </Text>
        )}
      </Animated.View>

      {/* The tail, pointing down at the pin the callout belongs to. */}
      <View
        style={{
          width: 0, height: 0, marginTop: -1,
          borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8,
          borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF",
        }}
      />

      <Animated.View style={[pinStyle, { marginTop: 2 }]}>
        <Svg width={PIN_W} height={PIN_H} viewBox="0 0 30 40">
          <Path
            d="M15 39 C5.1 26 0 19.4 0 13 A15 15 0 0 1 30 13 C30 19.4 24.9 26 15 39 Z"
            fill={identity.hue}
            stroke="#FFFFFF"
            strokeWidth={2.5}
          />
        </Svg>
        <Text
          testID="active-marker-initials"
          style={{
            position: "absolute", width: PIN_W, top: 5,
            textAlign: "center", fontSize: 12, fontWeight: "700",
            letterSpacing: -0.4, color: "#FFFFFF",
          }}
        >
          {identity.initials}
        </Text>
      </Animated.View>
    </View>
  );
}
