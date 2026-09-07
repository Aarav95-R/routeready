import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listCentres } from "@/services/centresRepo";
import type { Centre } from "@/types/db";
import {
  canAdvance, EXPERIENCE_OPTIONS, FOCUS_OPTIONS, toggleFocus, WINDOW_OPTIONS,
  type Answers, type Focus,
} from "@/lib/onboarding";
import { AuthAction } from "@/ui/AuthAction";
import { ChoiceRow, QuestionCard } from "@/ui/QuestionCard";
import { colors } from "@/ui/theme";
import { body, caption, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * The four questions, wherever they are being asked.
 *
 * Pulled out of `sign-up.tsx` when a second screen needed them. Signing in
 * with Apple or Google from the *sign-in* screen makes an account without ever
 * passing card 5, so `app/(auth)/interview.tsx` asks the same four questions
 * afterwards — and two copies of a five-card interview is exactly how the two
 * end up disagreeing about the copy, the order, or which answers are optional.
 *
 * What stayed behind in `sign-up.tsx` is everything about *making an account*:
 * the credentials card, the provider buttons, the progress bar. This component
 * owns only the questions, and knows nothing about who is asking or what
 * happens to the answers.
 *
 * The step is owned by the caller rather than held here, because the two
 * callers count differently — sign-up shows "3/5" across five cards, the
 * interview "3/4" across four — and because sign-up's Android back handler
 * needs to drive it.
 */

const FOCUS_ICONS: Record<Focus, React.ComponentProps<typeof Ionicons>["name"]> = {
  roundabout: "sync-outline",
  junction: "git-merge-outline",
  narrow: "swap-horizontal-outline",
  zebra: "walk-outline",
};

export function InterviewCards({
  step, answers, setAnswers, onAdvance, continueLabel = "Continue",
}: {
  /** 0–3. Anything else renders nothing; the caller owns what comes after. */
  step: number;
  answers: Answers;
  setAnswers: (update: (a: Answers) => Answers) => void;
  /**
   * Called when a card is done with. Cards 0–2 fire it after a beat so the
   * choice can be seen landing; card 3 takes two answers, so it waits for the
   * button rather than jumping on the first tap and making the second
   * unreachable.
   */
  onAdvance: () => void;
  /** Card 3's button. "Continue" mid-flow, something final when it ends one. */
  continueLabel?: string;
}) {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // `test_centres` grants select to anon, so this works with or without a
    // session — which is what lets the same component serve sign-up (no
    // session yet) and the interview gate (session already open).
    let live = true;
    listCentres()
      .then((c) => { if (live) setCentres(c.data); })
      .catch(() => { if (live) setCentres([]); });
    return () => { live = false; };
  }, []);

  /** A choice on a single-answer card: acknowledge it, then move on. */
  const chooseAndAdvance = (patch: Partial<Answers>) => {
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, ...patch }));
    onAdvance();
  };

  const shown = query
    ? centres.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : centres;

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
        <AuthAction label={continueLabel} enabled={canAdvance(3, answers)} onPress={onAdvance} />
      </QuestionCard>
    );
  }

  return null;
}
