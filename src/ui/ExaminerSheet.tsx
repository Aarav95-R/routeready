import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  EXAMINER_CATEGORIES, type ExaminerCategory, ExaminerGroup,
  HABITUAL_MINOR_THRESHOLD, type MarkCounts, MarkLevel, NO_MARK_COUNTS,
} from "@/lib/examiner";
import { METER_WARN_AT } from "@/lib/mockLive";
import { MAX_MINORS } from "@/lib/scoring/engine";
import { colors } from "@/ui/theme";
import { caption, footnote, headline, MAX_DISPLAY_SCALE, title2 } from "@/ui/type";

/**
 * The examiner's mark sheet: every fault that can be given, listed, with a
 * minus and a plus on each row.
 *
 * It briefly became something else — eight tiles and a severity step, two taps
 * per fault — on the theory that marking should cost as little attention as
 * possible. That optimised for the wrong person. Whoever is marking is in the
 * passenger seat holding the phone and looking at it; drilling into a category
 * hides the other twenty-two from someone whose whole job is watching for them.
 * A list is the right shape. What was wrong was the row.
 *
 * ── Every `style` here is a plain object, never `({ pressed }) => ...` ──
 *
 * NativeWind 4.2.6 is installed with `jsxImportSource: "nativewind"`, which
 * wraps every component so it can resolve `className`. It does not invoke the
 * function form of `style`, so a Pressable given one renders with *no* style at
 * all. See src/ui/usePressed.ts. Press feedback here is the count moving under
 * the finger, plus the haptic the caller fires per level.
 */

// ── The row ──────────────────────────────────────────────────────────────
//
// Sized against the narrowest screen this app targets. On a 375 pt-wide phone
// the row has 343 pt inside its padding; the control cluster below takes 162,
// leaving 169 for the name. The longest label — "Response to signs and
// signals" — wraps to two lines there, which is why the row has a minimum
// height rather than a fixed one.
const BTN = 46;              // minus and plus
const SER = 32;              // the serious button, deliberately smaller
const COUNT_W = 24;
const CLUSTER_GAP_SM = 4;
const CLUSTER_GAP_MD = 6;
const ROW_MIN_H = 66;
const ROW_PAD_V = 9;

// ── The pinned header ────────────────────────────────────────────────────
//
// Only the score and Undo live here. The detail line and the clock are the
// first rows *inside* the scroll instead, so the collapsed sheet stays short:
// the map's controls row and the Mapbox attribution are both stacked off this
// height, and on a 667 pt screen the driver puck leaves it almost no room.
const HEADER_PAD_TOP = 4;
const HEADER_PAD_BOTTOM = 12;
const HEADER_ROW_H = 34;     // the Undo button sets it
const METER_H = 8;
const HEADER_GAP = 9;
export const EXAMINER_HEADER_H =
  HEADER_PAD_TOP + HEADER_ROW_H + HEADER_GAP + METER_H + HEADER_PAD_BOTTOM; // 67

const GROUP_ORDER: ExaminerGroup[] = ["driving", "manoeuvres", "beforeDriving"];
const GROUP_LABEL: Record<ExaminerGroup, string> = {
  driving: "While driving",
  manoeuvres: "Manoeuvres",
  beforeDriving: "Before setting off",
};

/**
 * The three levels, in one place.
 *
 * The amber and the red are unchanged from the first version of this screen:
 * they carry meaning and the app already knows them. What changed is that the
 * level is no longer *only* colour — a minus, a plus and an S are three
 * different glyphs at three different sizes in three different positions, so
 * the row still reads for anyone who cannot separate the amber from the red.
 */
const LEVEL_STYLE: Record<MarkLevel, { bg: string; fg: string }> = {
  minor: { bg: "#FEF3C7", fg: "#B45309" },
  major: { bg: "#FEE2E2", fg: "#B91C1C" },
  credit: { bg: colors.accentTint, fg: colors.accentInk },
};

/** A row that has been marked, so the test's story is findable when scrolling back. */
const MARKED_TINT = "#FFFBF0";

const GROUPS: { group: ExaminerGroup; categories: typeof EXAMINER_CATEGORIES }[] = GROUP_ORDER.map((group) => ({
  group,
  categories: EXAMINER_CATEGORIES.filter((c) => c.group === group),
}));

/**
 * Fifteen ticks, one per allowed driving fault.
 *
 * Not a percentage bar: the allowance is a count of discrete events, and a
 * driver with three left should see three gaps rather than read a number. A
 * serious fault is not a sixteenth tick — it is a different outcome — so it
 * turns the strip red instead of filling it.
 *
 * Never green. Green on this app's drive screens means the road: the route
 * line, and Mirrors when a zone is open. A green "you're fine" strip would be a
 * second green competing for exactly the glance the route is asking for.
 */
