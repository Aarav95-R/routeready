import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { headline, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";

/**
 * The strip a just-created account sees above everything else on Home.
 *
 * Home already sent a new learner to Centres twice — the action in the Start
 * here card and the same action repeated after the introduction — so this is
 * not a third way in for want of one. It is here because neither of those says
 * anything about the account having *just been made*: both are written for an
 * empty record, which is a state you can also be in on your fourth launch.
 *
 * It is clay, and that is the whole reason it can sit above a card that already
 * carries a green button. Green is the road — go, route, primary action — and
 * clay is you. Signing up is about you, so the welcome takes clay and the drive
 * below keeps green, and the two never ask for the same glance. A second green
 * button stacked here was the version of this worth rejecting.
 *
 * Presentational: it decides nothing about when it appears, which is Home's
 * job, and remembers nothing, which is `services/welcome`'s.
 */

/**
 * The copy, as data rather than as JSX text — the same way NextStepCard and
 * FirstRun hold theirs. It keeps the three lines readable against each other,
 * and it keeps apostrophes as plain characters rather than entities.
 */
const COPY = {
  title: "You're all set up",
  detail: "Your account is ready. Practice starts at a test centre near you.",
  action: "Browse test centres",
} as const;
export function WelcomeBanner({
  onBrowse, onDismiss,
}: { onBrowse: () => void; onDismiss: () => void }) {
  return (
    <View
      testID="welcome-banner"
      style={{
        marginHorizontal: 16,
        backgroundColor: colors.clayTint,
        borderRadius: 10,
        padding: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{ ...headline, color: colors.label }}
          >
            {COPY.title}
          </Text>
          <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 4 }}>
            {COPY.detail}
          </Text>
        </View>
        {/* Small, unfilled and last in the reading order. Its job is to let
            somebody who is not going to Centres tonight put the strip away —
            not to compete with the action beneath it. */}
        <Pressable
          testID="welcome-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss welcome"
          hitSlop={12}
          onPress={onDismiss}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={18} color={colors.labelTertiary} />
        </Pressable>
      </View>

      <Pressable
        testID="welcome-action"
        accessibilityRole="button"
        onPress={onBrowse}
        style={({ pressed }) => [
          {
            marginTop: 14,
            alignItems: "center",
            borderRadius: 12,
            backgroundColor: colors.clay,
            paddingVertical: 12,
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
          {COPY.action}
        </Text>
      </Pressable>
    </View>
  );
}
