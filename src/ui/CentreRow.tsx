import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { ViewCentre } from "@/lib/centresView";
import { CentreEmblem } from "@/ui/CentreEmblem";

/** Fixed, and exported, because the scroll-to-camera binding divides by it. */
export const CENTRE_ROW_H = 88;

const RING_SIZE = 44;
const RING_R = 19;
const RING_CIRC = 2 * Math.PI * RING_R;
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
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none"
              stroke={identity.hue} strokeWidth={4.5} strokeLinecap="round"
              strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - filled)}
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