function Meter({ minors, stopped }: { minors: number; stopped: boolean }) {
  const filled = Math.min(minors, MAX_MINORS);
  return (
    <View
      testID="fault-meter"
      accessibilityRole="progressbar"
      accessibilityLabel={`${filled} of ${MAX_MINORS} driving faults used`}
      accessibilityValue={{ min: 0, max: MAX_MINORS, now: filled }}
      style={{ flexDirection: "row", gap: 3, height: METER_H }}
    >
      {Array.from({ length: MAX_MINORS }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            borderRadius: 2,
            backgroundColor: i < filled
              ? (stopped ? colors.danger : (minors >= METER_WARN_AT ? colors.warning : LEVEL_STYLE.minor.fg))
              : (stopped ? "#F3D6D6" : colors.fill),
          }}
        />
      ))}
    </View>
  );
}

/**
 * The pinned score. This is the whole sheet at its collapsed height, which is
 * why the safe-area inset pads it here — without that, Undo sits inside the
 * home indicator's edge-gesture strip, and Undo is the only mis-tap recovery
 * there is. Mis-taps in a moving car are certain.
 */
export function ExaminerScoreHeader({
  minors, remaining, stopped, canUndo, onUndo, onEnd, bottomInset = 0,
}: {
  minors: number; remaining: number; stopped: boolean;
  canUndo: boolean; onUndo: () => void;
  /**
   * End the test and score it. Omitted while the sheet is collapsed, so the
   * collapsed height stays exactly the score and the one control that ends the
   * drive is never a thumb's width from the map.
   */
  onEnd?: () => void;
  bottomInset?: number;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.cell, paddingHorizontal: 16,
        paddingTop: HEADER_PAD_TOP, paddingBottom: HEADER_PAD_BOTTOM + bottomInset,
        gap: HEADER_GAP,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: HEADER_ROW_H }}>
        <Text
          testID="headroom"
          maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
          numberOfLines={1}
          // A live region, so a mark made without looking is still confirmed
          // out loud to anyone using VoiceOver.
          accessibilityLiveRegion="polite"
          style={{ ...title2, flex: 1, color: stopped ? LEVEL_STYLE.major.fg : colors.label }}
        >
          {remaining === 0 ? "No driving faults left" : `${remaining} driving faults left`}
        </Text>
        {canUndo && (
          <Pressable
            testID="undo"
            accessibilityRole="button"
            accessibilityLabel="Undo last mark"
            onPress={onUndo}
            style={{
              minHeight: HEADER_ROW_H, minWidth: 62, paddingHorizontal: 12, borderRadius: 8,
              backgroundColor: colors.fill, alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ ...footnote, color: colors.labelSecondary }}>Undo</Text>
          </Pressable>
        )}
      </View>
      <Meter minors={minors} stopped={stopped} />

      {onEnd !== undefined && (
        <Pressable
          testID="finish-test"
          accessibilityRole="button"
          accessibilityLabel="Finish test"
          onPress={onEnd}
          // Outlined rather than filled: it sits under the score the whole time
          // the sheet is open, and a solid dark bar there reads as the primary
          // thing to do rather than the thing you do once at the end.
          style={{
            minHeight: 44, borderRadius: 10, marginTop: 2,
            borderWidth: 1, borderColor: colors.separator,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Text style={{ ...footnote, color: colors.labelSecondary }}>Finish test</Text>
        </Pressable>
      )}
    </View>
  );
}

