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
import { SocialAuthButtons } from "@/ui/SocialAuthButtons";
import { enterFrom } from "@/ui/motion";
import { EMAIL_NOT_CONFIRMED } from "@/lib/authError";
import { colors } from "@/ui/theme";
import { caption, footnote, headline, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession, type SocialProvider } from "@/stores/sessionStore";

/**
 * The first screen anyone sees, and until now the only one still dressed in
 * the pre-redesign idiom — loose bordered fields on a centred stack, in the
 * cool greys the rest of the app has left behind.
 *
 * Three things here are not restyling:
 *
 * `resetPasswordForEmail` is reachable. It was wired nowhere, so an account
 * whose password was mistyped at sign-up could not be recovered inside the
 * app, and the magic-link sign-in was presented as a mere convenience rather
 * than as the rescue it was.
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
  const signInWithProvider = useSession((s) => s.signInWithProvider);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which provider sheet is open, or null. */
  const [social, setSocial] = useState<SocialProvider | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const clear = () => setError(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && social === null;

  const submit = async () => {
    if (busy || !canSubmit) return;
    clear();
    setBusy(true);
    const failure = await signIn(email.trim(), password);
    setBusy(false);
    if (!failure) return;
    // An unconfirmed sign-up used to be a dead end here: this sentence named
    // a code with nowhere on this screen to enter it, sign-up refused a
    // second attempt on the same address, and before codes existed the same
    // sentence at least named a link that could be opened from the inbox.
    // Comparing against the exported constant, not the sentence text, is what
    // keeps this from drifting out of sync with authError.ts.
    if (failure === EMAIL_NOT_CONFIRMED) {
      router.push({ pathname: "/(auth)/verify", params: { email: email.trim(), type: "signup" } });
      return;
    }
    setError(failure);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  /**
   * A provider sheet, and whatever it comes back with.
   *
   * Nothing here navigates. A session opening is what moves the person on —
   * the root layout watches the store for exactly that — and it is also why
   * a cancel needs no branch of its own: the store returns null for both
   * "signed in" and "changed their mind", because neither has anything to say
   * on this screen. Only a real failure gets a sentence and a haptic.
   */
  const continueWith = async (provider: SocialProvider) => {
    if (social || busy) return;
    clear();
    setSocial(provider);
    const failure = await signInWithProvider(provider);
    setSocial(null);
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
    router.push({ pathname: "/(auth)/verify", params: { email: email.trim(), type: "email" } });
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
            {/* Above the email code rather than below it: these two are the
                one-tap doors, and the code is the fallback for somebody who
                has neither account. */}
            <View style={{ paddingBottom: 14 }}>
              <SocialAuthButtons onPress={continueWith} busy={social} />
            </View>
            <Group>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Email me a sign-in code"
                disabled={!email.trim() || social !== null} onPress={emailLink}
                style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: email.trim() && !social ? 1 : 0.4 }}
              >
                <Ionicons name="mail-outline" size={17} color={colors.accent} />
                <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.accent }}>
                  Email me a sign-in code
                </Text>
              </Pressable>
            </Group>
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
