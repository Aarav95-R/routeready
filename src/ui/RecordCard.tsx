import { Text, View } from "react-native";
import { averageScore, durationWords, recentDrives } from "@/lib/homeView";
import type { ScoreSummary } from "@/lib/homeView";
import type { ProgressEntryWithRoute } from "@/types/db";
import { MarkingSheet } from "@/ui/FirstRun";
import { Cell, Group, GroupHeader } from "@/ui/List";
import { colors } from "@/ui/theme";
import { body, caption, footnote, largeTitle, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";
import { ScoreSparkline } from "@/ui/ScoreSparkline";

/** "2 Jul" — the ends of the sparkline, in words, since it draws no axis. */
function shortDate(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The record, as evidence for the card above it.
 *
 * Score, shape, stats and history, each as rows in a grouped list rather than
 * four registers in one card. Everything here is already computed by
 * `scoreSummary` or is one line of arithmetic on it — the card fetches
 * nothing and decides nothing.
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
  // `best` and `average` are only ever null when `count === 0`, so this is
  // never false when `count > 1` alone would be true — but spelling it out
  // lets TypeScript narrow both to `number` below, instead of trusting a
  // guard it cannot see through.
  const hasShape = summary.count > 1 && summary.best !== null && average !== null;

  // A failed load knows nothing about whether you have driven anything, so it
  // stays a sentence: an empty sheet here would state something untrue.
  if (summary.count === 0 && failed) {
    return (
      <>
        <GroupHeader>Record</GroupHeader>
        <Group>
          <Cell>
            <Text style={{ ...subheadline, color: colors.labelSecondary, flex: 1 }}>
              Your scores will appear here once you&apos;re back online.
            </Text>
          </Cell>
        </Group>
      </>
    );
  }

  /**
   * Nothing driven yet. The sheet the record is kept on is shown empty rather
   * than described in a sentence — it is the same form the examiner marks, it
   * is what every score on this screen is computed from, and a learner
   * otherwise meets it for the first time on test day.
   */
  if (summary.count === 0) {
    return (
      <>
        <GroupHeader>What the examiner marks</GroupHeader>
        <Group>
          <Cell>
            <MarkingSheet />
          </Cell>
          <Cell>
            <Text style={{ ...subheadline, color: colors.labelSecondary, flex: 1 }}>
              Nobody is marking you yet. This is the DL25, the sheet a real examiner
              fills in — you get to know it long before test day, which is rather the point.
            </Text>
          </Cell>
        </Group>
      </>
    );
  }

  return (
    <>
      <GroupHeader>Record</GroupHeader>
      <Group testID={hasShape ? "stat-row" : undefined}>
        <Cell>
          <View style={{ flex: 1 }}>
            <Text
              testID="latest-score"
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...largeTitle, color: colors.label }}
            >
              {summary.latest}
            </Text>
            <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 2 }}>
              Latest, out of 100
            </Text>
          </View>
          {summary.delta !== null && summary.delta !== 0 && (
            <Text
              testID="delta"
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{
                ...footnote,
                color: summary.delta > 0 ? colors.accent : colors.labelTertiary,
              }}
            >
              {summary.delta > 0 ? `▲ ${summary.delta}` : `▼ ${-summary.delta}`}
            </Text>
          )}
        </Cell>

        {hasShape ? (
          <Cell>
            <View style={{ flex: 1 }}>
              <ScoreSparkline attempts={summary.attempts} width={width} height={74} />
              {/* The sparkline draws no axis, so both ends are named here. */}
              <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ ...caption, color: colors.labelTertiary }}>
                  {firstAt ? `${summary.attempts[0].score} on ${firstAt}` : `${summary.attempts[0].score} to start`}
                </Text>
                <Text style={{ ...caption, color: colors.labelTertiary }}>
                  {lastAt ? `${summary.latest} on ${lastAt}` : `${summary.latest} latest`}
                </Text>
              </View>
            </View>
          </Cell>
        ) : (
          <Cell>
            <Text style={{ ...subheadline, color: colors.labelSecondary, flex: 1 }}>
              One score draws no line. Your second test starts the shape.
            </Text>
          </Cell>
        )}

        {hasShape && (
          <Cell>
            <Text style={{ ...body, color: colors.label, flex: 1 }}>Best</Text>
            <Text
              testID="stat-best"
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...body, fontWeight: "600", color: colors.label, fontVariant: ["tabular-nums"] }}
            >
              {String(summary.best)}
            </Text>
          </Cell>
        )}
        {hasShape && (
          <Cell>
            <Text style={{ ...body, color: colors.label, flex: 1 }}>Average</Text>
            <Text
              testID="stat-average"
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...body, fontWeight: "600", color: colors.label, fontVariant: ["tabular-nums"] }}
            >
              {String(average)}
            </Text>
          </Cell>
        )}
        {hasShape && <Cell label="Mock tests" value={String(summary.count)} />}
      </Group>

      <GroupHeader>Recent tests</GroupHeader>
      <Group>
        {drives.map((drive, i) => (
          <Cell key={drive.id ?? `${drive.completed_at}-${i}`} chevron>
            <View style={{ flex: 1 }}>
              <Text style={{ ...body, color: colors.label }}>
                {shortDate(Date.parse(drive.completed_at ?? "")) ?? "Not yet synced"}
              </Text>
              {drive.routes && (
                <Text style={{ ...caption, color: colors.labelTertiary, marginTop: 2 }} numberOfLines={1}>
                  {drive.routes.centres
                    ? `${drive.routes.name} · ${drive.routes.centres.name}`
                    : drive.routes.name}
                </Text>
              )}
            </View>
            <Text
              testID={`history-score-${i}`}
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...body, fontWeight: "600", color: colors.label, marginLeft: 8 }}
            >
              {drive.mock_test_score}
            </Text>
            <Text style={{ ...caption, color: colors.labelTertiary, width: 56, textAlign: "right", marginLeft: 8 }}>
              {durationWords(drive.duration_seconds)}
            </Text>
          </Cell>
        ))}
      </Group>
    </>
  );
}
