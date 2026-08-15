import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { faultCounts, nextStep, scoreSummary } from "@/lib/homeView";
import { listMyProgress } from "@/services/progressRepo";
import type { ProgressEntryWithRoute } from "@/types/db";
import { NextStepCard } from "@/ui/NextStepCard";
import { RecordCard } from "@/ui/RecordCard";
import { Skeleton } from "@/ui/Skeleton";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { largeTitle, MAX_DISPLAY_SCALE } from "@/ui/type";

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

  const [rows, setRows] = useState<ProgressEntryWithRoute[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listMyProgress();
      setRows(r.data);
    } catch {
      // No cache and no network. The action still works — it navigates
      // within the app and never needed the network.
      setFailed(true);
      setRows([]);
    }
  }, []);

  // The screen tells you to go and do something, and Expo Router keeps this
  // tab mounted while you do it — so it has to be correct when you come back,
  // not just once when it first mounted.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const summary = scoreSummary(rows ?? []);
  const faults = faultCounts(rows ?? []);
  const step = nextStep(summary, faults);

  // Screen width less the card's own margins (20 each side) and padding (20
  // each side). Kept in one place because the sparkline has to be told its
  // width and would otherwise drift from the card holding it.
  const sparkWidth = Math.max(120, width - 40 - 40);

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View
          entering={enterFrom(0)}
          className="flex-row items-center justify-between px-4 pb-2 pt-2"
        >
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{ ...largeTitle, color: colors.label }}
          >
            Home
          </Text>
          <Pressable
            testID="settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              {
                height: 36,
                width: 36,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 18,
                backgroundColor: "rgba(28,25,23,0.06)",
              },
              pressed && { opacity: 0.7 },
            ]}
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
