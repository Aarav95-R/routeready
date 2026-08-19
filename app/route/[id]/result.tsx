import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { saveProgress } from "@/services/progressRepo";
import { creditsByCategory, faultElapsedMs, formatElapsed } from "@/lib/resultView";
import { formatDistance } from "@/lib/navigation";
import { useMockTest } from "@/stores/mockTestStore";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { enterAfter, popIn } from "@/ui/motion";
import { FACES } from "@/ui/type";

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { result, reset, marks, startedAt, deviations } = useMockTest();

  useEffect(() => {
    if (!result) return;
    Haptics.notificationAsync(
      result.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    );
    saveProgress({
      route_id: id, mock_test_score: result.score,
      mistakes: result.tags, duration_seconds: result.durationSeconds,
      // Recorded alongside the faults, never among them: leaving the route is
      // not on the DVSA marking sheet, so it cannot move the score.
      deviations,
    }).catch(() => {});
  }, [result, id, deviations]);

  if (!result) return null;
  const mins = Math.floor(result.durationSeconds / 60);
  const secs = result.durationSeconds % 60;
  const wentWell = creditsByCategory(marks);
  const faultTimes = faultElapsedMs(result.faults, marks, startedAt);

  return (
    <SafeAreaView className="flex-1 bg-primary">
      <ScrollView contentContainerClassName="items-center gap-3 px-4 pb-8 pt-6">
        <Animated.View
          entering={popIn(150)}
          className={`h-28 w-28 items-center justify-center rounded-full border-[5px] ${result.passed ? "border-accent" : "border-danger"}`}
        >
          <Text className={`text-[13px] font-bold tracking-[0.18em] ${result.passed ? "text-emerald-400" : "text-red-400"}`}>
            {result.passed ? "PASS" : "FAIL"}
          </Text>
          <Text className="text-[11px] text-slate-400">{result.minors} minors</Text>
        </Animated.View>
        <Animated.View entering={enterAfter(350)} className="items-center">
          <Text className="text-[21px] font-semibold tracking-tight text-surface" style={{ fontFamily: FACES["600"] }}>
            {result.passed ? "You'd have passed" : "Not this time"}
          </Text>
          <Text className="text-[12px] text-slate-400">
            {result.minors} minor{result.minors === 1 ? "" : "s"} · {result.majors} major{result.majors === 1 ? "" : "s"} · {mins} min {secs} s · score {result.score}
          </Text>
        </Animated.View>
        {wentWell.length > 0 && (
          <Animated.View entering={enterAfter(400)} className="w-full">
            <Card className="gap-2">
              <Text className="text-[13px] font-semibold text-accent">What went well</Text>
              {wentWell.map((c) => (
                <View key={c.category} className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-primary">{c.label}</Text>
                  <Text className="text-[12px] font-bold text-accent">×{c.count}</Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}
        {result.faults.map((f, i) => {
          const elapsed = faultTimes[i];
          return (
            <Animated.View key={i} entering={enterAfter(450 + i * 90)} className="w-full">
              <Card className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[14px] font-semibold text-primary">{f.tag}</Text>
                  <Text className="text-[11px] text-slate-500">
                    {f.detail}{elapsed != null ? ` · ${formatElapsed(elapsed)}` : ""}
                  </Text>
                </View>
                <Text className={`text-[10px] font-bold uppercase ${f.severity === "major" ? "text-danger" : "text-warning"}`}>
                  {f.severity}
                </Text>
              </Card>
            </Animated.View>
          );
        })}
        {result.faults.length === 0 && (
          <Animated.View entering={enterAfter(450)} className="w-full">
            <Card><Text className="text-center text-[13px] font-semibold text-accent">A clean drive — no faults recorded</Text></Card>
          </Animated.View>
        )}
        {deviations.length > 0 && (
          <Animated.View entering={enterAfter(500 + result.faults.length * 90)} className="w-full">
            <Card className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-semibold text-primary">
                  {deviations.length === 1 ? "Went off route once" : `Went off route ${deviations.length} times`}
                </Text>
                {/* Said plainly, and not scored. The learner is being told
                    there is route left worth re-driving, not marked down for
                    something no examiner marks. */}
                <Text className="text-[11px] text-slate-500">
                  {formatDistance(deviations.reduce((s, d) => s + d.skippedM, 0))} of the route not driven · not a fault
                </Text>
              </View>
              <Text className="text-[10px] font-bold uppercase text-warning">off route</Text>
            </Card>
          </Animated.View>
        )}
        <View className="mt-2 w-full">
          {/* Back to where the test was chosen, ready to go again — the route
              detail page this used to dismiss to no longer exists. */}
          <Button title="Done" onPress={() => { reset(); router.dismissTo(`/route/${id}/start`); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
