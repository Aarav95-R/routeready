import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { faultCounts, finding, firstName, greeting, nextStep, scoreSummary } from "@/lib/homeView";
import { listMyProgress } from "@/services/progressRepo";
import { selectFullName, useSession } from "@/stores/sessionStore";
import type { ProgressEntryWithRoute } from "@/types/db";
import { NextStepCard } from "@/ui/NextStepCard";
import { RecordCard } from "@/ui/RecordCard";
import { Skeleton } from "@/ui/Skeleton";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";

/**
 * The design was drawn at a fixed size, and iOS will happily render it 130%
 * larger if the phone's text size is turned up — which is how a screen that
 * matches the mockup on one device looks blown up on another. Display type is
 * capped; body copy is left free to scale, because that is what the setting is
 * actually for.
 */
const DISPLAY_SCALE = 1.1;

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
  const fullName = useSession(selectFullName);

  const [rows, setRows] = useState<ProgressEntryWithRoute[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listMyProgress();
      setRows(r.data);
    } catch {
      // No cache and no network. The greeting still works, and so does the
      // action — it navigates within the app and never needed the network.
      setFailed(true);
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const name = firstName(fullName);
  const hello = name ? `${greeting(now)}, ${name}` : greeting(now);

  const summary = scoreSummary(rows ?? []);
  const faults = faultCounts(rows ?? []);
  const line = finding(summary, now);
  const step = nextStep(summary, faults);

  // Screen width less the card's own margins (20 each side) and padding (20
  // each side). Kept in one place because the sparkline has to be told its
  // width and would otherwise drift from the card holding it.
  const sparkWidth = Math.max(120, width - 40 - 40);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Nothing is drawn behind the welcome. A band around it would turn the
            one personal line on the screen into a banner. */}
        <Animated.View entering={enterFrom(0)} className="flex-row items-start gap-3 px-6 pb-6 pt-2">
          <View className="flex-1">
            <Text
              maxFontSizeMultiplier={DISPLAY_SCALE}
              className="text-[30px] leading-[35px] font-semibold tracking-tight text-primary"
              style={{ fontFamily: "Inter_600SemiBold" }}
            >
              {hello}
            </Text>
            {rows === null
              ? <View className="mt-2.5"><Skeleton h={18} w="70%" /></View>
              : (
                <Text
                  maxFontSizeMultiplier={DISPLAY_SCALE}
                  className="mt-2 text-[18px] leading-[25px] font-semibold text-accent-pressed"
                >
                  {line}
                </Text>
              )}
          </View>
          <Pressable
            testID="settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => router.push("/settings")}
            className="mt-1 h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-card active:opacity-70"
          >
            <Ionicons name="settings-outline" size={24} color={colors.primary} />
          </Pressable>
        </Animated.View>

        {rows === null ? (
          <View className="mx-5 gap-4">
            <Skeleton h={240} w="100%" />
            <Skeleton h={300} w="100%" />
          </View>
        ) : (
          <>
            <Animated.View entering={enterFrom(1)}>
              <NextStepCard step={step} onAction={() => router.push("/centres")} />
            </Animated.View>
            <Animated.View entering={enterFrom(2)}>
              <RecordCard summary={summary} rows={rows} width={sparkWidth} failed={failed} />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
