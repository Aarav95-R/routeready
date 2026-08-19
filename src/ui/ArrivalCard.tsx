import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

export type ArrivalCardProps = {
  /** What is about to be driven — usually the route's name. */
  title: string;
  /** The line under it; null drops it rather than leaving a gap. */
  detail: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
};

/**
 * The card that comes up on the start line, after being guided to it.
 *
 * Setting off used to happen inside the GPS callback: reaching the start
 * called beginRoute()/beginTest() directly, so the clock started and the first
 * fault became markable while the phone was still in the driver's hand. That
 * is a decision only the driver can make, and this is where they make it.
 *
 * Shared by the practice and mock screens for the same reason
 * RoutePreviewCard is — the two took the same shape once and drifted, and a
 * second copy of this markup is how that happens again. Positioning belongs to
 * the caller; this is the card itself.
 *
 * There is deliberately no matching card at the *other* end of the drive.
 * Closing the loop is not a decision — the driver is back at the test centre
 * and the drive is over — so the finish needs no tap.
 */
export function ArrivalCard({
  title, detail, primaryLabel, onPrimary, secondaryLabel, onSecondary,
}: ArrivalCardProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute bottom-0 left-0 right-0 gap-2.5 rounded-t-3xl bg-card px-4 pt-4"
      style={{ paddingBottom: insets.bottom + 14, shadowColor: "#221F1C", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } }}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name="location" size={16} color={colors.accent} />
        <Text className="text-[12.5px] font-bold tracking-tight text-accent-ink">{"You're at the start line"}</Text>
      </View>

      <Text className="text-[18px] font-semibold tracking-tight text-primary" style={{ fontFamily: FACES["600"] }}>{title}</Text>
      {detail !== null && <Text className="text-[12.5px] text-slate-500">{detail}</Text>}

      <Pressable
        onPress={onPrimary}
        accessibilityRole="button"
        className="mt-1 min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-accent active:bg-accent-pressed"
      >
        <Ionicons name="navigate" size={18} color="#fff" />
        <Text className="text-[16px] font-semibold text-white">{primaryLabel}</Text>
      </Pressable>

      <Pressable onPress={onSecondary} accessibilityRole="button" className="min-h-[40px] items-center justify-center">
        <Text className="text-[13px] font-semibold text-slate-500">{secondaryLabel}</Text>
      </Pressable>
    </View>
  );
}
