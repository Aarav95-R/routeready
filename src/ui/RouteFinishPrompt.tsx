import Ionicons from "@expo/vector-icons/Ionicons";
import Animated from "react-native-reanimated";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enterAfter } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

export type RouteFinishPromptProps = {
  visible: boolean;
  routeName: string;
  onKeepDriving: () => void;
  onEnd: () => void;
};

export function RouteFinishPrompt({
  visible,
  routeName,
  onKeepDriving,
  onEnd,
}: RouteFinishPromptProps) {
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
          <Ionicons name="checkmark" size={17} color={colors.accent} />
        </View>
        <Text className="text-[12px] font-bold text-accent-ink">Finish line confirmed</Text>
      </View>
      <View className="gap-1">
        <Text className="text-[20px] font-semibold text-primary" style={{ fontFamily: FACES["600"] }}>
          Route complete
        </Text>
        <Text className="text-[12px] text-slate-500" numberOfLines={2} adjustsFontSizeToFit>
          {routeName}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep driving"
          onPress={onKeepDriving}
          className="min-h-[50px] flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white active:bg-slate-50"
        >
          <Text className="text-[14px] font-semibold text-slate-600">Keep driving</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End route"
          onPress={onEnd}
          className="min-h-[50px] flex-[1.35] flex-row items-center justify-center gap-2 rounded-lg bg-primary active:bg-stone-800"
        >
          <Ionicons name="flag" size={17} color="#FFFFFF" />
          <Text className="text-[14px] font-semibold text-white">End route</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
