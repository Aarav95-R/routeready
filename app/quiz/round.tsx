import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { loadFailure, type LoadFailure } from "@/lib/quizError";
import { dealRound, scoreLine, type RoundQuestion } from "@/lib/quizRound";
import { kindLabel } from "@/lib/quizView";
import { listQuestions } from "@/services/quizRepo";
import { loadResults, recordAnswer, recordRound } from "@/services/quizResults";
import type { QuizQuestion } from "@/types/db";
import { ChoiceRow, type ChoiceState } from "@/ui/ChoiceRow";
import { Group, GroupHeader } from "@/ui/List";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";
import { body, caption, footnote, largeTitle, MAX_DISPLAY_SCALE, subheadline, title2 } from "@/ui/type";

/**
 * Ten questions, one screen each, then the summary.
 *
 * The summary is a state of this screen rather than a route of its own. A
 * separate route would mean carrying ten answers across a navigation, which
 * means a store — and this component is the only thing that ever reads them.
 * The mock test has a `result` route because its score outlives the drive and
 * gets written to the database; a quiz round's does not.
 *
 * Answering is two taps. Picking an option selects it; the button commits it.
 * On four options of fifteen-point text a mis-tap is easy, and a mis-tap that
 * instantly and permanently marks a question wrong is what people close an app
 * over.
 */

type Answered = { question: QuizQuestion; correct: boolean };

