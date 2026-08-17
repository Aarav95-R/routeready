import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { body, caption, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * One card of the sign-up interview: a question, the reason for asking, and
 * whatever answers it.
 *
 * Presentational only. It does not store an answer, does not know which card
 * it is and does not advance — the screen owns all three, which is what lets a
 * card render before its options have loaded.
 *
 * **Nothing in here animates.** The card as a whole slides in from the screen
 * that owns it, and staggering the rows inside a card that is itself
 * travelling is two motions describing one event. It also keeps entering
 * layout animations from nesting inside a re-keyed wrapper, which is the
 * structure the first build of this flow crashed inside on a device.
 */
export function QuestionCard({
  title, subtitle, children,
}: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingTop: 6 }}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{
          ...subheadline, color: colors.labelSecondary,
          paddingHorizontal: 16, paddingTop: 6, paddingBottom: 20,
        }}
      >
        {subtitle}
      </Text>
      {children}
    </View>
  );
}

/**
 * One answer, as its own card rather than as a row of a grouped list.
 *
 * A chosen answer is drawn in clay: green means the road — go, route, correct,
 * the primary action — and an answer about the person is not that. Keeping
 * them apart is what lets the app have a warm accent at all without it ever
 * appearing on a live drive.
 *
 * The tick is not decoration. Colour alone is not a signal anyone can rely on.
 */
export function ChoiceRow({
  label, sub, icon, selected, multi = false, onPress, testID,
}: {
  label: string;
  sub?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      // A multi-select announcing itself as a radio tells a screen reader user
      // their previous choice was replaced when it was not.
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
      style={{
        minHeight: 52,
        marginHorizontal: 16,
        marginBottom: 9,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: 13,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: selected ? colors.clayTint : colors.cell,
        borderColor: selected ? colors.clay : colors.separator,
      }}
    >
      {icon && (
        <View
          style={{
            height: 34, width: 34, borderRadius: 10, alignItems: "center", justifyContent: "center",
            backgroundColor: selected ? "#F0D6C6" : colors.fill,
          }}
        >
          <Ionicons name={icon} size={17} color={selected ? colors.clay : colors.labelTertiary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          style={{ ...body, color: colors.label, fontWeight: "600" }}
        >
          {label}
        </Text>
        {sub && (
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{ ...caption, color: selected ? colors.clay : colors.labelTertiary, marginTop: 2 }}
          >
            {sub}
          </Text>
        )}
      </View>
      {selected && (
        // The testID sits on the wrapper rather than on Ionicons: the icon
        // renders a bare <Text /> with no props forwarded until its font
        // loads, so a testID on it is absent at first paint.
        <View
          testID="choice-tick"
          style={{
            height: 21, width: 21, borderRadius: 11, backgroundColor: colors.clay,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
        </View>
      )}
    </Pressable>
  );
}
