import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MIN_PASSWORD, passwordStrength } from "@/lib/passwordStrength";
import { AuthAction } from "@/ui/AuthAction";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { StrengthMeter } from "@/ui/StrengthMeter";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * Where a recovery link lands. `app/_layout.tsx` routes here — and only here
 * — for as long as `recovering` is set, from wherever the link happened to
 * open, so there is no way to carry a recovery session into the rest of the
 * app without this screen having run.
 *
 * There is deliberately no back button. The only two ways off this screen are
 * "set a new password" and "sign out" — going back would just be sent here
 * again by the redirect this screen exists to satisfy.
 */
export default function UpdatePassword() {
  const updatePassword = useSession((s) => s.updatePassword);
  const signOut = useSession((s) => s.signOut);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const strength = passwordStrength(password);
  const canSubmit = password.length >= MIN_PASSWORD && confirm === password;

  const submit = async () => {
    if (busy || !canSubmit) return;
    setError(null);
    setBusy(true);
    const failure = await updatePassword(password);
    setBusy(false);
    if (!failure) return;
    setError(failure);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enterFrom(0)} style={{ paddingHorizontal: 16, paddingBottom: 26, gap: 14 }}>
            <View style={{ height: 56, width: 56, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="lock-open-outline" size={26} color="#FFFFFF" />
            </View>
            <View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
                Set a new password
              </Text>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingTop: 6 }}>
                {"Choose something you haven't used here before."}
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={enterFrom(1)}>
            <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
              <AuthField
                placeholder="New password" kind="newPassword" value={password}
                onChangeText={(v) => { if (error) setError(null); setPassword(v); }}
                onSubmitEditing={() => confirmRef.current?.focus()}
              />
            </Group>
            <StrengthMeter strength={strength} />
            {password.length >= MIN_PASSWORD && (
              <View style={{ paddingTop: 12 }}>
                <Group>
                  <AuthField
                    placeholder="Confirm new password" kind="newPassword" inputRef={confirmRef}
                    value={confirm} onChangeText={(v) => { if (error) setError(null); setConfirm(v); }}
                    returnKeyType="done" onSubmitEditing={submit}
                    trailing={confirm === password ? (
                      <View testID="passwords-match">
                        <Ionicons name="checkmark" size={17} color={colors.accent} />
                      </View>
                    ) : undefined}
                  />
                </Group>
              </View>
            )}
            {error && (
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
                {error}
              </Text>
            )}
          </Animated.View>

          <Animated.View entering={enterFrom(2)} style={{ paddingTop: 18 }}>
            <AuthAction label="Set new password" busyLabel="Saving…" busy={busy} enabled={canSubmit} onPress={submit} />
            <Pressable
              accessibilityRole="button" accessibilityLabel="Sign out instead"
              onPress={() => signOut()}
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                Not you? <Text style={{ color: colors.accentPressed, fontWeight: "600" }}>Sign out</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
