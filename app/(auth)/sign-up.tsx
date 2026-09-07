import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EMPTY_ANSWERS, TOTAL_STEPS, toMetadata, type Answers } from "@/lib/onboarding";
import { MIN_PASSWORD, passwordStrength } from "@/lib/passwordStrength";
import { AuthAction } from "@/ui/AuthAction";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { QuestionCard } from "@/ui/QuestionCard";
import { InterviewCards } from "@/ui/InterviewCards";
import { SocialAuthButtons } from "@/ui/SocialAuthButtons";
import { StrengthMeter } from "@/ui/StrengthMeter";
import { ENTER_MS, stepBack, stepForward, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { caption, footnote, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession, type SocialProvider } from "@/stores/sessionStore";

/**
 * Sign-up, as five cards rather than one form.
 *
 * Four questions and then the account. The order is not a style choice:
 * Supabase email confirmation is on, so `signUp()` returns no session and
 * there is nobody to write a profile to until the learner enters the code
 * that confirms them. Asking first lets one call carry everything.
 *
 * One route rather than five, because the answers have to survive until that
 * call regardless — route-per-step would only push the same state into a store
 * and churn the router five times per sign-up, and one component is far
 * cheaper to test than five routes. The cost is that Android's hardware back
 * has to be caught by hand, which it is below.
 *
 * Cards 1–3 advance themselves once the choice has landed. Card 4 cannot: it
 * takes two answers, so jumping on the first would make the second
 * unreachable.
 *
 * **On motion.** Exactly one thing animates per transition — the card itself.
 * The first build of this flow staggered every row inside a card that was
 * itself entering, under a re-keyed wrapper that was also exiting, and it
 * crashed on a device on card four; that cause was never found. Nothing here
 * nests layout animations, and there is no exit — the incoming card carries
 * the whole transition.
 */

/** How long a selection is allowed to be seen before the card moves on. */
const SETTLE_MS = ENTER_MS;

export default function SignUp() {
  const router = useRouter();
  const signUp = useSession((s) => s.signUp);
  const signInWithProvider = useSession((s) => s.signInWithProvider);

  const [step, setStep] = useState(0);
  const [goingBack, setGoingBack] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);


  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which provider sheet is open, or null. */
  const [social, setSocial] = useState<SocialProvider | null>(null);
  const confirmRef = useRef<TextInput>(null);

  const reduced = useReducedMotion();
  const progress = useSharedValue(1 / TOTAL_STEPS);

  useEffect(() => {
    const target = (step + 1) / TOTAL_STEPS;
    progress.value = reduced ? target : withTiming(target, timing(ENTER_MS));
  }, [step, reduced, progress]);

  const advance = useCallback(() => {
    setGoingBack(false);
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  const goBack = useCallback(() => {
    setGoingBack(true);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  /**
   * A pending auto-advance has to be cancellable. Leaving a card by hand
   * before it fires would otherwise move the flow on again underneath whatever
   * the person did next, and a timer surviving unmount sets state on a screen
   * that is gone.
   */
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSettle = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    settling.current = null;
  }, []);
  useEffect(() => cancelSettle, [cancelSettle]);

  // Harmless while sign-up was one form. Once the screen holds four answers,
  // an uncaught back press discards all of them.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === 0) return false;
      cancelSettle();
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [step, goBack, cancelSettle]);

  const strength = passwordStrength(password);
  const canCreate = email.includes("@") && password.length >= MIN_PASSWORD && confirm === password && social === null;

  /**
   * The same four answers, through a provider instead of an email.
   *
   * `toMetadata` is passed exactly as `create` passes it below, which is the
   * whole point of putting these buttons on this card rather than on the
   * sign-in screen alone: a social sign-up answers the interview like any
   * other, and the store writes those answers to the account the moment the
   * session opens.
   *
   * Unlike `create`, there is nowhere to navigate. A password sign-up has a
   * code to enter, so it pushes to `verify`; a provider hands back a live
   * session, and the root layout takes it from there.
   */
  const continueWith = async (provider: SocialProvider) => {
    if (social || busy) return;
    setError(null);
    setSocial(provider);
    const failure = await signInWithProvider(provider, toMetadata(answers, name));
    setSocial(null);
    if (!failure) return;
    setError(failure);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const create = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    setError(null);
    const failure = await signUp(email.trim(), password, toMetadata(answers, name));
    setBusy(false);
    if (failure) {
      setError(failure);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    router.push({ pathname: "/(auth)/verify", params: { email: email.trim(), type: "signup" } });
  };

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const card = () => {
    if (step < 4) {
      return (
        <InterviewCards
          step={step} answers={answers} setAnswers={setAnswers}
          onAdvance={() => {
            // Cards 0–2 settle before moving; card 3's button is deliberate
            // and should not sit there for a beat doing nothing.
            if (step === 3) { advance(); return; }
            cancelSettle();
            settling.current = setTimeout(advance, reduced ? 0 : SETTLE_MS);
          }}
        />
      );
    }

    return (
      <QuestionCard title="Almost there." subtitle="One account, so your progress follows you.">
        <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
          <AuthField placeholder="First name (optional)" kind="name" value={name} onChangeText={setName} />
          <AuthField
            placeholder="Email address" kind="email" value={email}
            onChangeText={(v) => { if (error) setError(null); setEmail(v); }}
          />
          <AuthField
            placeholder="Password" kind="newPassword" value={password}
            onChangeText={(v) => { if (error) setError(null); setPassword(v); }}
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
        </Group>
        <StrengthMeter strength={strength} />
        {/* Nothing to confirm until there is a password worth confirming. */}
        {password.length >= MIN_PASSWORD && (
          <View style={{ paddingTop: 12 }}>
            <Group>
              <AuthField
                placeholder="Confirm password" kind="newPassword" inputRef={confirmRef}
                value={confirm} onChangeText={setConfirm}
                returnKeyType="done" onSubmitEditing={create}
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
        <View style={{ paddingTop: 18 }}>
          <AuthAction label="Create account" busyLabel="Creating account…" busy={busy} enabled={canCreate} onPress={create} />
        </View>

        {/* Same divider as the sign-in screen, so the two doors read as the
            same choice in both places. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14 }}>
          <View style={{ height: 1, flex: 1, backgroundColor: colors.separator }} />
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary }}>or</Text>
          <View style={{ height: 1, flex: 1, backgroundColor: colors.separator }} />
        </View>
        <SocialAuthButtons onPress={continueWith} busy={social} />
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary, textAlign: "center", paddingTop: 12 }}>
          {"We'll keep the answers you just gave."}
        </Text>
      </QuestionCard>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 12 }}>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
          onPress={() => {
            cancelSettle();
            if (step === 0) router.replace("/(auth)/sign-in");
            else goBack();
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accentPressed} />
        </Pressable>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden" }}>
          {/* Clay, not the accent: this bar is the person's progress through
              the interview, and green is reserved for the road. */}
          <Animated.View testID="progress-fill" style={[{ height: "100%", borderRadius: 2, backgroundColor: colors.clay }, bar]} />
        </View>
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.labelTertiary, fontVariant: ["tabular-nums"] }}>
          {step + 1}/{TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {/* Keying on the step is what makes Reanimated treat each card as a
              new element, so the entrance runs on every move. */}
          <Animated.View key={step} entering={goingBack ? stepBack() : stepForward()} style={{ flex: 1 }}>
            {card()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
