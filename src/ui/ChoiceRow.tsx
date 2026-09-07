import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { subheadline } from "@/ui/type";
import { usePressed } from "@/ui/usePressed";

/**
 * One option under a quiz question, and the five things it can be.
 *
 * Not a `Cell` from the list module, and deliberately so. A grouped-inset list
 * is one surface divided by hairlines; these are four independent surfaces
 * that colour, outline and fade separately, so they are separate cards with a
 * gap between them. Trying to express "this one is red and that one is green"
 * inside a single rounded group is what makes the hairlines fight the fills.
 */

export type ChoiceState = "idle" | "selected" | "correct" | "wrong" | "faded";

/**
 * Colour is never the only signal. Roughly one man in twelve cannot separate
 * the green fill from the red one, so the mark carries the answer too — and
 * the label is what a screen reader reads out, which is the same information
 * by a third route.
 */
const MARKS: Partial<Record<ChoiceState, { icon: "checkmark" | "close"; tint: string; label: string }>> = {
  correct: { icon: "checkmark", tint: colors.accent, label: "Correct answer" },
  wrong: { icon: "close", tint: colors.danger, label: "Your answer, incorrect" },
};

const GROUNDS: Record<ChoiceState, { backgroundColor: string; borderColor: string }> = {
  idle: { backgroundColor: colors.cell, borderColor: "transparent" },
  selected: { backgroundColor: colors.cell, borderColor: colors.accent },
  correct: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  wrong: { backgroundColor: colors.dangerTint, borderColor: colors.danger },
  faded: { backgroundColor: colors.cell, borderColor: "transparent" },
};

export function ChoiceRow({
  text, state, onPress, testID,
}: {
  text: string;
  state: ChoiceState;
  onPress?: () => void;
  testID?: string;
}) {
  // Once a question is marked its options are read-only. Re-tapping one must
  // not re-score it, and the round screen should not have to remember to stop
  // passing a handler.
  const answered = state === "correct" || state === "wrong" || state === "faded";
  const mark = MARKS[state];
  // Not Pressable's own `pressed` — see usePressed for why it cannot be used
  // in this app. These rows used to render with no fill and no border.
  const { pressed, pressProps } = usePressed();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: state === "selected", disabled: answered }}
      disabled={answered || !onPress}
      onPress={onPress}
      {...pressProps}
      // One flat object rather than an array, so there is a single shape for
      // NativeWind to resolve. The fade and the press tint cannot both apply:
      // a faded row is answered, and an answered row does not take presses.
      style={{
        minHeight: 44,
        borderRadius: 10,
        borderWidth: 1.5,
        paddingVertical: 13,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 11,
        ...GROUNDS[state],
        opacity: state === "faded" ? 0.42 : pressed && !answered ? 0.7 : 1,
      }}
    >
      <View style={{ width: 18, height: 18, marginTop: 1, alignItems: "center", justifyContent: "center" }}>
        {mark ? (
          <Ionicons name={mark.icon} size={17} color={mark.tint} accessibilityLabel={mark.label} />
        ) : (
          <View
            style={{
              width: 17, height: 17, borderRadius: 9, borderWidth: 1.5,
              borderColor: state === "selected" ? colors.accent : colors.separator,
              backgroundColor: state === "selected" ? colors.accent : "transparent",
            }}
          />
        )}
      </View>
      <Text style={{ ...subheadline, color: colors.label, flex: 1 }}>{text}</Text>
    </Pressable>
  );
}
