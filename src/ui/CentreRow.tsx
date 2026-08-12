import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { ViewCentre } from "@/lib/centresView";
import { CentreEmblem } from "@/ui/CentreEmblem";

/** Fixed, and exported, because the scroll-to-camera binding divides by it. */
export const CENTRE_ROW_H = 88;

const RING_SIZE = 44;
const RING_R = 19;
const RING_CIRC = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// The ring reads on a fixed 0-60% domain rather than 0-100. Pass rates live
// between 30 and 55, so on a 0-100 ring every centre would sit near half full
// and the graphic would carry no information at all.
const RING_DOMAIN = 60;

const miles = (m: number) => `${(m / 1609.34).toFixed(1)} mi away`;

/**
 * One centre in the sheet: its emblem, its name, how far off it is, and its
 * pass rate as a ring in its own colour. The row and its pin on the map share
 * an identity, which is the whole point of the layout.
 */
export function CentreRow({
  item, identity, active, index, onPress,
}: {
  item: ViewCentre;
  identity: CentreIdentity;
  active: boolean;
  index: number;
  onPress: () => void;
}) {
  const { centre, distanceM } = item;
  const rate = centre.pass_rate;
  const filled = rate === null ? 0 : Math.min(1, rate / RING_DOMAIN);

  const reducedMotion = useReducedMotion();
  const sweep = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) { sweep.value = 1; return; }
    sweep.value = withDelay(index * 60 + 160, withTiming(1, { duration: 950 }));
  }, [sweep, index, reducedMotion, filled]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRC * (1 - filled * sweep.value),
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(16)}>
      <Pressable
        testID="centre-row"
        accessibilityRole="button"
        accessibilityLabel={`${centre.name}, ${rate === null ? "pass rate unknown" : `${rate.toFixed(0)} percent pass rate`}`}
        onPress={onPress}
        style={{
          height: CENTRE_ROW_H,
          backgroundColor: active ? identity.tint : "#FFFFFF",
          flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16,
          borderBottomWidth: 1, borderBottomColor: "#F5F8FA",
        }}
      >
        {/* The tint alone could not carry this. Every one of the twelve was
            chosen to sit *behind* hue-coloured text, so #FFF1F2 against a
            white row is invisible at arm's length — the rail is what makes
            the active row findable without looking for it. */}
        {active && (
          <View
            testID="centre-row-rail"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: identity.hue }}
          />
        )}

        <CentreEmblem identity={identity} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            testID="centre-row-name"
            numberOfLines={1}
            style={{ fontSize: 16.5, fontWeight: "700", letterSpacing: -0.5, color: "#0F172A" }}
          >
            {centre.name}
          </Text>
          <Text
            testID="centre-row-meta"
            numberOfLines={1}
            style={{ marginTop: 2, fontSize: 12, fontWeight: "500", color: "#64748B" }}
          >
            {distanceM !== null ? miles(distanceM) : centre.region ?? ""}
          </Text>
        </View>

        <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke={identity.tint} strokeWidth={4.5} />
            <AnimatedCircle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none"
              stroke={identity.hue} strokeWidth={4.5} strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              animatedProps={arcProps}
            />
          </Svg>
          <Text
            testID="centre-row-rate"
            style={{ fontSize: 12.5, fontWeight: "700", letterSpacing: -0.5, color: "#0F172A" }}
          >
            {rate === null ? "—" : `${rate.toFixed(0)}%`}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
