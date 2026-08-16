import { useState, type RefObject } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { colors } from "@/ui/theme";
import { body, footnote, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * One row of a credentials group.
 *
 * It exists for the four attributes rather than for the layout. `autoComplete`
 * and `textContentType` are what make iOS offer the Keychain on sign-in and a
 * generated password on sign-up, and they were on none of the fields — a
 * two-attribute omission that changes how the screen feels more than any
 * amount of restyling.
 *
 * `kind` rather than a pile of booleans: every field on both screens is one of
 * four things, and each of the four implies its keyboard, its capitalisation
 * and its autofill hint together. Setting them separately is how they drift
 * apart.
 */

const KIND = {
  email: {
    autoComplete: "email" as const,
    textContentType: "emailAddress" as const,
    keyboardType: "email-address" as const,
    autoCapitalize: "none" as const,
    secure: false,
  },
  password: {
    autoComplete: "current-password" as const,
    textContentType: "password" as const,
    keyboardType: "default" as const,
    autoCapitalize: "none" as const,
    secure: true,
  },
  newPassword: {
    autoComplete: "new-password" as const,
    textContentType: "newPassword" as const,
    keyboardType: "default" as const,
    autoCapitalize: "none" as const,
    secure: true,
  },
  name: {
    autoComplete: "given-name" as const,
    textContentType: "givenName" as const,
    keyboardType: "default" as const,
    autoCapitalize: "words" as const,
    secure: false,
  },
};

export function AuthField({
  placeholder, value, onChangeText, kind = "email",
  returnKeyType = "next", onSubmitEditing, inputRef, testID,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  kind?: keyof typeof KIND;
  returnKeyType?: "next" | "done" | "send";
  onSubmitEditing?: () => void;
  inputRef?: RefObject<TextInput | null>;
  testID?: string;
}) {
  const spec = KIND[kind];
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center" }}>
      <TextInput
        testID={testID}
        ref={inputRef}
        accessibilityLabel={placeholder}
        style={{ ...body, flex: 1, color: colors.label, padding: 0 }}
        maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
        placeholder={placeholder}
        placeholderTextColor={colors.labelTertiary}
        value={value}
        onChangeText={onChangeText}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoComplete={spec.autoComplete}
        textContentType={spec.textContentType}
        keyboardType={spec.keyboardType}
        autoCapitalize={spec.autoCapitalize}
        secureTextEntry={spec.secure && !revealed}
      />
      {spec.secure && (
        // Text rather than an eye glyph: two icons that differ by a slash are
        // read wrong at a glance, and the word is unambiguous at 13pt.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
          hitSlop={10}
          onPress={() => setRevealed((r) => !r)}
        >
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.accentPressed }}>
            {revealed ? "Hide" : "Show"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
