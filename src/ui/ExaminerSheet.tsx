import { Pressable, Text, View } from "react-native";
import { EXAMINER_CATEGORIES, ExaminerGroup, HABITUAL_MINOR_THRESHOLD, MarkLevel } from "@/lib/examiner";
import { colors } from "@/ui/theme";

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

// Mark-level styling lives in one place so the row buttons and any future
// legend stay in sync with the design's exact hex values.
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
        minHeight: 44,
        minWidth: 44,
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
            <View testID={`warning-${id}`} style={{ backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: "#B45309", fontSize: 11, fontWeight: "700" }}>×{minorCount}</Text>
            </View>
          )}
        </View>
        <Text className="text-[12px] text-slate-500">{minorExample}</Text>
      </View>
      <View className="flex-row gap-2" style={{ width: 148 }}>
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
            <Text testID="tally-minors" style={{ color: "#B45309", fontWeight: "700", fontSize: 12 }}>
              {minors} min
            </Text>
            <Text testID="tally-majors" style={{ color: "#B91C1C", fontWeight: "700", fontSize: 12 }}>
              {majors} maj
            </Text>
            <Text testID="tally-credits" style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>
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
              style={{ minHeight: 44, minWidth: 64, borderRadius: 8, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}
            >
              <Text className="text-[12px] font-semibold text-slate-600">Undo</Text>
            </Pressable>
          </View>
        )}

        {firstWarning && (
          <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", flexWrap: "wrap" }}>
            {/* toHaveTextContent does an exact match by default (see
                @testing-library/react-native's matches()), so the pinned
                testID carries only the label — the count and explanation are
                a sibling Text, outside that node's text-content subtree. */}
            <Text testID="warning-bar" style={{ color: "#B45309", fontSize: 12, fontWeight: "700" }}>
              {firstWarning.label}
            </Text>
            <Text style={{ color: "#B45309", fontSize: 12, fontWeight: "600" }}>
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
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
