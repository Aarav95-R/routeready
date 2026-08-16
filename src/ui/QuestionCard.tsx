import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, caption, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * One card of the sign-up interview: a question, the reason for asking, and
 * whatever answers it.
 *
 * Presentational only. It does not store an answer, does not know which card
 * it is, and does not advance — the screen owns all three, which is what lets
 * a card be rendered before its options have loaded.
 *
 * The heading enters first and each child follows one stagger behind, so the
 * question is readable before the answers arrive rather than the whole card
 * landing at once.
 */
export function QuestionCard({
  title, subtitle, children,
}: { title: string; subtitle: string; children?: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={{ flex: 1 }}>
      <Animated.Text
        entering={enterFrom(0)}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingTop: 6 }}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        entering={enterFrom(1)}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...subheadline, color: colors.labelSecondary, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}
      >
        {subtitle}
      </Animated.Text>
      {rows.map((row, i) => (
        // Index keys: these are static children in source order, not a
        // reorderable list.
        <Animated.View key={i} entering={enterFrom(i + 2)}>{row}</Animated.View>
      ))}
    </View>
  );
}

/**
 * One answer.
 *
 * The role is `radio` or `checkbox` rather than `button` because the two are
 * announced differently and behave differently: a multi-select reporting
 * itself as a radio tells a screen reader user their previous choice was
 * replaced when it was not.
 */
export function ChoiceRow({
  label, sub, selected, multi = false, onPress, testID,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
      style={{
        minHeight: 44, paddingHorizontal: 16, paddingVertical: 13,
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: colors.cell,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          style={{ ...body, color: colors.label, fontWeight: selected ? "600" : body.fontWeight }}
        >
          {label}
        </Text>
        {sub && (
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelSecondary, marginTop: 1 }}>
            {sub}
          </Text>
        )}
      </View>
      {selected && <Ionicons testID="choice-tick" name="checkmark" size={19} color={colors.accent} />}
    </Pressable>
  );
}
