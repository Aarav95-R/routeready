import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CodeField } from "@/ui/CodeField";
import { CODE_TYPES, isComplete, type CodeType } from "@/lib/otpCode";
import { verifyCopy } from "@/lib/verifyCopy";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The badge glyph per flow, matching the badge that flow's email carries.
 *
 * Here rather than in `verifyCopy` so that module stays free of UI imports;
 * this is the same shape `app/(auth)/sign-up.tsx` uses for FOCUS_ICONS.
 */
const ICONS: Record<CodeType, React.ComponentProps<typeof Ionicons>["name"]> = {
  signup: "mail-outline",
  recovery: "lock-open-outline",
  email: "key-outline",
};

/**
 * Where every emailed code is typed — sign-up, recovery and magic link alike.
 *
 * One screen rather than a field inlined into each of the three senders. The
 * resend cooldown, the three failure sentences and the paste handling are the
 * same in all three flows, and three copies of them is three chances to drift.
 *
 * There is no submit button. Six digits is the whole form, so the last digit
 * is the submit — a button after it would be a tap carrying no information.
 * `busy` is what stops a second verify: the code is spent by the first, so a
 * duplicate is always a wasted attempt against the rate limit.
 *
 * Nothing here routes on success. Setting the session is what moves the app —
 * `nextAuthRoute` sends a confirmed sign-up to the tabs and a verified
 * recovery to update-password, exactly as it did when links did the setting.
 */
export default function Verify() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; type?: string }>();
  const email = params.email ?? "";
  // Narrowed against the three real values rather than cast: `type` arrives
  // as a route param, the `routeready` URL scheme is still registered, and a
  // crafted deep link can put any string there. Falling back to "signup" is
  // the least surprising wrong guess, matching the default for a bare push.
  const type: CodeType = (CODE_TYPES as readonly string[]).includes(params.type ?? "")
    ? (params.type as CodeType)
    : "signup";

  const verifyCode = useSession((s) => s.verifyCode);
  const resendCode = useSession((s) => s.resendCode);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const copy = verifyCopy(type);

  const enter = async (next: string) => {
    // While a submitted code is being checked, the field is dimmed and inert
    // — see CodeField's `busy` — so a keystroke landing here is a race with
    // the response, not an intentional edit.
    if (busy) return;
    setCode(next);
    if (error) setError(null);
    // "Sent." is stale the moment typing resumes; leaving it up would claim
    // a code is on its way when the person has moved on to entering one.
    if (notice) setNotice(null);
    if (!isComplete(next)) return;

    setBusy(true);
    const failure = await verifyCode(email, next, type);
    setBusy(false);
    if (!failure) return;
    setError(failure);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const again = async () => {
    // Without this guard a second tap while the first `resendCode` is still
    // in flight lands its own request into `max_frequency`'s 60s window: the
    // first resolves successfully and clears the code, then the second's
    // "Too many tries" overwrites the notice with a failure sentence — a
    // successful resend reported as a failure, on a screen someone only
    // reached because something already went wrong.
    if (resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    const failure = await resendCode(email, type);
    setResending(false);
    if (failure) {
      setError(failure);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setCode("");
    setNotice("Sent. Check your email again.");
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
          <Animated.View entering={enterFrom(0)} style={{ paddingHorizontal: 16, paddingBottom: 26, gap: 14 }}>
            <View style={{ height: 56, width: 56, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={ICONS[type] ?? ICONS.signup} size={26} color="#FFFFFF" />
            </View>
            <View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
                {copy.title}
              </Text>
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, paddingTop: 6 }}>
                {copy.subtitle(email)}
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={enterFrom(1)}>
            <CodeField value={code} onChangeText={enter} invalid={Boolean(error)} busy={busy} />
            {/* The live region is the non-visual half of `invalid`. CodeField
                signals a refused code by turning every box red, which reaches
                nobody using a screen reader; this is where the sentence saying
                what went wrong actually gets announced. */}
            {error && (
              <Text
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
                style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 14, textAlign: "center" }}
              >
                {error}
              </Text>
            )}
            {notice && !error && (
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.accentPressed, paddingHorizontal: 20, paddingTop: 14, textAlign: "center" }}>
                {notice}
              </Text>
            )}
          </Animated.View>

          <Animated.View entering={enterFrom(2)} style={{ paddingTop: 20 }}>
            <Pressable
              accessibilityRole="button" accessibilityLabel="Send a new code"
              disabled={resending} onPress={again}
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center", opacity: resending ? 0.5 : 1 }}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary }}>
                {"Didn't arrive? "}
                <Text style={{ color: colors.accentPressed, fontWeight: "600" }}>Send a new code</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
