import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthAction } from "@/ui/AuthAction";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { caption, footnote, headline, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The first screen anyone sees, and until now the only one still dressed in
 * the pre-redesign idiom — loose bordered fields on a centred stack, in the
 * cool greys the rest of the app has left behind.
 *
 * Three things here are not restyling:
 *
 * `resetPasswordForEmail` is reachable. It was wired nowhere, so an account
 * whose password was mistyped at sign-up could not be recovered inside the
 * app, and the magic link — the only way back in — was presented as a
 * convenience rather than as a rescue.
 *
 * The fields carry their autofill attributes, so iOS offers the Keychain
 * credential in one tap. See `AuthField`.
 *
 * A failure is felt as well as read: one error haptic, and nothing on screen
 * moves back and forth to say so. A shake was prototyped and cut — the motion
 * module is built on "nothing overshoots, so nothing settles, so nothing
 * jiggles", and one exception to a one-rule motion language is how it stops
 * being one.
 */
export default function SignIn() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const sendMagicLink = useSession((s) => s.sendMagicLink);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Both are cleared on every attempt and on every keystroke. Clearing only
  // one is how a sent-link notice used to end up sitting under a failure.
  const clear = () => { setError(null); setNotice(null); };

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (busy || !canSubmit) return;
    clear();
    setBusy(true);
    const failure = await signIn(email.trim(), password);
    setBusy(false);
    if (!failure) return;
    setError(failure);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const emailLink = async () => {
    if (!email.trim()) return;
    clear();
    const failure = await sendMagicLink(email.trim());
    if (failure) {
      setError(failure);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setNotice("Check your email for the sign-in link.");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // "padding" is wrong on Android, where it leaves the keyboard covering
        // the button it is supposed to lift.
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enterFrom(0)} style={{ paddingHorizontal: 16, paddingBottom: 26, gap: 14 }}>
            <View style={{ height: 56, width: 56, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="car-sport" size={28} color="#FFFFFF" />
            </View>
            <View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
                Welcome back
              </Text>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingTop: 6 }}>
                Pick up where you left off.
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={enterFrom(1)}>
            <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
              <AuthField
                placeholder="Email address" kind="email" value={email}
                onChangeText={(v) => { clear(); setEmail(v); }}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <AuthField
                placeholder="Password" kind="password" value={password} inputRef={passwordRef}
                onChangeText={(v) => { clear(); setPassword(v); }}
                returnKeyType="done" onSubmitEditing={submit}
              />
            </Group>
            {error && (
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
                {error}
              </Text>
            )}
          </Animated.View>

          <Animated.View entering={enterFrom(2)} style={{ paddingTop: 18 }}>
            <AuthAction label="Sign in" busyLabel="Signing in…" busy={busy} enabled={canSubmit} onPress={submit} />
            <Pressable
              accessibilityRole="button" accessibilityLabel="Forgot your password?"
              onPress={() => router.push("/(auth)/reset")}
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.accentPressed, fontWeight: "600" }}>
                Forgot your password?
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={enterFrom(3)} style={{ paddingTop: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, paddingBottom: 14 }}>
              <View style={{ height: 1, flex: 1, backgroundColor: colors.separator }} />
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary }}>or</Text>
              <View style={{ height: 1, flex: 1, backgroundColor: colors.separator }} />
            </View>
            <Group>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Email me a sign-in link"
                disabled={!email.trim()} onPress={emailLink}
                style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: email.trim() ? 1 : 0.4 }}
              >
                <Ionicons name="mail-outline" size={17} color={colors.accent} />
                <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.accent }}>
                  Email me a sign-in link
                </Text>
              </Pressable>
            </Group>
            {notice && (
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.accentPressed, paddingHorizontal: 20, paddingTop: 10 }}>
                {notice}
              </Text>
            )}
          </Animated.View>

          <Animated.View entering={enterFrom(4)} style={{ paddingTop: 22 }}>
            <Pressable
              accessibilityRole="button" accessibilityLabel="Create an account"
              onPress={() => router.push("/(auth)/sign-up")}
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                New here? <Text style={{ color: colors.accentPressed, fontWeight: "600" }}>Create an account</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
