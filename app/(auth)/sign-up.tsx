import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listCentres } from "@/services/centresRepo";
import type { Centre } from "@/types/db";
import {
  canAdvance, EMPTY_ANSWERS, EXPERIENCE_OPTIONS, FOCUS_OPTIONS, TOTAL_STEPS,
  toggleFocus, toMetadata, WINDOW_OPTIONS, type Answers, type Focus,
} from "@/lib/onboarding";
import { MIN_PASSWORD, passwordStrength } from "@/lib/passwordStrength";
import { AuthAction } from "@/ui/AuthAction";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { ChoiceRow, QuestionCard } from "@/ui/QuestionCard";
import { StrengthMeter } from "@/ui/StrengthMeter";
import { ENTER_MS, popIn, stepBack, stepForward, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, caption, footnote, largeTitle, subheadline, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

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

const FOCUS_ICONS: Record<Focus, React.ComponentProps<typeof Ionicons>["name"]> = {
  roundabout: "sync-outline",
  junction: "git-merge-outline",
  narrow: "swap-horizontal-outline",
  zebra: "walk-outline",
};

export default function SignUp() {
  const router = useRouter();
  const signUp = useSession((s) => s.signUp);

  const [step, setStep] = useState(0);
  const [goingBack, setGoingBack] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);

  const [centres, setCentres] = useState<Centre[]>([]);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const reduced = useReducedMotion();
  const progress = useSharedValue(1 / TOTAL_STEPS);

  useEffect(() => {
    // `test_centres` grants select to anon, so this works with no session. The
    // cache is national rather than per-user — `clearUserCache` only clears
    // `cache:progress:` — so a device that has ever loaded the list shows it
    // instantly, offline included.
    let live = true;
    listCentres()
      .then((c) => { if (live) setCentres(c.data); })
      .catch(() => { if (live) setCentres([]); });
    return () => { live = false; };
  }, []);

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

  /** A choice on a single-answer card: acknowledge it, let it be seen, move on. */
  const chooseAndAdvance = (patch: Partial<Answers>) => {
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, ...patch }));
    cancelSettle();
    settling.current = setTimeout(advance, reduced ? 0 : SETTLE_MS);
  };

  const strength = passwordStrength(password);
  const canCreate = email.includes("@") && password.length >= MIN_PASSWORD && confirm === password;

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

  const shown = query
    ? centres.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : centres;

  const card = () => {
    if (step === 0) {
      return (
        <QuestionCard title="Where are you taking it?" subtitle="So we can show you the roads examiners actually drive.">
          <View style={{ marginHorizontal: 16, marginBottom: 12, minHeight: 40, borderRadius: 11, backgroundColor: colors.cell, borderWidth: 1, borderColor: colors.separator, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
            <Ionicons name="search" size={15} color={colors.labelTertiary} />
            <TextInput
              accessibilityLabel="Search test centres"
              style={{ ...body, flex: 1, color: colors.label, paddingVertical: 9 }}
              placeholder="Search test centres" placeholderTextColor={colors.labelTertiary}
              value={query} onChangeText={setQuery} autoCorrect={false}
            />
          </View>
          {shown.map((c) => (
            <ChoiceRow
              key={c.id} testID={`centre-${c.id}`} label={c.name} sub={c.address ?? undefined}
              selected={answers.centreId === c.id}
              onPress={() => chooseAndAdvance({ centreId: c.id })}
            />
          ))}
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary, textAlign: "center", paddingTop: 8 }}>
            You can change this any time.
          </Text>
        </QuestionCard>
      );
    }

    if (step === 1) {
      return (
        <QuestionCard title="When's your test?" subtitle="We'll count down with you. Roughly is fine.">
          {WINDOW_OPTIONS.map((o) => (
            <ChoiceRow
              key={o.id} testID={`window-${o.id}`} label={o.label} sub={o.sub}
              selected={answers.testWindow === o.id}
              onPress={() => chooseAndAdvance({ testWindow: o.id })}
            />
          ))}
        </QuestionCard>
      );
    }

    if (step === 2) {
      return (
        <QuestionCard title="How much have you driven?" subtitle="This sets where we start you. It isn't a judgement.">
          {EXPERIENCE_OPTIONS.map((o) => (
            <ChoiceRow
              key={o.id} testID={`experience-${o.id}`} label={o.label} sub={o.sub}
              selected={answers.experience === o.id}
              onPress={() => chooseAndAdvance({ experience: o.id })}
            />
          ))}
        </QuestionCard>
      );
    }

    if (step === 3) {
      const chosen = answers.focus.length;
      return (
        <QuestionCard title="What trips you up?" subtitle="Pick up to two. We'll put those routes first.">
          {FOCUS_OPTIONS.map((o) => (
            <ChoiceRow
              key={o.id} testID={`focus-${o.id}`} label={o.label} sub={o.sub} icon={FOCUS_ICONS[o.id]} multi
              selected={answers.focus.includes(o.id)}
              onPress={() => {
                Haptics.selectionAsync();
                setAnswers((a) => ({ ...a, focus: toggleFocus(a.focus, o.id) }));
              }}
            />
          ))}
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary, textAlign: "center", paddingVertical: 10 }}>
            {chosen === 0 ? "Choose one or two" : chosen === 1 ? "One more, or carry on" : "That's two — tap another and the first one drops"}
          </Text>
          <AuthAction label="Continue" enabled={canAdvance(3, answers)} onPress={advance} />
        </QuestionCard>
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
