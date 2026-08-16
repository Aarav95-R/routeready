import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { enterFrom, popIn } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, headline, largeTitle, subheadline, title2, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The way back into an account whose password was mistyped.
 *
 * `resetPasswordForEmail` was never wired, which made a typo unrecoverable
 * in-app: the magic link was the only route back, and it is presented as a
 * convenience rather than a rescue.
 *
 * On success the form is replaced rather than annotated. A confirmation
 * sitting under a still-filled form is the shape of an error message, and the
 * old sign-up screen read exactly that way.
 */
export default function Reset() {
  const router = useRouter();
  const sendPasswordReset = useSession((s) => s.sendPasswordReset);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.includes("@") && !busy;

  const send = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const err = await sendPasswordReset(email.trim());
    setBusy(false);
    if (err) { setError(err); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    else setSent(true);
  };

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.field, alignItems: "center", justifyContent: "center" }}>
        <Animated.View entering={popIn()} style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={34} color="#FFFFFF" />
        </Animated.View>
        <Animated.Text entering={enterFrom(1)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...title2, color: colors.label, paddingTop: 22 }}>
          Reset link sent
        </Animated.Text>
        <Animated.Text entering={enterFrom(2)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, textAlign: "center", paddingHorizontal: 30, paddingTop: 8 }}>
          Open it on this phone and you&apos;ll come straight back here to set a new one.
        </Animated.Text>
        <Animated.View entering={enterFrom(3)} style={{ paddingTop: 26 }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 44, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.accentPressed }}>Back to sign in</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingLeft: 12, paddingRight: 20 }}>
            <Ionicons name="chevron-back" size={22} color={colors.accentPressed} />
          </Pressable>

          <Animated.Text entering={enterFrom(1)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingTop: 4 }}>
            Reset your password.
          </Animated.Text>
          <Animated.Text entering={enterFrom(2)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}>
            We&apos;ll email you a link to set a new one. The old one keeps working until you do.
          </Animated.Text>

          <Animated.View entering={enterFrom(3)}>
            <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
              <AuthField
                testID="reset-email" placeholder="Email address" kind="email"
                value={email} onChangeText={(v) => { if (error) setError(null); setEmail(v); }}
                returnKeyType="send" onSubmitEditing={send}
              />
            </Group>
          </Animated.View>

          {error && (
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
              {error}
            </Text>
          )}

          <Animated.View entering={enterFrom(4)} style={{ paddingTop: 18 }}>
            <Pressable
              accessibilityRole="button" disabled={!canSubmit} onPress={send}
              style={{ marginHorizontal: 16, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, opacity: canSubmit ? 1 : 0.35 }}
            >
              {busy && <ActivityIndicator color="#FFFFFF" />}
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
                {busy ? "Sending…" : "Send reset link"}
              </Text>
            </Pressable>
          </Animated.View>
          <View style={{ flex: 1 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