function StepButton({
  level, category, glyph, size, onMark,
}: {
  level: MarkLevel; category: ExaminerCategory; glyph: string; size: number;
  onMark: (category: string, level: MarkLevel) => void;
}) {
  const style = LEVEL_STYLE[level];
  const label = level === "minor"
    ? `Add a driving fault to ${category.label}`
    : level === "major"
      ? `Record a serious fault for ${category.label}`
      : `Give a credit for ${category.label}`;
  return (
    <Pressable
      testID={`mark-${category.id}-${level}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onMark(category.id, level)}
      style={{
        width: size, height: size, borderRadius: size <= SER ? 10 : 14,
        alignItems: "center", justifyContent: "center",
        backgroundColor: style.bg,
      }}
    >
      <Text
        // Not scaled: the glyph is the target, and a turned-up text size would
        // push it out of a fixed-size button rather than making it easier.
        maxFontSizeMultiplier={1}
        style={{
          color: style.fg, fontWeight: "700",
          fontSize: size <= SER ? 13 : 24, lineHeight: size <= SER ? 18 : 26,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

function MarkRow({
  category, counts, expanded, onToggle, onMark,
}: {
  category: ExaminerCategory;
  counts: MarkCounts;
  expanded: boolean;
  onToggle: (id: string) => void;
  onMark: (category: string, level: MarkLevel) => void;
}) {
  const marked = counts.minor > 0 || counts.major > 0 || counts.credit > 0;
  const habitual = counts.minor >= HABITUAL_MINOR_THRESHOLD;
  return (
    <View style={{ backgroundColor: marked ? MARKED_TINT : colors.cell }}>
      <View
        style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          paddingHorizontal: 16, paddingVertical: ROW_PAD_V, minHeight: ROW_MIN_H,
        }}
      >
        {/* The name is the tap target for the examples, so nothing on the row
            does two jobs: name opens, minus marks, plus credits. */}
        <Pressable
          testID={`category-${category.id}`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            counts.minor > 0
              ? `${category.label}, ${counts.minor} driving faults`
              : category.label
          }
          accessibilityHint="Shows what counts as a fault here"
          onPress={() => onToggle(category.id)}
          style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 2 }}
        >
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={{ ...headline, color: habitual ? LEVEL_STYLE.minor.fg : colors.label }}
          >
            {category.label}
          </Text>
          {counts.major > 0 && (
            <Text testID={`serious-${category.id}`} style={{ ...caption, fontWeight: "600", color: LEVEL_STYLE.major.fg }}>
              {counts.major === 1 ? "Serious fault" : `${counts.major} serious faults`}
            </Text>
          )}
          {counts.major === 0 && counts.credit > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="checkmark" size={13} color={LEVEL_STYLE.credit.fg} />
              <Text testID={`credit-${category.id}`} style={{ ...caption, fontWeight: "600", color: LEVEL_STYLE.credit.fg }}>
                {counts.credit} done well
              </Text>
            </View>
          )}
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: CLUSTER_GAP_MD, flexShrink: 0 }}>
          <StepButton level="major" category={category} glyph="S" size={SER} onMark={onMark} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: CLUSTER_GAP_SM }}>
            <StepButton level="minor" category={category} glyph="−" size={BTN} onMark={onMark} />
            <Text
              testID={`count-${category.id}`}
              maxFontSizeMultiplier={1}
              style={{
                ...headline, width: COUNT_W, textAlign: "center",
                fontVariant: ["tabular-nums"], fontWeight: "700",
                color: counts.minor > 0 ? LEVEL_STYLE.minor.fg : colors.separator,
              }}
            >
              {counts.minor}
            </Text>
            <StepButton level="credit" category={category} glyph="+" size={BTN} onMark={onMark} />
          </View>
        </View>
      </View>

      {expanded && (
        <View
          style={{
            paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, gap: 6,
            backgroundColor: MARKED_TINT,
          }}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ ...caption, fontWeight: "700", color: LEVEL_STYLE.minor.fg, width: 14 }}>−</Text>
            <Text testID={`example-minor-${category.id}`} style={{ ...caption, flex: 1, color: colors.labelSecondary }}>
              {category.minorExample}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ ...caption, fontWeight: "700", color: LEVEL_STYLE.major.fg, width: 14 }}>S</Text>
            <Text testID={`example-major-${category.id}`} style={{ ...caption, flex: 1, color: colors.labelSecondary }}>
              {category.majorExample}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * The list itself. The caller's bottom sheet supplies the scroll container, so
 * this stays a plain View tree.
 *
 * The detail line and the clock are the first thing in it rather than in the
 * pinned header: at the collapsed height the sheet is the header alone, and
 * every point it grows pushes the map's controls row towards the driver puck.
 */
export function ExaminerMarkList({
  counts, minors, majors, credits, clock, onMark,
}: {
  counts: Record<string, MarkCounts>;
  minors: number; majors: number; credits: number;
  clock: string;
  onMark: (category: string, level: MarkLevel) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // One row open at a time: two examples already push the next heading down,
  // and twenty-three would make the sheet unusable as a list.
  const toggle = useCallback(
    (id: string) => setExpandedId((current) => (current === id ? null : id)),
    []
  );

  return (
    <View style={{ backgroundColor: colors.cell }}>
      <View
        style={{
          flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
          gap: 10, paddingHorizontal: 16, paddingBottom: 12,
        }}
      >
        <Text testID="live-detail" style={{ ...caption, flex: 1, color: colors.labelTertiary }}>
          {minors === 1 ? "1 driving fault" : `${minors} driving faults`}
          {majors > 0
            ? ` · ${majors === 1 ? "1 serious" : `${majors} serious`}`
            : " · no serious"}
          {credits > 0 ? ` · +${credits} credit` : ""}
        </Text>
        <Text style={{ ...caption, color: colors.labelTertiary, fontVariant: ["tabular-nums"] }}>{clock}</Text>
      </View>

      {GROUPS.map(({ group, categories }) => (
        <View key={group}>
          <Text
            style={{
              ...footnote, color: colors.labelTertiary, textTransform: "uppercase",
              letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 6,
            }}
          >
            {GROUP_LABEL[group]}
          </Text>
          {categories.map((c, i) => (
            <View key={c.id}>
              <MarkRow
                category={c}
                counts={counts[c.id] ?? NO_MARK_COUNTS}
                expanded={expandedId === c.id}
                onToggle={toggle}
                onMark={onMark}
              />
              {/* Inset from the leading edge, never full-bleed — see the note on
                  `separator` in theme.ts. The last row of a group has none: the
                  next group's header is the division there. */}
              {i < categories.length - 1 && (
                <View style={{ height: 1, marginLeft: 16, backgroundColor: colors.separator }} />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
