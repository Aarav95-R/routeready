import { useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CODE_LENGTH, normaliseCode } from "@/lib/otpCode";
import { colors } from "@/ui/theme";
import { FACES, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * Six boxes with one real input behind them.
 *
 * Six separate `TextInput`s is the obvious build and the wrong one: it has to
 * hand focus along on every keystroke, backspace out of an empty box into the
 * previous one, and split a six-character paste across six controls that each
 * think they hold one character. One transparent full-bleed input avoids all
 * of it — the boxes become presentation, and paste, autofill and backspace are
 * the platform's own behaviour rather than ours to reimplement.
 *
 * The value is normalised on the way in rather than validated on the way out,
 * so this component cannot hold a string that `verifyOtp` would reject.
 */
export function CodeField({
  value, onChangeText, invalid = false, autoFocus = true,
}: {
  value: string;
  onChangeText: (code: string) => void;
  /** Every box goes red — which digit was wrong is not knowable. */
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");
  // The box the next digit lands in, so it can carry the accent. Once the code
  // is full there is no next box and nothing is highlighted.
  const cursor = value.length < CODE_LENGTH ? value.length : -1;

  const border = (i: number) => {
    if (invalid) return colors.danger;
    return i === cursor ? colors.accent : colors.separator;
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enter the code"
      onPress={() => input.current?.focus()}
      style={{ flexDirection: "row", justifyContent: "center", gap: 9, paddingHorizontal: 16 }}
    >
      {boxes.map((digit, i) => (
        <View
          key={i}
          testID={`code-box-${i}`}
          style={{
            width: 46, height: 56, borderRadius: 12,
            backgroundColor: colors.cell,
            borderWidth: 1.5, borderColor: border(i),
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{ fontSize: 26, lineHeight: 32, fontFamily: FACES["700"], fontWeight: "700", color: colors.label }}
          >
            {digit}
          </Text>
        </View>
      ))}
      <TextInput
        ref={input}
        accessibilityLabel="Verification code"
        value={value}
        onChangeText={(raw) => onChangeText(normaliseCode(raw))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={CODE_LENGTH}
        // Invisible rather than absent: it has to be focusable and hold the
        // caret, and a zero-size input does not reliably take focus on iOS.
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
      />
    </Pressable>
  );
}
