import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withDelay, withTiming } from "react-native-reanimated";
import type { Level, Strength } from "@/lib/passwordStrength";
import { ENTER_MS, ENTER_STAGGER_MS, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { caption, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * Four segments and a sentence.
 *
 * Four because there are four things worth having in a password, and each
 * segment is one of them earned. The colour is the app's existing danger /
 * warning / accent vocabulary, so the meter introduces no new meaning to the
 * palette — the same argument `DriveModeRow` makes for its washes.
 *
 * Purely presentational: it renders a `Strength` and neither computes one nor
 * decides anything. `passwordStrength` owns the scoring and is tested without
 * a screen.
 */

const COLOUR: Record<Level, string> = {
  empty: colors.labelTertiary,
  short: colors.danger,
  weak: colors.warning,
  fair: colors.warning,
  good: colors.accent,
  strong: colors.accent,
};

function Segment({ index, filled, colour }: { index: number; filled: boolean; colour: string }) {
  const reduced = useReducedMotion();

  // `withTiming` is imperative, so Reanimated's ReduceMotion.System default —
  // which covers the layout builders in motion.ts — does not reach it. Without
  // this check the one setting meant to calm the screen leaves the busiest
  // thing on it moving.
  const style = useAnimatedStyle(() => {
    const target = filled ? 1 : 0;
    return {
      transform: [{
        scaleX: reduced
          ? target
          : withDelay(index * ENTER_STAGGER_MS, withTiming(target, timing(ENTER_MS))),
      }],
      backgroundColor: reduced ? colour : withTiming(colour, timing(ENTER_MS)),
    };
  }, [filled, colour, reduced, index]);

  return (
    <View
      testID={`strength-segment-${index}`}
      style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden" }}
    >
      {/* `transformOrigin` needs RN 0.76+; this project is on 0.81. It is what
          makes the fill grow from the leading edge rather than from its own
          centre, which is the difference between filling and inflating. */}
      <Animated.View style={[{ height: "100%", width: "100%", borderRadius: 2, transformOrigin: "left" }, style]} />
    </View>
  );
}

export function StrengthMeter({ strength }: { strength: Strength }) {
  const colour = COLOUR[strength.level];

  return (
    <View
      accessible
      accessibilityLabel={`Password strength: ${strength.message}`}
      style={{ paddingHorizontal: 20, paddingTop: 10 }}
    >
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <Segment key={i} index={i} filled={i < strength.segments} colour={colour} />
        ))}
      </View>
      <Text
        testID="strength-label"
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...caption, color: colour, marginTop: 7, minHeight: 18 }}
      >
        {strength.message}
      </Text>
    </View>
  );
}
