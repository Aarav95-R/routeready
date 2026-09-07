import { Pressable, Text } from "react-native";
import { colors } from "@/ui/theme";
import { headline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { usePressed } from "@/ui/usePressed";

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
  // Not Pressable's own `pressed` — see usePressed for why it cannot be used
  // in this app. This button used to render with no green at all.
  const { pressed, pressProps } = usePressed();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      {...pressProps}
      style={{
        flex: 1,
        alignItems: "center",
        borderRadius: 12,
        backgroundColor: colors.accent,
        paddingVertical: 14,
        opacity: pressed ? 0.8 : 1,
      }}
    >
      <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
        {label}
      </Text>
    </Pressable>
  );
}
