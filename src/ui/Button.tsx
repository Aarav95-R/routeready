import { Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";

const bg = {
  go: "bg-accent",
  dark: "bg-primary",
  ghost: "bg-transparent border-[1.5px] border-slate-200",
  danger: "bg-danger",
} as const;
const fg = { go: "text-white", dark: "text-white", ghost: "text-primary", danger: "text-white" } as const;

export function Button({
  title, onPress, variant = "go", disabled = false, haptic = false,
}: {
  title: string; onPress: () => void; variant?: keyof typeof bg; disabled?: boolean; haptic?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={`min-h-[48px] items-center justify-center rounded-full px-6 py-3 ${bg[variant]} ${disabled ? "opacity-40" : ""} active:scale-[0.97] ${variant === "go" ? "active:bg-accent-pressed" : ""}`}
    >
      <Text className={`font-semibold text-[15px] ${fg[variant]}`}>{title}</Text>
    </Pressable>
  );
}
