import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EMPTY_ANSWERS, toMetadata, type Answers } from "@/lib/onboarding";
import { InterviewCards } from "@/ui/InterviewCards";
import { ENTER_MS, stepBack, stepForward, timing } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { footnote, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";
import { useSession } from "@/stores/sessionStore";

/**
 * The four questions, asked of an account that already exists.
 *
 * Sign-up asks them on the way in, as cards 1–4 of five. This screen exists
 * for the accounts that never passed through there: signing in with Apple or
 * Google from the *sign-in* screen creates an account in one tap, with no
 * interview anywhere in the flow — and so does every account made before the
 * interview existed. `nextAuthRoute` sends both here, and will keep sending
 * them here until the answers land.
 *
 * Four cards rather than five: there is no account to make. The last card's
 * button says so, and finishing writes the answers with `saveInterview`
 * instead of `signUp`.
 *
 * **No skip.** The gate is computed from the answers themselves, so a skip
 * would have to write a second piece of state to mean "asked and declined",
 * and anyone who took it would reach an app with nothing to personalise —
 * which is the situation this screen was added to fix. Four taps is the
 * cheaper end of that trade. What there *is* instead is a way out: signing
 * out is reachable from card 1, so nobody who cannot find their centre is
 * held in a loop with no exit.
 */

/** How long a selection is allowed to be seen before the card moves on. */
const SETTLE_MS = ENTER_MS;

const TOTAL = 4;

export default function Interview() {
  const saveInterview = useSession((s) => s.saveInterview);
  const signOut = useSession((s) => s.signOut);

  const [step, setStep] = useState(0);
  const [goingBack, setGoingBack] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reduced = useReducedMotion();
  const progress = useSharedValue(1 / TOTAL);

  useEffect(() => {
    const target = (step + 1) / TOTAL;
    progress.value = reduced ? target : withTiming(target, timing(ENTER_MS));
  }, [step, reduced, progress]);

  const goBack = useCallback(() => {
    setGoingBack(true);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // A pending auto-advance has to be cancellable, or leaving a card by hand
  // moves the flow on again underneath whatever was done next — and a timer
  // surviving unmount sets state on a screen that is gone.
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSettle = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    settling.current = null;
  }, []);
  useEffect(() => cancelSettle, [cancelSettle]);

  /**
   * Android's hardware back walks the cards, and is swallowed on the first
   * one. Letting it through there would close the app on somebody who is
   * signed in and one gate short of using it — and, unlike sign-up, there is
   * no screen behind this to go back to.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step > 0) { cancelSettle(); goBack(); }
      return true;
    });
    return () => sub.remove();
  }, [step, goBack, cancelSettle]);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // No name: this account already has one, or has chosen not to. `toMetadata`
    // omits a blank rather than writing "", so whatever Apple or Google gave
    // at sign-in survives this write untouched.
    const failure = await saveInterview(toMetadata(answers, ""));
    setBusy(false);
    if (failure) {
      // Reported rather than swallowed. This write is the only thing that
      // opens the gate, so a silent failure would leave somebody tapping a
      // finished button on a screen that never lets them past.
      setError(failure);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    // Nothing navigates here. The written answers change `session`, the gate
    // closes, and the root layout moves them on — the same rule every other
    // auth screen follows.
  };

  const advance = useCallback(() => {
    setGoingBack(false);
    setStep((s) => Math.min(TOTAL - 1, s + 1));
  }, []);

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.field }}>
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 12 }}>
        {step > 0 ? (
          <Pressable
            accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
            onPress={() => { cancelSettle(); goBack(); }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.accentPressed} />
          </Pressable>
        ) : (
          // The way out, and only where it is needed. Somebody whose centre is
          // not on the list has to be able to leave; past card 1 they are
          // three taps from done and the back arrow is the more useful thing.
          <Pressable
            accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={10}
            onPress={signOut}
          >
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...subheadline, color: colors.accentPressed, fontWeight: "600" }}>
              Sign out
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden" }}>
          {/* Clay, not the accent: this is the person's progress through the
              interview, and green is reserved for the road. */}
          <Animated.View testID="progress-fill" style={[{ height: "100%", borderRadius: 2, backgroundColor: colors.clay }, bar]} />
        </View>
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.labelTertiary, fontVariant: ["tabular-nums"] }}>
          {step + 1}/{TOTAL}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {/* Keying on the step is what makes Reanimated treat each card as a
            new element, so the entrance runs on every move. */}
        <Animated.View key={step} entering={goingBack ? stepBack() : stepForward()} style={{ flex: 1 }}>
          <InterviewCards
            step={step} answers={answers} setAnswers={setAnswers}
            continueLabel={busy ? "Saving…" : "Finish"}
            onAdvance={() => {
              if (step === 3) { finish(); return; }
              cancelSettle();
              settling.current = setTimeout(advance, reduced ? 0 : SETTLE_MS);
            }}
          />
          {error && (
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...footnote, color: colors.danger, paddingHorizontal: 20, paddingTop: 10, textAlign: "center" }}>
              {error}
            </Text>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
