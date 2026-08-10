import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { CentreIdentity } from "@/lib/centreIdentity";

// Three arcs whose radii and offsets come from the seed. Nothing here is
// hand-authored, so seeding a new centre never needs a design pass.
const noise = (seed: number, n: number) =>
  ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

/**
 * A centre as a tile: its colour, its generated mark, its monogram. The same
 * identity paints its pin on the map, which is what lets a learner match the
 * two without reading either label.
 */
export function CentreEmblem({ identity, size = 52 }: { identity: CentreIdentity; size?: number }) {
  const { hue, tint, initials, seed } = identity;
  return (
    <View
      testID="emblem"
      style={{
        width: size, height: size, borderRadius: size * 0.29, backgroundColor: tint,
        alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {[0, 1, 2].map((k) => (
          <Circle
            key={k}
            testID="emblem-arc"
            cx={(0.13 + noise(seed, k) * 0.74) * size}
            cy={(0.13 + noise(seed, k + 3) * 0.74) * size}
            r={(0.23 + noise(seed, k + 6) * 0.33) * size}
            fill="none"
            stroke={hue}
            strokeOpacity={0.1 + k * 0.05}
            strokeWidth={2 + k}
          />
        ))}
      </Svg>
      <Text
        testID="emblem-initials"
        style={{ fontSize: size * 0.35, fontWeight: "700", letterSpacing: -0.9, color: hue }}
      >
        {initials}
      </Text>
    </View>
  );
}
