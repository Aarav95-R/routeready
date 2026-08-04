import { Platform, Pressable, Text, View } from "react-native";
import { EXAMINER_CATEGORIES, ExaminerGroup, HABITUAL_MINOR_THRESHOLD, MarkLevel } from "@/lib/examiner";
import { colors } from "@/ui/theme";

// The design mockup sets group headings and the tally digits in
// ui-monospace; RN has no generic alias that resolves on both platforms.
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

// A mark row's three buttons at the spec's 44 pt minimum, laid out with an
// 8 pt gap: 3 × 44 + 2 × 8 = 148. Named so the row container width and the
// per-button minimums can't silently drift apart.
const MARK_BUTTON_MIN = 44;
const MARK_ROW_GAP = 8;
const MARK_ROW_WIDTH = 3 * MARK_BUTTON_MIN + 2 * MARK_ROW_GAP;
const UNDO_MIN_WIDTH = 64;

type Props = {
  minors: number;
  majors: number;
  credits: number;
  lastMark: { label: string; level: MarkLevel } | null;
  minorCounts: Record<string, number>;
  warnings: { category: string; label: string; count: number }[];
  onMark: (category: string, level: MarkLevel) => void;
  onUndo: () => void;
};

const GROUP_ORDER: ExaminerGroup[] = ["driving", "manoeuvres", "beforeDriving"];
const GROUP_LABEL: Record<ExaminerGroup, string> = {
  driving: "While driving",
  manoeuvres: "Manoeuvres",
  beforeDriving: "Before setting off",
};

// Mark-level styling lives in one place so the row buttons, the habitual
// badge, the warning bar, and the collapsed tallies all read the same hex
// values — changing "minor amber" here is the only edit a colour change
// needs, anywhere in this file.
const LEVEL_STYLE: Record<MarkLevel, { bg: string; fg: string; label: string }> = {
  minor: { bg: "#FEF3C7", fg: "#B45309", label: "MIN" },
  major: { bg: "#FEE2E2", fg: "#B91C1C", label: "MAJ" },
  credit: { bg: "#ECFDF5", fg: colors.accent, label: "+" },
};

// Groups holds every category so a row is never silently dropped even if a
// future category arrives with an unexpected group value.
const GROUPS: { group: ExaminerGroup; categories: typeof EXAMINER_CATEGORIES }[] = GROUP_ORDER.map((group) => ({
  group,
  categories: EXAMINER_CATEGORIES.filter((c) => c.group === group),
}));

function MarkButton({
  level, categoryId, onPress,
}: { level: MarkLevel; categoryId: string; onPress: () => void }) {
  const style = LEVEL_STYLE[level];
  return (
    <Pressable
      testID={`mark-${categoryId}-${level}`}
      accessibilityRole="button"
      accessibilityLabel={`${level} — ${categoryId}`}
      onPress={onPress}
      style={{
        minHeight: MARK_BUTTON_MIN,
        minWidth: MARK_BUTTON_MIN,
        flex: 1,
        borderRadius: 10,
        backgroundColor: style.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: style.fg, fontWeight: "700", fontSize: level === "credit" ? 18 : 12 }}>
        {style.label}
      </Text>
    </Pressable>
  );
}

function CategoryRow({
  id, label, minorExample, minorCount, onMark,
}: {
  id: string; label: string; minorExample: string; minorCount: number;
  onMark: (category: string, level: MarkLevel) => void;
}) {
  const isHabitual = minorCount >= HABITUAL_MINOR_THRESHOLD;
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-[14px] font-semibold text-primary">{label}</Text>
          {isHabitual && (
            <View testID={`warning-${id}`} style={{ backgroundColor: LEVEL_STYLE.minor.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: LEVEL_STYLE.minor.fg, fontSize: 11, fontWeight: "700" }}>×{minorCount}</Text>
            </View>
          )}
        </View>
        <Text className="text-[12px] text-slate-500">{minorExample}</Text>
      </View>
      <View className="flex-row" style={{ width: MARK_ROW_WIDTH, gap: MARK_ROW_GAP }}>
        <MarkButton level="minor" categoryId={id} onPress={() => onMark(id, "minor")} />
        <MarkButton level="major" categoryId={id} onPress={() => onMark(id, "major")} />
        <MarkButton level="credit" categoryId={id} onPress={() => onMark(id, "credit")} />
      </View>
    </View>
  );
}

export function ExaminerSheet({
  minors, majors, credits, lastMark, minorCounts, warnings, onMark, onUndo,
}: Props) {
  const firstWarning = warnings[0] ?? null;

  return (
    <View className="bg-card">
      {/* Collapsed bar: always visible, so the tally and undo work whether or
          not the sheet is pulled up. */}
      <View className="px-4 py-3 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] font-semibold text-primary">Examiner</Text>
          <View className="flex-row gap-3">
            <Text testID="tally-minors" style={{ color: LEVEL_STYLE.minor.fg, fontWeight: "700", fontSize: 12, fontFamily: MONO }}>
              {minors} min
            </Text>
            <Text testID="tally-majors" style={{ color: LEVEL_STYLE.major.fg, fontWeight: "700", fontSize: 12, fontFamily: MONO }}>
              {majors} maj
            </Text>
            <Text testID="tally-credits" style={{ color: LEVEL_STYLE.credit.fg, fontWeight: "700", fontSize: 12, fontFamily: MONO }}>
              +{credits}
            </Text>
          </View>
        </View>

        {lastMark && (
          <View className="flex-row items-center justify-between">
            <Text className="text-[12px] text-slate-400">
              Last: {lastMark.label} — {lastMark.level}
            </Text>
            <Pressable
              testID="undo"
              accessibilityRole="button"
              onPress={onUndo}
              style={{ minHeight: MARK_BUTTON_MIN, minWidth: UNDO_MIN_WIDTH, borderRadius: 8, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}
            >
              <Text className="text-[12px] font-semibold text-slate-600">Undo</Text>
            </Pressable>
          </View>
        )}

        {firstWarning && (
          <View style={{ backgroundColor: LEVEL_STYLE.minor.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", flexWrap: "wrap" }}>
            {/* toHaveTextContent does an exact match by default (see
                @testing-library/react-native's matches()), so the pinned
                testID carries only the label — the count and explanation are
                a sibling Text, outside that node's text-content subtree. */}
            <Text testID="warning-bar" style={{ color: LEVEL_STYLE.minor.fg, fontSize: 12, fontWeight: "700" }}>
              {firstWarning.label}
            </Text>
            <Text style={{ color: LEVEL_STYLE.minor.fg, fontSize: 12, fontWeight: "600" }}>
              {" "}×{firstWarning.count} — an examiner would likely call this major
            </Text>
          </View>
        )}
      </View>

      {/* Expanded content: grouped rows. The caller's bottom sheet supplies
          the scroll container, so this stays a plain View tree. */}
      <View className="px-4 pb-4 gap-4">
        {GROUPS.map(({ group, categories }) => (
          <View key={group} className="gap-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400" style={{ fontFamily: MONO }}>
              {GROUP_LABEL[group]}
            </Text>
            <View>
              {categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  id={c.id}
                  label={c.label}
                  minorExample={c.minorExample}
                  minorCount={minorCounts[c.id] ?? 0}
                  onMark={onMark}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