export default function Round() {
  const router = useRouter();

  const [bank, setBank] = useState<QuizQuestion[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const [round, setRound] = useState<RoundQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [done, setDone] = useState(false);

  // Dealt once, from the results as they stood when the round opened. Re-reading
  // them mid-round would re-band questions the learner is part-way through.
  const deal = useCallback((questions: QuizQuestion[], results: Awaited<ReturnType<typeof loadResults>>) => {
    setRound(dealRound(questions, results));
    setIndex(0);
    setPicked(null);
    setCommitted(false);
    setAnswers([]);
    setDone(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const results = await loadResults();
      setLastScore(results.lastScore);
      try {
        const r = await listQuestions();
        setBank(r.data);
        deal(r.data, results);
      } catch (e) {
        // The tab is the only way in and it has already fetched, so the cache
        // is warm by the time anyone is here. Reaching this means there is
        // genuinely nothing on the device to ask — and the reason is worth
        // naming in the same words the tab uses.
        setFailure(loadFailure(e));
      }
    })();
  }, [deal]);

  const current = round[index];

  const check = useCallback(() => {
    if (picked === null || committed || !current) return;
    const correct = current.choices[picked].correct;
    setCommitted(true);
    setAnswers((a) => [...a, { question: current.question, correct }]);
    void Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
    // Written per question rather than per round, so closing the round four
    // questions in keeps those four.
    void recordAnswer(current.question.id, correct);
  }, [picked, committed, current]);

  const next = useCallback(() => {
    if (index + 1 >= round.length) {
      setDone(true);
      void recordRound(answers.filter((a) => a.correct).length);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
    setCommitted(false);
  }, [index, round.length, answers]);

  const missed = answers.filter((a) => !a.correct);
  const score = answers.length - missed.length;

  if (failure) {
    return (
      <SafeAreaView className="flex-1 bg-field" edges={["top", "bottom"]}>
        <View testID="round-error" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 }}>
          <Text style={{ ...body, fontWeight: "600", color: colors.label, textAlign: "center" }}>
            {failure.headline}
          </Text>
          {failure.detail !== "" && (
            <Text style={{ ...caption, color: colors.labelTertiary, textAlign: "center" }}>
              {failure.detail}
            </Text>
          )}
          <Pressable
            testID="round-error-back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={{ marginTop: 4, minHeight: 44, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.accent }}
          >
            <Text style={{ ...body, fontWeight: "600", color: "#FFFFFF" }}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (bank === null) {
    return (
      <SafeAreaView className="flex-1 bg-field" edges={["top", "bottom"]}>
        <View style={{ margin: 16, gap: 12 }}>
          <Skeleton h={78} />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={62} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView className="flex-1 bg-field" edges={["top", "bottom"]}>
        <View testID="round-summary" style={{ flex: 1 }}>
          <View style={{ paddingVertical: 8, alignItems: "center" }}>
            <Text style={{ ...subheadline, fontWeight: "600", color: colors.labelTertiary }}>Round complete</Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <Text
              testID="round-score"
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...largeTitle, color: colors.label, paddingHorizontal: 16, paddingTop: 6, fontVariant: ["tabular-nums"] }}
            >
              {`${score} of ${answers.length}`}
            </Text>
            <Text style={{ ...subheadline, color: colors.labelSecondary, paddingHorizontal: 16, paddingTop: 6 }}>
              {scoreLine(score, answers.length, lastScore)}
            </Text>

            {/* One bar per question, in the order they were asked. Clay for a
                miss, not red: the red belongs to the moment of answering, and
                three red bars on the screen you see after every single round
                reads as a telling-off. */}
            <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 16 }}>
              {answers.map((a, i) => (
                <View
                  key={i}
                  style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: a.correct ? colors.accent : colors.clay }}
                />
              ))}
            </View>

            {missed.length > 0 && (
              <>
                <GroupHeader>
                  <Text>Worth another look</Text>
                  <Text>{missed.length}</Text>
                </GroupHeader>
                <Group>
                  {missed.map((a) => (
                    <View
                      key={a.question.id}
                      testID={`round-missed-${a.question.id}`}
                      style={{ paddingHorizontal: 16, paddingVertical: 11, minHeight: 44, gap: 6 }}
                    >
                      <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, fontWeight: "600", color: colors.label }}>
                        {a.question.topic}
                      </Text>
                      <Text style={{ ...caption, color: colors.labelTertiary }}>
                        {kindLabel(a.question)}
                      </Text>
                      <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 2 }}>
                        &ldquo;{a.question.answer}&rdquo;
                      </Text>
                    </View>
                  ))}
                </Group>
              </>
            )}
          </ScrollView>

          <View style={{ padding: 16, gap: 2, borderTopWidth: 1, borderTopColor: colors.separator }}>
            <Pressable
              testID="round-again"
              accessibilityRole="button"
              onPress={() => {
                // Re-read the results so the fresh round bands on what the
                // round just finished actually changed.
                void (async () => deal(bank, await loadResults()))();
              }}
              style={({ pressed }) => ({
                minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center",
                backgroundColor: pressed ? colors.accentPressed : colors.accent,
              })}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, fontWeight: "600", color: "#FFFFFF" }}>
                Another round
              </Text>
            </Pressable>
            <Pressable
              testID="round-done"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={{ minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
            >
              <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, fontWeight: "600", color: colors.accentInk }}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView className="flex-1 bg-field" edges={["top", "bottom"]}>
        <View testID="round-error" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ ...caption, color: colors.labelSecondary, textAlign: "center" }}>
            There are no questions to ask yet.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const stateFor = (i: number): ChoiceState => {
    if (!committed) return picked === i ? "selected" : "idle";
    if (current.choices[i].correct) return "correct";
    if (picked === i) return "wrong";
    return "faded";
  };

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2 }}>
        <Pressable
          testID="round-close"
          accessibilityRole="button"
          accessibilityLabel="Close round"
          onPress={() => router.back()}
          hitSlop={10}
          style={{ padding: 4 }}
        >
          <Ionicons name="close" size={22} color={colors.labelTertiary} />
        </Pressable>
        <Text
          testID="round-counter"
          style={{ ...subheadline, fontWeight: "600", color: colors.labelTertiary, fontVariant: ["tabular-nums"] }}
        >
          {`${index + 1} of ${round.length}`}
        </Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={{ height: 3, marginHorizontal: 16, marginBottom: 18, borderRadius: 2, backgroundColor: colors.fill, overflow: "hidden" }}>
        <View
          testID="round-progress"
          style={{ height: "100%", backgroundColor: colors.clay, width: `${((index + 1) / Math.max(round.length, 1)) * 100}%` }}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ ...footnote, color: colors.labelTertiary, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20 }}>
          {kindLabel(current.question)}
        </Text>
        <Text
          testID="round-question"
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          style={{ ...title2, color: colors.label, paddingHorizontal: 20, paddingTop: 7 }}
        >
          {current.question.question}
        </Text>

        <View style={{ gap: 8, paddingHorizontal: 16, paddingTop: 20 }}>
          {current.choices.map((choice, i) => (
            <ChoiceRow
              key={`${current.question.id}-${i}`}
              testID={`round-choice-${i}`}
              text={choice.text}
              state={stateFor(i)}
              onPress={committed ? undefined : () => setPicked(i)}
            />
          ))}
        </View>

        {committed && (
          <View testID="round-answer" style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text style={{ ...footnote, color: colors.labelTertiary, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 4, paddingBottom: 7 }}>
              What to say
            </Text>
            <View style={{ backgroundColor: colors.cell, borderRadius: 10, padding: 16 }}>
              <Text style={{ ...subheadline, color: colors.labelSecondary }}>
                &ldquo;{current.question.answer}&rdquo;
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.separator }}>
        <Pressable
          testID="round-cta"
          accessibilityRole="button"
          accessibilityState={{ disabled: !committed && picked === null }}
          disabled={!committed && picked === null}
          onPress={committed ? next : check}
          style={({ pressed }) => ({
            minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center",
            backgroundColor: !committed && picked === null
              ? colors.fill
              : pressed ? colors.accentPressed : colors.accent,
          })}
        >
          <Text
            testID="round-cta-label"
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{
              ...body, fontWeight: "600",
              color: !committed && picked === null ? colors.labelTertiary : "#FFFFFF",
            }}
          >
            {committed ? (index + 1 >= round.length ? "See how you did" : "Next question") : "Check answer"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
