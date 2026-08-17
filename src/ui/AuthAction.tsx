import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "@/ui/theme";
import { headline, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * The primary action on an auth screen.
 *
 * Shared by sign-in, reset and all five cards of sign-up, because the same
 * button written three times is how three buttons end up disagreeing about
 * what "busy" looks like.
 *
 * Busy and disabled both refuse the tap but they are not the same state: busy
 * says what is happening and keeps a spinner running, because a button that
 * only greys out looks like it failed. The spinner is the one thing in the app
 * off the decelerating curve, and it earns it — it reports progress rather
 * than arriving anywhere, and a decelerating spinner reads as a stall.
 */
export function AuthAction({
  label, busyLabel, onPress, enabled = true, busy = false,
}: {
  label: string;
  busyLabel?: string;
  onPress: () => void;
  enabled?: boolean;
  busy?: boolean;
}) {
  const live = enabled && !busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !live, busy }}
      disabled={!live}
      onPress={onPress}
      style={{
        marginHorizontal: 16,
        minHeight: 50,
        borderRadius: 13,
        backgroundColor: colors.accent,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        opacity: live ? 1 : 0.35,
      }}
    >
      {busy && (
        <View testID="action-spinner">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
        {busy ? busyLabel ?? label : label}
      </Text>
    </Pressable>
  );
}
