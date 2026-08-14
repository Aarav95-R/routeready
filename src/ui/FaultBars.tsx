import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useEffect } from "react";
import type { FaultCount } from "@/lib/homeView";
import { ENTER_STAGGER_MS, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";

const FILL_MS = 460;
const FIRST_DELAY_MS = 520;

/**
 * One row per fault kind, longest first.
 *
 * Rows below the leader are drawn in a muted green rather than the accent.
 * This is a de-emphasis, not a second encoding: the earlier version of this
 * component painted every row identically to keep it from competing with the
 * centre identity hues a card away — the same green must not mean "Goodmayes"
 * in one row and "Speeding" in the next. Desaturating the runners introduces
 * no new hue and no new meaning; it says *less* about rows two and three.
 *
 * Colour is never the only encoding. The count stays at the end of every row,
 * the leading tag is repeated verbatim as the card's headline above, and the
 * runners' labels drop to `ink3` alongside their bars.
 *
 * The length is the magnitude; a second encoding in colour would only add a
 * way to be wrong.
 */
function Bar({ fault, widest, index, dim }: {
  fault: FaultCount; widest: number; index: number; dim: boolean;
}) {
  const share = widest > 0 ? fault.count / widest : 0;
  const grown = useSharedValue(0);

  useEffect(() => {
    grown.value = 0;
    grown.value = withDelay(FIRST_DELAY_MS + index * ENTER_STAGGER_MS, withTiming(1, timing(FILL_MS)));
  }, [grown, index, share]);

  // Fills from the left, the direction a length is read.
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: grown.value }] }));

  return (
    <View className="flex-row items-center gap-3 py-[9px]">
      <Text
        className="w-[144px] text-[16.5px] text-slate-600"
        style={dim ? { color: colors.ink3 } : undefined}
        numberOfLines={1}
      >
        {fault.tag}
      </Text>
      <View className="h-3 flex-1 overflow-hidden rounded-full bg-[#EDEBE4]">
        <Animated.View
          testID={`fault-fill-${fault.tag}`}
          className="h-full rounded-full"
          style={[
            {
              width: `${Math.max(share, 0.06) * 100}%`,
              backgroundColor: dim ? colors.faultRunner : colors.accent,
              transformOrigin: "left",
            },
            style,
          ]}
        />
      </View>
      <Text className="w-6 text-right text-[15.5px] font-semibold text-slate-500">{fault.count}</Text>
    </View>
  );
}

export function FaultBars({ faults, lead = false }: { faults: FaultCount[]; lead?: boolean }) {
  if (faults.length === 0) return null;
  const widest = faults[0].count;
  return (
    <View testID="fault-bars" className="mt-2.5">
      {faults.map((fault, i) => (
        <Bar key={fault.tag} fault={fault} widest={widest} index={i} dim={lead && i > 0} />
      ))}
    </View>
  );
}
