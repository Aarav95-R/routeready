import { useCallback, useState } from "react";
import { LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated from "react-native-reanimated";
import { loadFailure, type LoadFailure } from "@/lib/quizError";
import { buildSections, practiseSummary } from "@/lib/quizView";
import { listQuestions } from "@/services/quizRepo";
import { loadResults, type QuizResults } from "@/services/quizResults";
import { useNetwork } from "@/stores/networkStore";
import type { QuizQuestion } from "@/types/db";
import { Group, GroupHeader } from "@/ui/List";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { Skeleton } from "@/ui/Skeleton";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, caption, footnote, MAX_DISPLAY_SCALE, largeTitle, subheadline, title2 } from "@/ui/type";

/**
 * The twenty vehicle safety questions, as something to read.
 *
 * Two jobs, and the split between them is the whole design. This screen is the
 * reference: every question, grouped, openable, no scoring. The round behind
 * the button is the drill. Trying to make one screen do both is how you get a
 * quiz you cannot look anything up in.
 *
 * What changed in the restage is which of the two the eye lands on. The drill
 * used to be a white card with a green button in it, sitting on a warm field
 * above twenty more white cards — the same shape as the thing it was meant to
 * stand out from. It is now the one tinted surface in the app: clay, because
 * theme.ts splits the palette so that green is the road and clay is you, and
 * how much of the bank you have got right is a fact about you. The green
 * button reads louder inside clay than it ever did inside white.
 *
 * Every rule lives in `quizView`. This file fetches and composes.
 */

// Row expansion is the one thing here that animates, and on Android the
// built-in animator has to be switched on by hand. Guarded because the flag
// does not exist on the new architecture's Fabric view manager.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EMPTY_RESULTS: QuizResults = { answers: {}, lastScore: null };

/** The tick, the clay dot, and — for a question never answered — nothing. */
function StateMark({ state, testID }: { state: string; testID?: string }) {
  if (state === "known") {
    return (
      <View testID={testID} style={{ width: 18, alignItems: "center" }}>
        <Ionicons name="checkmark" size={16} color={colors.accent} accessibilityLabel="Known" />
      </View>
    );
  }
  if (state === "revisit") {
    return (
      <View testID={testID} style={{ width: 18, alignItems: "center" }}>
        <View
          accessibilityLabel="Worth another look"
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.clay }}
        />
      </View>
    );
  }
  // Nothing at all. Twenty hollow rings would shout louder than the handful
  // of ticks that carry the information.
  return <View style={{ width: 18 }} />;
}

