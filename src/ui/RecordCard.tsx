import { Text, View } from "react-native";
import { averageScore, durationWords, recentDrives } from "@/lib/homeView";
import type { ScoreSummary } from "@/lib/homeView";
import type { ProgressEntryWithRoute } from "@/types/db";
import { ScoreSparkline } from "@/ui/ScoreSparkline";

const DISPLAY_SCALE = 1.1;

/** "2 Jul" — the ends of the sparkline, in words, since it draws no axis. */
function shortDate(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Stat({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</Text>
      <Text
        testID={id}
        maxFontSizeMultiplier={DISPLAY_SCALE}
        className="mt-0.5 text-[22px] font-semibold tracking-tight text-primary"
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The record, as evidence for the card above it.
 *
 * Four registers in one container rather than four cards: score, shape, stats,
 * history. Everything here is already computed by `scoreSummary` or is one
 * line of arithmetic on it — the card fetches nothing and decides nothing.
 *
 * No verdict is shown anywhere, and none can be: `user_progress` stores no
 * pass/fail, and it is not derivable from the score, because `aggregate` caps
 * a failed test at 55 and a pass with nine driving faults is also 55.
 */
export function RecordCard({
  summary, rows, width, failed,
}: {
  summary: ScoreSummary;
  rows: ProgressEntryWithRoute[];
  width: number;
  failed: boolean;
}) {
  const drives = recentDrives(rows);
  const firstAt = shortDate(summary.attempts[0]?.at ?? null);
  const lastAt = shortDate(summary.lastAt);
  const average = averageScore(summary);
  // A lone point is centred by sparkPoints — correct behaviour, wrong picture.
  const hasShape = summary.count > 1;

  return (
    <View
      className="mx-5 mt-4 rounded-[20px] bg-card p-5"
      style={{ shadowColor: "#221F1C", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}
    >
      <View className="flex-row items-baseline">
        <Text maxFontSizeMultiplier={DISPLAY_SCALE} className="text-[18.5px] font-semibold tracking-tight text-primary">
          Your record
        </Text>
        {summary.count > 0 && (
          <Text className="ml-auto text-[13px] text-slate-500">
            {summary.count === 1 ? "1 mock test" : `${summary.count} mock tests`}
          </Text>
        )}
      </View>

      {summary.count === 0 ? (
        <Text className="mt-2.5 text-[17px] leading-[24px] text-slate-600">
          {failed
            ? "Your scores will appear here once you're back online."
            : "Nothing recorded yet. Your first score lands here, and the faults you pick up become the thing this screen tells you to work on."}
        </Text>
      ) : (
        <>
          <View className="mt-2.5 flex-row items-end gap-3">
            <Text
              testID="latest-score"
              maxFontSizeMultiplier={DISPLAY_SCALE}
              className="text-[62px] font-bold leading-[62px] tracking-tighter text-primary"
            >
              {summary.latest}
            </Text>
            <Text className="pb-2 text-[21px] font-semibold text-slate-500">/100</Text>
            <View className="flex-1" />
            {summary.delta !== null && summary.delta !== 0 && (
              <Text
                testID="delta"
                maxFontSizeMultiplier={DISPLAY_SCALE}
                className={`mb-3 rounded-lg px-2.5 py-1 text-[15px] font-bold ${
                  summary.delta > 0
                    ? "bg-[#ECFDF5] text-accent-pressed"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {summary.delta > 0 ? `▲ ${summary.delta}` : `▼ ${-summary.delta}`}
              </Text>
            )}
          </View>

          {hasShape ? (
            <>
              <View className="mt-4">
                <ScoreSparkline attempts={summary.attempts} width={width} height={74} />
              </View>
              {/* The sparkline draws no axis, so both ends are named here. */}
              <View className="mt-2 flex-row justify-between">
                <Text className="text-[13px] text-slate-500">
                  {firstAt ? `${summary.attempts[0].score} on ${firstAt}` : `${summary.attempts[0].score} to start`}
                </Text>
                <Text className="text-[13px] text-slate-500">
                  {lastAt ? `${summary.latest} on ${lastAt}` : `${summary.latest} latest`}
                </Text>
              </View>

              <View className="mt-4 h-px bg-slate-200" />
              <View testID="stat-row" className="mt-4 flex-row">
                <Stat id="stat-best" label="Best" value={String(summary.best)} />
                <View className="w-px bg-slate-200" />
                <View className="w-4" />
                <Stat id="stat-average" label="Average" value={String(average)} />
              </View>
            </>
          ) : (
            <Text className="mt-3 text-[14.5px] leading-[21px] text-slate-500">
              One score draws no line. Your second test starts the shape.
            </Text>
          )}

          <View className="mt-5 h-px bg-slate-200" />
          <Text className="mt-4 text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">
            Recent tests
          </Text>
          {drives.map((drive, i) => (
            <View
              key={drive.id ?? `${drive.completed_at}-${i}`}
              className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-slate-200" : ""}`}
            >
              <View className="flex-1">
                <Text className="text-[16.5px] font-semibold text-primary">
                  {shortDate(Date.parse(drive.completed_at ?? "")) ?? "Not yet synced"}
                </Text>
                {drive.routes && (
                  <Text className="mt-0.5 text-[14px] text-slate-500" numberOfLines={1}>
                    {drive.routes.centres
                      ? `${drive.routes.name} · ${drive.routes.centres.name}`
                      : drive.routes.name}
                  </Text>
                )}
              </View>
              <Text
                testID={`history-score-${i}`}
                maxFontSizeMultiplier={DISPLAY_SCALE}
                className="text-[22px] font-semibold tracking-tight text-primary"
              >
                {drive.mock_test_score}
              </Text>
              <Text className="w-16 text-right text-[14px] text-slate-500">
                {durationWords(drive.duration_seconds)}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
