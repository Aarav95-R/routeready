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
  value, onChangeText, invalid = false, busy = false, autoFocus = true,
}: {
  value: string;
  onChangeText: (code: string) => void;
  /** Every box goes red — which digit was wrong is not knowable. */
  invalid?: boolean;
  /**
   * True while a submitted code is being checked against the server.
   *
   * Without this the screen looked identical whether a keystroke was ignored
   * or a slow Auth service was still thinking — this project has measured
   * that service taking 52-86 seconds on an ordinary call. Dimming is the
   * whole affordance; no spinner, so the boxes stay the only thing on screen.
   */
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");
  // The box the next digit lands in, so it can carry the accent. Once the code
  // is full, or a submitted code is being checked, there is no next box to
  // highlight.
  const cursor = busy || value.length >= CODE_LENGTH ? -1 : value.length;

  const border = (i: number) => {
    if (invalid) return colors.danger;
    return i === cursor ? colors.accent : colors.separator;
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enter the code"
      // Pressable defaults to `accessible: true`, which collapses this whole
      // subtree into one opaque accessibility node — the TextInput's own
      // label below would never reach VoiceOver/TalkBack. `accessible={false}`
      // lets the label that actually matters through.
      accessible={false}
      // Ordinary touch never reaches this: the full-bleed TextInput sits on
      // top and claims the responder first. This exists for the assistive-tech
      // activation path, where the label above is what gets tapped.
      onPress={() => input.current?.focus()}
      style={{ flexDirection: "row", justifyContent: "center", gap: 9, paddingHorizontal: 16, opacity: busy ? 0.5 : 1 }}
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