export default function Quiz() {
  const router = useRouter();
  const online = useNetwork((s) => s.online);

  const [rows, setRows] = useState<QuizQuestion[] | null>(null);
  const [results, setResults] = useState<QuizResults>(EMPTY_RESULTS);
  const [stale, setStale] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // The results are on the device and cannot fail. Reading them outside the
    // try means a dead network loses the questions but never the ticks.
    setResults(await loadResults());
    try {
      const r = await listQuestions();
      setRows(r.data);
      setStale(r.stale);
      setFailure(null);
    } catch (e) {
      // The reason is kept, not flattened to one sentence: a build querying a
      // column its Supabase project has never had migrated is a different
      // problem from a dead network, and needs a different thing done about it.
      setFailure(loadFailure(e));
    }
  }, []);

  // On focus, not on mount: a finished round changes the results on disk, and
  // the hero behind it would otherwise still be showing the old count.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Holds `retrying` across the attempt so the button can say it is working.
  // Without it a fast failure re-rendered the identical error and the identical
  // button, which reads exactly like a press that never registered.
  const retry = useCallback(() => {
    if (retrying) return;
    setRetrying(true);
    void (async () => {
      await load();
      setRetrying(false);
    })();
  }, [load, retrying]);

  // One row open at a time. Two paragraphs already push the next heading off
  // the screen; twenty would make the list unusable as a list.
  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((current) => (current === id ? null : id));
  }, []);

  const sections = buildSections(rows ?? [], results);
  const summary = practiseSummary(rows ?? [], results);

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={enterFrom(0)} className="px-4 pb-1 pt-2">
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
            Quiz
          </Text>
          <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 6 }}>
            Two questions at the kerb, every test. Here are all twenty, and a round to
            drill them.
          </Text>
        </Animated.View>

        <OfflineBanner visible={stale || !online} />

        {failure && (
          <View testID="quiz-error" style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <Text style={{ ...body, fontWeight: "600", color: colors.label, textAlign: "center" }}>
              {failure.headline}
            </Text>
            {failure.detail !== "" && (
              <Text style={{ ...caption, color: colors.labelTertiary, textAlign: "center" }}>
                {failure.detail}
              </Text>
            )}
            <Pressable
              testID="quiz-retry"
              accessibilityRole="button"
              accessibilityState={{ disabled: retrying }}
              disabled={retrying}
              onPress={retry}
              style={{ marginTop: 4, minHeight: 44, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: retrying ? colors.fill : colors.accent }}
            >
              <Text testID="quiz-retry-label" style={{ ...body, fontWeight: "600", color: retrying ? colors.labelTertiary : "#FFFFFF" }}>
                {retrying ? "Trying…" : "Try again"}
              </Text>
            </Pressable>
          </View>
        )}

        {rows === null && !failure && (
          <View style={{ marginHorizontal: 16, marginTop: 22, gap: 12 }}>
            <Skeleton h={148} />
            {[0, 1, 2].map((i) => <Skeleton key={i} h={62} />)}
          </View>
        )}

        {rows !== null && !failure && (
          <Animated.View
            entering={enterFrom(1)}
            style={{
              marginHorizontal: 16, marginTop: 18, backgroundColor: colors.clayTint,
              // A shade rounder than the 10pt every list group uses. The hero is
              // the one thing on the tab that is not a list, and the radius is
              // the cheapest way to say so on a surface that has no border.
              borderRadius: 14, padding: 16, paddingTop: 18, gap: 12,
            }}
          >
            {/* Done first, and in the heavier ink. It is the half that is true
                about the person; what is left is the size of the job and sits
                back a step. "9 of 20 known" put those the other way round and
                read as a score. */}
            <Text
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...title2, color: colors.clayInk }}
            >
              <Text testID="quiz-known-count">{summary.done}</Text>
              {summary.toGo !== "" && (
                <>
                  {/* Its own node rather than glued to the number: nested text
                      concatenates, and a separator inside the same string is
                      then part of the words either half is read as. */}
                  <Text style={{ color: colors.clayInkSoft }}>{"  ·  "}</Text>
                  <Text style={{ color: colors.clayInkSoft, fontWeight: "600" }}>
                    {summary.toGo}
                  </Text>
                </>
              )}
            </Text>

            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: summary.total, now: summary.known }}
              style={{ height: 6, borderRadius: 3, backgroundColor: colors.clayTrack, overflow: "hidden" }}
            >
              <View
                testID="quiz-progress-fill"
                style={{
                  height: "100%", borderRadius: 3, backgroundColor: colors.clay,
                  width: summary.total === 0 ? "0%" : `${Math.round((summary.known / summary.total) * 100)}%`,
                }}
              />
            </View>

            {/* The sentence explains and the button acts. Putting all three
                facts on the control instead gives you a label that wraps to
                two lines the moment anyone turns their text size up — and
                this app caps display type at 110% because that setting gets
                used. */}
            <Text style={{ ...subheadline, color: colors.clayInkSoft }}>
              Ten questions, four answers to pick from. The words to say out loud come
              after each one.
            </Text>

            <Pressable
              testID="quiz-start"
              accessibilityRole="button"
              accessibilityLabel="Start the quiz"
              accessibilityHint="Ten questions, multiple choice"
              onPress={() => router.push("/quiz/round")}
              style={({ pressed }) => ({
                minHeight: 52, borderRadius: 10, flexDirection: "row", gap: 8,
                alignItems: "center", justifyContent: "center",
                backgroundColor: pressed ? colors.accentPressed : colors.accent,
              })}
            >
              <Ionicons name="play" size={17} color="#FFFFFF" />
              <Text
                testID="quiz-start-label"
                maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
                style={{ ...body, fontWeight: "600", color: "#FFFFFF" }}
              >
                Start the quiz
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Without this the tab reads as one feature with a card stuck on top.
            With it, the split the whole design rests on is finally said out
            loud: the hero is the drill, the list is the reference. It names
            the job rather than restating the count, which the hero above has
            already given twice. */}
        {rows !== null && rows.length > 0 && !failure && (
          <GroupHeader>
            <Text testID="quiz-reference-header">Look them up</Text>
            <Text testID="quiz-reference-count">{rows.length}</Text>
          </GroupHeader>
        )}

        {sections.map((section, s) => (
          <Animated.View key={section.title} entering={enterFrom(s + 2)}>
            <GroupHeader>
              <Text>{section.title}</Text>
              <Text testID={`quiz-count-${section.title}`}>{section.count}</Text>
            </GroupHeader>
            <Group>
              {section.data.map((v) => {
                const open = openId === v.question.id;
                return (
                  <Pressable
                    key={v.question.id}
                    testID={`quiz-row-${v.question.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    onPress={() => toggle(v.question.id)}
                    style={{ paddingHorizontal: 16, paddingVertical: 11, minHeight: 44 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, fontWeight: "600", color: colors.label }}>
                          {v.question.topic}
                        </Text>
                        <Text style={{ ...caption, color: colors.labelTertiary, marginTop: 2 }}>
                          {v.kind}
                        </Text>
                      </View>
                      <StateMark state={v.state} testID={v.state === "unseen" ? undefined : `quiz-state-${v.question.id}`} />
                      <Ionicons
                        name={open ? "chevron-up" : "chevron-down"}
                        size={15}
                        color={colors.labelTertiary}
                      />
                    </View>

                    {open && (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        <Text style={{ ...subheadline, fontWeight: "600", color: colors.label }}>
                          {v.question.question}
                        </Text>
                        <Text style={{ ...footnote, color: colors.labelTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                          What to say
                        </Text>
                        {/* Quoted, because it is a sentence to say out loud
                            rather than a fact to absorb. */}
                        <Text style={{ ...subheadline, color: colors.labelSecondary }}>
                          &ldquo;{v.question.answer}&rdquo;
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </Group>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
