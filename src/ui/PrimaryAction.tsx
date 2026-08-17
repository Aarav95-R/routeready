import { Pressable, Text } from "react-native";
import { colors } from "@/ui/theme";
import { headline, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * The green action, as it sits inside a grouped-list cell.
 *
 * Lifted out of NextStepCard when the first-run screen grew long enough to
 * need the same action twice — once in the card at the top and once at the
 * end of the introduction. Two copies of the styling is how a pressed state
 * or a radius ends up differing between two buttons that are meant to be the
 * same button said twice.
 */
export function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: "center",
          borderRadius: 12,
          backgroundColor: colors.accent,
          paddingVertical: 14,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
        {label}
      </Text>
    </Pressable>
  );
}
