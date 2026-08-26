import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

export type DriveChromeProps = {
  eyebrow: string;
  distanceLabel: string;
  instruction: string;
  nextInstruction: string | null;
  speedMph: number;
  remainingLabel: string;
  following: boolean;
  onRecenter: () => void;
  onStop?: () => void;
  tone?: "go" | "off";
};

export function DriveChrome({
  eyebrow,
  distanceLabel,
  instruction,
  nextInstruction,
  speedMph,
  remainingLabel,
  following,
  onRecenter,
  onStop,
  tone = "go",
}: DriveChromeProps) {
  const insets = useSafeAreaInsets();
  const off = tone === "off";
  const accent = off ? colors.warning : colors.accent;

  return (
    <>
      <View
        testID="drive-guidance-deck"
        className="absolute left-3 right-3 overflow-hidden rounded-lg bg-primary"
        style={{
          top: insets.top + 10,
          borderTopColor: accent,
          borderTopWidth: 4,
          shadowColor: colors.primary,
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
        }}
      >
        <View className="flex-row items-center justify-between px-3 pb-1 pt-2">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name={off ? "warning-outline" : "navigate-outline"} size={13} color={accent} />
            <Text className="text-[10px] font-bold uppercase text-slate-300" numberOfLines={1}>
              {eyebrow}
            </Text>
          </View>
          <Text className="text-[12px] font-bold" style={{ color: accent }}>{distanceLabel}</Text>
        </View>
        <Text
          className="px-3 pb-2 text-[18px] font-semibold leading-[22px] text-white"
          style={{ fontFamily: FACES["600"] }}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          {instruction}
        </Text>
        {nextInstruction !== null && (
          <View className="flex-row items-center gap-2 border-t border-white/10 px-3 py-2">
            <Ionicons name="arrow-up" size={13} color="#A8A29E" />
            <Text className="flex-1 text-[11px] text-stone-300" numberOfLines={1}>{nextInstruction}</Text>
          </View>
        )}
      </View>

      {!following && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map"
          onPress={onRecenter}
          className="absolute right-3 h-11 w-11 items-center justify-center rounded-full bg-white"
          style={{ bottom: insets.bottom + 82, shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 8 }}
        >
          <Ionicons name="locate" size={21} color={colors.primary} />
        </Pressable>
      )}

      <View
        testID="drive-bottom-rail"
        className="absolute bottom-0 left-0 right-0 min-h-[68px] flex-row items-center bg-card px-4"
        style={{
          paddingBottom: insets.bottom,
          borderTopColor: "#E4DFD8",
          borderTopWidth: 1,
        }}
      >
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase text-slate-500">Remaining</Text>
          <Text className="text-[16px] font-semibold text-primary" numberOfLines={1} adjustsFontSizeToFit>
            {remainingLabel}
          </Text>
        </View>
        <View className="mx-4 h-8 w-px bg-stone-200" />
        <View className="min-w-[72px] items-end">
          <Text className="text-[10px] font-bold uppercase text-slate-500">Speed</Text>
          <Text className="text-[16px] font-semibold text-primary">{Math.max(0, Math.round(speedMph))} mph</Text>
        </View>
        {onStop && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop route"
            onPress={onStop}
            className="ml-3 h-10 w-10 items-center justify-center rounded-lg bg-red-50 active:bg-red-100"
          >
            <Ionicons name="stop" size={18} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </>
  );
}
