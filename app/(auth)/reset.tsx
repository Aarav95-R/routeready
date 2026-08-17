import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthAction } from "@/ui/AuthAction";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { enterFrom, popIn } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The screen that did not exist.
 *
 * `resetPasswordForEmail` was wired nowhere — no link, no screen, no store
 * action — so an account whose password was mistyped at sign-up was
 * unrecoverable inside the app, and the magic link was the only way back in.
 *
 * The sent state replaces the form rather than annotating it, and repeats the
 * address back: the most likely reason a link never arrives is that it went
 * somewhere else, and that is only visible if we show where.
 */
export default function Reset() {
  const router = useRouter();
  const sendPasswordReset = useSession((s) => s.sendPasswordReset);

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const address = email.trim();
    if (busy || !address) return;
    setError(null);
    setBusy(true);
    const failure = await sendPasswordReset(address);
    setBusy(false);
    if (failure) {
      setError(failure);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSentTo(address);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <View style={{ height: 44, justifyContent: "center", paddingHorizontal: 12 }}>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
          onPress={() => router.back()}
          style={{ height: 44, width: 44, justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.accentPressed} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {sentTo ? (
            <View style={{ paddingHorizontal: 16, gap: 16 }}>
              <Animated.View
                entering={popIn()}
                style={{ height: 62, width: 62, borderRadius: 31, backgroundColor: colors.clayTint, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="mail-outline" size={28} color={colors.clay} />
              </Animated.View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
                Check your inbox
              </Text>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                {`We've sent a link to ${sentTo}. Open it and you can set a new password.`}
              </Text>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Send it again"
                onPress={() => { setSentTo(null); }}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.accentPressed, fontWeight: "600" }}>
                  {"Didn't arrive? Send it again"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Animated.View entering={enterFrom(0)} style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
                  Forgot it?
                </Text>
                <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingTop: 6 }}>
                  {"Happens to everyone. Tell us the address on the account and we'll send a link to set a new one."}
                </Text>
              </Animated.View>

              <Animated.View entering={enterFrom(1)}>
                <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
                  <AuthField
                    placeholder="Email address" kind="email" value={email}
                    onChangeText={(v) => { if (error) setError(null); setEmail(v); }}
                    returnKeyType="done" onSubmitEditing={send}
                  />
                </Group>
                {error && (
                  <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
                    {error}
                  </Text>
                )}
              </Animated.View>

              <Animated.View entering={enterFrom(2)} style={{ paddingTop: 18 }}>
                <AuthAction
                  label="Send the link" busyLabel="Sending…" busy={busy}
                  enabled={email.trim().length > 0} onPress={send}
                />
              </Animated.View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
