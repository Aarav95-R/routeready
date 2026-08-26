import Ionicons from "@expo/vector-icons/Ionicons";
import Animated from "react-native-reanimated";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enterAfter } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

export type RouteStartPromptProps = {
  visible: boolean;
  routeName: string;
  detail: string | null;
  onBegin: () => void;
  onWait: () => void;
};

export function RouteStartPrompt({
  visible,
  routeName,
  detail,
  onBegin,
  onWait,
}: RouteStartPromptProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Animated.View
      entering={enterAfter(0)}
      className="absolute bottom-0 left-0 right-0 gap-3 rounded-t-lg bg-card px-4 pt-4"
      style={{
        paddingBottom: insets.bottom + 14,
        shadowColor: colors.primary,
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -5 },
      }}
      accessibilityViewIsModal
    >
      <View className="flex-row items-center gap-2">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-emerald-50">
          <Ionicons name="location" size={15} color={colors.accent} />
        </View>
        <Text className="text-[12px] font-bold text-accent-ink">Start line confirmed</Text>
      </View>
      <View className="gap-1">
        <Text className="text-[20px] font-semibold text-primary" style={{ fontFamily: FACES["600"] }}>
          Ready to begin?
        </Text>
        <Text className="text-[14px] font-semibold text-primary" numberOfLines={2} adjustsFontSizeToFit>
          {routeName}
        </Text>
        {detail !== null && <Text className="text-[12px] text-slate-500">{detail}</Text>}
      </View>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wait here"
          onPress={onWait}
          className="min-h-[50px] flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white active:bg-slate-50"
        >
          <Text className="text-[14px] font-semibold text-slate-600">Wait here</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Begin route"
          onPress={onBegin}
          className="min-h-[50px] flex-[1.35] flex-row items-center justify-center gap-2 rounded-lg bg-accent active:bg-accent-pressed"
        >
          <Ionicons name="navigate" size={18} color="#FFFFFF" />
          <Text className="text-[14px] font-semibold text-white">Begin route</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
