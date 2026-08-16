import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, footnote, headline, largeTitle, subheadline, title2, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The first screen of the app, and therefore its first statement about what
 * kind of app it is.
 *
 * It is built from the same `Group` as Home so that the list language is
 * already familiar by the time the tabs appear. No shadow, no card: the group
 * separates from the field by being lighter than it.
 *
 * Failure is quiet. The group's outline turns danger, the reason arrives
 * beneath it, and the phone taps once — `motion.ts` does not oscillate, so
 * nothing shakes. The haptic carries what a shake would have.
 */
export default function SignIn() {
  const signIn = useSession((s) => s.signIn);
  const sendMagicLink = useSession((s) => s.sendMagicLink);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.includes("@") && password.length > 0 && !busy;

  // Both messages clear together, always. Leaving one behind is how a success
  // ends up sitting under a failure.
  const edit = (set: (v: string) => void) => (v: string) => {
    if (error || notice) { setError(null); setNotice(null); }
    set(v);
  };

  const attempt = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      // The half of a failure a screenshot cannot show.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const magicLink = async () => {
    if (!email.includes("@") || busy) return;
    setError(null);
    setNotice(null);
    const err = await sendMagicLink(email.trim());
    if (err) { setError(err); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    else setNotice("Check your email — the link works for an hour, on this phone.");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // `padding` is wrong on Android and puts the keyboard over the button.
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 32 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enterFrom(0)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 26 }}>
            <View style={{ height: 52, width: 52, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="car-sport" size={28} color="#FFFFFF" />
            </View>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...title2, color: colors.label }}>RouteReady</Text>
          </Animated.View>

          <Animated.View entering={enterFrom(1)}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingBottom: 22 }}>
              Welcome back.
            </Text>
          </Animated.View>

          <Animated.View entering={enterFrom(2)}>
            <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
              <AuthField
                testID="email" placeholder="Email address" kind="email"
                value={email} onChangeText={edit(setEmail)}
                returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <AuthField
                testID="password" placeholder="Password" kind="password" inputRef={passwordRef}
                value={password} onChangeText={edit(setPassword)}
                returnKeyType="done" onSubmitEditing={attempt}
              />
            </Group>
          </Animated.View>

          {error && (
            <Animated.Text
              entering={enterFrom(0)}
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}
            >
              {error}
            </Animated.Text>
          )}
          {notice && (
            <Animated.Text
              entering={enterFrom(0)}
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...footnote, color: colors.accentPressed, paddingHorizontal: 20, paddingTop: 10 }}
            >
              {notice}
            </Animated.Text>
          )}

          <Animated.View entering={enterFrom(3)} style={{ paddingTop: 14 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={attempt}
              style={{
                marginHorizontal: 16, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
                opacity: canSubmit ? 1 : 0.35,
              }}
            >
              {busy && <ActivityIndicator color="#FFFFFF" />}
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
                {busy ? "Signing in…" : "Sign in"}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={enterFrom(4)}>
            <Pressable accessibilityRole="button" onPress={magicLink} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, color: colors.accentPressed }}>
                Email me a sign-in link
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={enterFrom(5)}>
            <Link href="/(auth)/reset" asChild>
              <Pressable accessibilityRole="button" style={{ minHeight: 40, alignItems: "center", justifyContent: "center" }}>
                <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                  Forgot your password?
                </Text>
              </Pressable>
            </Link>
          </Animated.View>

          <Animated.View entering={enterFrom(6)} style={{ paddingTop: 26, alignItems: "center" }}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
              New here?{" "}
              <Link href="/(auth)/sign-up" style={{ color: colors.accentPressed, fontWeight: "600" }}>
                Create an account
              </Link>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
