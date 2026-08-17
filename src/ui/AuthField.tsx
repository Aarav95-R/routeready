import { useState, type RefObject } from "react";
import { Pressable, TextInput, View, type ReturnKeyTypeOptions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/ui/theme";
import { body, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * One row of a credentials group.
 *
 * It exists for its attributes rather than its looks. Neither auth screen set
 * `textContentType` or `autoComplete` on any field, so iOS offered no Keychain
 * fill on sign-in and no generated strong password on sign-up, and `Return`
 * dismissed the keyboard instead of moving to the next field. Putting the four
 * kinds in one place is what stops the next field that gets added forgetting
 * them again.
 */

type Kind = "email" | "password" | "newPassword" | "name";

/**
 * `password` and `newPassword` are different requests, not the same one with
 * different copy: the first asks iOS for a saved credential, the second asks
 * it to generate and offer a strong one. Getting them the wrong way round is
 * why some apps offer to save a password you have not typed yet.
 */
const KINDS = {
  email: {
    textContentType: "emailAddress", autoComplete: "email" as const,
    keyboardType: "email-address" as const, autoCapitalize: "none" as const, secure: false,
  },
  password: {
    textContentType: "password", autoComplete: "current-password" as const,
    keyboardType: "default" as const, autoCapitalize: "none" as const, secure: true,
  },
  newPassword: {
    textContentType: "newPassword", autoComplete: "new-password" as const,
    keyboardType: "default" as const, autoCapitalize: "none" as const, secure: true,
  },
  name: {
    textContentType: "givenName", autoComplete: "given-name" as const,
    keyboardType: "default" as const, autoCapitalize: "words" as const, secure: false,
  },
} as const satisfies Record<Kind, unknown>;

export function AuthField({
  placeholder, kind, value, onChangeText, inputRef, returnKeyType = "next", onSubmitEditing, trailing,
}: {
  placeholder: string;
  kind: Kind;
  value: string;
  onChangeText: (value: string) => void;
  inputRef?: RefObject<TextInput | null>;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  /** A tick, a spinner — anything the screen wants to sit at the trailing edge. */
  trailing?: React.ReactNode;
}) {
  const spec = KINDS[kind];
  const [revealed, setRevealed] = useState(false);
  const hidden = spec.secure && !revealed;

  return (
    <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10 }}>
      <TextInput
        ref={inputRef}
        // The placeholder doubles as the label: it is what the person sees,
        // so it is what a screen reader should say and what a test should
        // look for. A separate label would be a third name for one field.
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.labelTertiary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        blurOnSubmit={returnKeyType === "done"}
        secureTextEntry={hidden}
        textContentType={spec.textContentType}
        autoComplete={spec.autoComplete}
        keyboardType={spec.keyboardType}
        autoCapitalize={spec.autoCapitalize}
        autoCorrect={false}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        style={{ ...body, flex: 1, color: colors.label, paddingVertical: 12 }}
      />
      {trailing}
      {spec.secure && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
          hitSlop={10}
          onPress={() => setRevealed((r) => !r)}
        >
          <Ionicons name={revealed ? "eye-off-outline" : "eye-outline"} size={19} color={colors.labelTertiary} />
        </Pressable>
      )}
    </View>
  );
}
