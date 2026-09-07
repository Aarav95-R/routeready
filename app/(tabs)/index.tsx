import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { faultCounts, finding, firstName, greeting, nextStep, scoreSummary } from "@/lib/homeView";
import { listMyProgress } from "@/services/progressRepo";
import { hasSeenWelcome, markWelcomeSeen } from "@/services/welcome";
import { useDevPreview } from "@/stores/devPreview";
import { selectFullName, selectUserId, useSession } from "@/stores/sessionStore";
import type { ProgressEntryWithRoute } from "@/types/db";
import { HowItWorks } from "@/ui/FirstRun";
import { Cell, Group, GroupHeader } from "@/ui/List";
import { FIND_A_CENTRE, NextStepCard } from "@/ui/NextStepCard";
import { PrimaryAction } from "@/ui/PrimaryAction";
import { RecordCard } from "@/ui/RecordCard";
import { Skeleton } from "@/ui/Skeleton";
import { WelcomeBanner } from "@/ui/WelcomeBanner";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { usePressed } from "@/ui/usePressed";
import { body, caption, largeTitle, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";

/**
 * The first screen: what to do next, and the record that argues for it.
 *
 * It opens on a claim rather than a number. The fault bars that used to sit at
 * the bottom as a tally are now the evidence inside the card above, which is
 * the whole of this screen's design — everything the app knows about your
 * weaknesses was already computed here and previously went unsaid.
 *
 * Every rule lives in `homeView`. This file fetches, computes and composes;
 * it decides nothing. Everything comes from one query — `listMyProgress`
 * returns every row this user has, cached, with each row's route and centre
 * joined on, so the screen draws offline and never needs a second round trip.
 */
export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const settingsPress = usePressed();

  const [loaded, setLoaded] = useState<ProgressEntryWithRoute[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const fullName = useSession(selectFullName);
  const userId = useSession(selectUserId);

  // Null until the disk answers. The welcome draws on `false` alone rather than
  // on `!seen`, so it can never flash in and out while that read is in flight.
  const [seenWelcome, setSeenWelcome] = useState<boolean | null>(null);

  // Development only, and stripped from a release build with the control that
  // sets it. It replaces the *data*, not the branch: everything below reads an
  // empty record through the same path a genuinely new account does, so what
  // you are looking at is the screen itself rather than an impression of it.
  const previewFirstRun = useDevPreview((s) => s.firstRun);
  const rows = previewFirstRun ? [] : loaded;
  const failed = previewFirstRun ? false : loadFailed;
  // The welcome is remembered rather than derived, so the preview has to stand
  // in for that too — otherwise dismissing it once during development turns the
  // toggle into one that shows every part of the first run except this.
  const seen = previewFirstRun ? false : seenWelcome;

  const load = useCallback(async () => {
    try {
      const r = await listMyProgress();
      setLoaded(r.data);
    } catch {
      // No cache and no network. The action still works — it navigates
      // within the app and never needed the network.
      setLoadFailed(true);
      setLoaded([]);
    }
    // Deliberately after the rows and not raced with them: the welcome sits
    // above a screen whose shape the record decides, and `hasSeenWelcome`
    // never rejects, so there is nothing to catch and nothing to gain from
    // starting it earlier.
    setSeenWelcome(await hasSeenWelcome(userId));
  }, [userId]);

  // The screen tells you to go and do something, and Expo Router keeps this
  // tab mounted while you do it — so it has to be correct when you come back,
  // not just once when it first mounted.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const summary = scoreSummary(rows ?? []);
  const faults = faultCounts(rows ?? []);
  const step = nextStep(summary, faults);

  // Nothing at all, and we know it: an account that has never driven anything.
  // A failed load looks identical from here and is not the same thing — it
  // knows nothing about the record, so it is neither taught the app nor read a
  // verdict on a record it could not fetch.
  const firstRun = rows !== null && rows.length === 0 && !failed;

  // Two different questions, and the second is why this is not derived from the
  // first. `firstRun` asks whether the record is empty, which is also true on
  // your fourth launch if you have not driven yet; this asks whether the
  // account has ever been told where to start, which happens once.
  const showWelcome = firstRun && seen === false;

  // Both ways out of the banner write the same flag, because they mean the same
  // thing: this account has been shown where to start. The flag is set here
  // rather than awaited so the strip goes at the tap — the disk write cannot
  // fail in a way the screen could report anyway.
  const closeWelcome = useCallback(() => {
    setSeenWelcome(true);
    void markWelcomeSeen(userId);
  }, [userId]);

  // The welcome adds a row above everything, so the stagger below it counts
  // from one further along. Written once rather than as a conditional index on
  // each of the five panels underneath.
  const enterAt = (n: number) => enterFrom(showWelcome ? n + 1 : n);

  const name = firstName(fullName);
  const now = new Date();
  // The tab bar already says Home. The name is the one thing this screen knows
  // that the tab bar does not, and sign-up went to the trouble of asking for it.
  const salutation = firstRun ? "Welcome" : greeting(now);
  const title = name ? `${salutation}, ${name}` : salutation;

  // Screen width less the card's own margins (20 each side) and padding (20
  // each side). Kept in one place because the sparkline has to be told its
  // width and would otherwise drift from the card holding it.
  const sparkWidth = Math.max(120, width - 40 - 40);

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View
          entering={enterFrom(0)}
          className="flex-row items-start justify-between px-4 pb-2 pt-2"
        >
          <View style={{ flex: 1 }}>
            {/* Whether this is a welcome or a greeting depends on whether the
                account has driven anything, which the rows have not said yet —
                so the title waits with the rest of the screen rather than
                guessing and correcting itself a frame later. */}
            {rows === null ? (
              <Skeleton h={largeTitle.lineHeight} w={220} />
            ) : (
              <Text
                maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
                style={{ ...largeTitle, color: colors.label }}
              >
                {title}
              </Text>
            )}
            {/* `finding` is a claim about your record, so it is only said when
                the record actually arrived. */}
            {rows !== null && !failed && (
              <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 6 }}>
                {finding(summary, now)}
              </Text>
            )}
          </View>
          <Pressable
            testID="settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => router.push("/settings")}
            {...settingsPress.pressProps}
            // Not Pressable's own `pressed` — see usePressed. This used to
            // render as a bare icon with no disc behind it.
            style={{
              height: 36,
              width: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
              backgroundColor: "rgba(28,25,23,0.06)",
              opacity: settingsPress.pressed ? 0.7 : 1,
            }}
          >
            <Ionicons name="settings-outline" size={19} color={colors.label} />
          </Pressable>
        </Animated.View>

        {rows === null ? (
          <View className="mx-5 gap-4">
            <Skeleton h={240} w="100%" />
            <Skeleton h={300} w="100%" />
          </View>
        ) : (
          <>
            {/* Above the record's own reading of the screen, because it is not
                about the record: it is about the account having just been made,
                and it is gone the moment it has been acted on. */}
            {showWelcome && (
              <Animated.View entering={enterFrom(1)} style={{ marginTop: 8 }}>
                <WelcomeBanner
                  onBrowse={() => { closeWelcome(); router.push("/centres"); }}
                  onDismiss={closeWelcome}
                />
              </Animated.View>
            )}
            <Animated.View entering={enterAt(1)}>
              <NextStepCard step={step} onAction={() => router.push("/centres")} />
            </Animated.View>
            {firstRun && (
              <Animated.View entering={enterAt(2)}>
                <HowItWorks />
              </Animated.View>
            )}
            <Animated.View entering={enterAt(firstRun ? 3 : 2)}>
              <RecordCard summary={summary} rows={rows} width={sparkWidth} failed={failed} />
            </Animated.View>
            {/* The introduction runs four panels deep, and the action that
                starts a drive is at the top of it. Repeated here so reading to
                the end is not answered with a scroll back up. */}
            {firstRun && (
              <Animated.View entering={enterAt(4)} style={{ marginTop: 18 }}>
                <Group>
                  <Cell>
                    <PrimaryAction label={FIND_A_CENTRE} onPress={() => router.push("/centres")} />
                  </Cell>
                </Group>
              </Animated.View>
            )}
            {/* Most people open this app in the evening, indoors, nowhere near
                a car. Without this the first screen has nothing on it that can
                be done from where they are sitting. */}
            {firstRun && (
              <Animated.View entering={enterAt(5)}>
                <GroupHeader>Not driving tonight</GroupHeader>
                <Group>
                  <Cell testID="quiz-row" chevron onPress={() => router.push("/quiz")}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...body, color: colors.label }}>Theory quiz</Text>
                      <Text style={{ ...caption, color: colors.labelTertiary, marginTop: 2 }}>
                        Twelve questions, three minutes, from the sofa.
                      </Text>
                    </View>
                  </Cell>
                </Group>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
