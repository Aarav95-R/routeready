import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listCentres } from "@/services/centresRepo";
import type { Centre } from "@/types/db";
import {
  canAdvance, EMPTY_ANSWERS, EXPERIENCE_OPTIONS, FOCUS_OPTIONS,
  toggleFocus, toMetadata, TOTAL_STEPS, type Answers,
} from "@/lib/onboarding";
import { MIN_PASSWORD, passwordStrength } from "@/lib/passwordStrength";
import { AuthField } from "@/ui/AuthField";
import { Group } from "@/ui/List";
import { ChoiceRow, QuestionCard } from "@/ui/QuestionCard";
import { StrengthMeter } from "@/ui/StrengthMeter";
import { ENTER_MS, enterFrom, popIn, stepBack, stepExit, stepForward, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { caption, footnote, headline, subheadline, title2, MAX_DISPLAY_SCALE } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * Sign-up, as five cards rather than one form.
 *
 * Four questions, then the account. The order is not a style choice: Supabase
 * email confirmation is on, so `signUp()` returns no session, and there is
 * nobody to write a profile to until the learner confirms and returns in a
 * later session. Asking first lets one call carry everything.
 *
 * One route rather than five, because the answers have to survive until that
 * call regardless — route-per-step would only push the same state into a store
 * and churn the router five times per sign-up.
 *
 * Cards 1–3 advance themselves once the choice has landed. Card 4 cannot: it
 * allows two answers, so jumping on the first would make the second
 * unreachable.
 */

/** How long a selection is allowed to be seen before the card moves on. */
const SETTLE_MS = ENTER_MS;

export default function SignUp() {
  const router = useRouter();
  const signUp = useSession((s) => s.signUp);

  const [step, setStep] = useState(0);
  const [goingBack, setGoingBack] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [done, setDone] = useState(false);

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
    // cache is national rather than per-user, so a device that has ever loaded
    // the list shows it instantly, offline included.
    listCentres().then((c) => setCentres(c.data)).catch(() => setCentres([]));
  }, []);

  useEffect(() => {
    const target = (step + 1) / TOTAL_STEPS;
    progress.value = reduced ? target : withTiming(target, timing(ENTER_MS));
  }, [step, reduced, progress]);

  const goBack = useCallback(() => {
    setGoingBack(true);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Without this, Android's back button leaves the flow and discards four
  // answers. It was harmless while sign-up was one form; it is not now.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (done || step === 0) return false;
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [step, done, goBack]);

  const advance = useCallback(() => {
    setGoingBack(false);
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  /** A choice on a single-answer card: acknowledge it, let it be seen, move on. */
  const chooseAndAdvance = (patch: Partial<Answers>) => {
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, ...patch }));
    setTimeout(advance, reduced ? 0 : SETTLE_MS);
  };

  const strength = passwordStrength(password);
  const canCreate =
    email.includes("@") && password.length >= MIN_PASSWORD && confirm === password && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const err = await signUp(email.trim(), password, toMetadata(answers, name));
    setBusy(false);
    if (err) { setError(err); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    else setDone(true);
  };

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (done) {
    const centre = centres.find((c) => c.id === answers.centreId);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.field, alignItems: "center", justifyContent: "center" }}>
        <Animated.View entering={popIn()} style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={34} color="#FFFFFF" />
        </Animated.View>
        <Animated.Text entering={enterFrom(1)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...title2, color: colors.label, paddingTop: 22 }}>
          Check your email
        </Animated.Text>
        <Animated.Text entering={enterFrom(2)} maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.labelSecondary, textAlign: "center", paddingHorizontal: 30, paddingTop: 8 }}>
          {centre
            ? `We've sent a confirmation link to your address. Open it, then sign in — ${centre.name} will be waiting.`
            : "We've sent a confirmation link to your address. Open it, then sign in."}
        </Animated.Text>
        <Animated.View entering={enterFrom(3)} style={{ paddingTop: 26 }}>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(auth)/sign-in")} style={{ minHeight: 44, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.accentPressed }}>Back to sign in</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const shown = query
    ? centres.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : centres;

  const action = (label: string, enabled: boolean, onPress: () => void) => (
    <View style={{ paddingTop: 18 }}>
      <Pressable
        accessibilityRole="button" disabled={!enabled} onPress={onPress}
        style={{ marginHorizontal: 16, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, opacity: enabled ? 1 : 0.35 }}
      >
        {busy && <ActivityIndicator color="#FFFFFF" />}
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>{label}</Text>
      </Pressable>
    </View>
  );

  const card = () => {
    if (step === 0) {
      return (
        <QuestionCard title="Where are you testing?" subtitle="We'll open the app on that centre's real routes.">
          <View style={{ marginHorizontal: 16, marginBottom: 10, height: 36, borderRadius: 10, backgroundColor: colors.fill, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 7 }}>
            <Ionicons name="search" size={15} color={colors.labelTertiary} />
            <TextInput
              accessibilityLabel="Search centres"
              style={{ ...subheadline, flex: 1, color: colors.label, padding: 0 }}
              placeholder="Search centres" placeholderTextColor={colors.labelTertiary}
              value={query} onChangeText={setQuery} autoCorrect={false}
            />
          </View>
          <Group>
            {shown.map((c) => (
              <ChoiceRow
                key={c.id} testID={`centre-${c.id}`} label={c.name} sub={c.address}
                selected={answers.centreId === c.id}
                onPress={() => chooseAndAdvance({ centreId: c.id })}
              />
            ))}
          </Group>
        </QuestionCard>
      );
    }

    if (step === 1) {
      return (
        <QuestionCard title="Have you booked it?" subtitle="A date turns Home into a countdown. You can add one later.">
          <Group>
            <ChoiceRow
              label="Yes, it's booked" selected={answers.booked === true}
              onPress={() => { Haptics.selectionAsync(); setAnswers((a) => ({ ...a, booked: true })); }}
            />
            <ChoiceRow
              label="Not yet" selected={answers.booked === false}
              onPress={() => chooseAndAdvance({ booked: false, testDate: null })}
            />
          </Group>
          {answers.booked === true && (
            <Animated.View entering={enterFrom(0)} style={{ paddingTop: 12 }}>
              <DateTimePicker
                testID="test-date"
                value={answers.testDate ? new Date(answers.testDate) : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                minimumDate={new Date()}
                onChange={(_e, d) => {
                  if (d) setAnswers((a) => ({ ...a, testDate: d.toISOString().slice(0, 10) }));
                }}
              />
            </Animated.View>
          )}
          {canAdvance(1, answers) && action("Continue", true, advance)}
        </QuestionCard>
      );
    }

    if (step === 2) {
      return (
        <QuestionCard title="How much have you driven?" subtitle="This sets whether we start you on a practice drive or a mock test.">
          <Group>
            {EXPERIENCE_OPTIONS.map((o) => (
              <ChoiceRow
                key={o.id} testID={`experience-${o.id}`} label={o.label} sub={o.sub}
                selected={answers.experience === o.id}
                onPress={() => chooseAndAdvance({ experience: o.id })}
              />
            ))}
          </Group>
        </QuestionCard>
      );
    }

    if (step === 3) {
      const n = answers.focus.length;
      return (
        <QuestionCard title="What trips you up?" subtitle="Pick up to two. Routes with those come first.">
          <Group>
            {FOCUS_OPTIONS.map((o) => (
              <ChoiceRow
                key={o.id} testID={`focus-${o.id}`} label={o.label} sub={o.sub} multi
                selected={answers.focus.includes(o.id)}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((a) => ({ ...a, focus: toggleFocus(a.focus, o.id) }));
                }}
              />
            ))}
          </Group>
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...caption, color: colors.labelTertiary, textAlign: "center", paddingTop: 10 }}>
            {n === 0 ? "Choose one or two" : n === 1 ? "One more, or continue" : "That's two — tap one to swap it"}
          </Text>
          {action("Continue", canAdvance(3, answers), advance)}
        </QuestionCard>
      );
    }

    return (
      <QuestionCard title="Last thing." subtitle="So your progress is here next time you open the app.">
        <Group style={error ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
          <AuthField placeholder="First name (optional)" kind="name" value={name} onChangeText={setName} />
          <AuthField placeholder="Email address" kind="email" value={email} onChangeText={(v) => { if (error) setError(null); setEmail(v); }} />
          <AuthField
            placeholder="Password" kind="newPassword" value={password}
            onChangeText={(v) => { if (error) setError(null); setPassword(v); }}
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
        </Group>
        <StrengthMeter strength={strength} />
        {/* Nothing to confirm until there is a password worth confirming. */}
        {password.length >= MIN_PASSWORD && (
          <Animated.View entering={enterFrom(0)} style={{ paddingTop: 12 }}>
            <Group>
              <AuthField
                placeholder="Confirm password" kind="newPassword" inputRef={confirmRef}
                value={confirm} onChangeText={setConfirm} returnKeyType="done" onSubmitEditing={create}
              />
            </Group>
          </Animated.View>
        )}
        {error && (
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10 }}>
            {error}
          </Text>
        )}
        {action(busy ? "Creating account…" : "Create account", canCreate, create)}
      </QuestionCard>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 12 }}>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
          onPress={() => (step === 0 ? router.back() : goBack())}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accentPressed} />
        </Pressable>
        <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden", marginRight: 16 }}>
          <Animated.View testID="progress-fill" style={[{ height: "100%", borderRadius: 2, backgroundColor: colors.accent }, bar]} />
        </View>
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.labelTertiary, fontVariant: ["tabular-nums"] }}>
          {step + 1} of {TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* Keying on the step is what makes Reanimated treat each card as a
              new element, so the exit and the entrance both run. */}
          <Animated.View
            key={step}
            entering={goingBack ? stepBack() : stepForward()}
            exiting={stepExit(goingBack)}
            style={{ flex: 1 }}
          >
            {card()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
