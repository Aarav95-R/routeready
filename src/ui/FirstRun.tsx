import { Text, View } from "react-native";
import { EXAMINER_CATEGORIES } from "@/lib/examiner";
import { Cell, Group, GroupHeader } from "@/ui/List";
import { colors } from "@/ui/theme";
import { body, caption, footnote, MAX_DISPLAY_SCALE } from "@/ui/type";

/**
 * The two panels a brand-new account sees under its first action.
 *
 * Both exist for the same reason: on first run the screen has no record to
 * show, and the version of it that said so in a sentence read as an apology
 * for being empty. These say what is coming instead — one in three steps, one
 * in the examiner's own vocabulary.
 */

const STEPS = [
  { title: "Pick a centre", detail: "Ten test-style routes around each one." },
  { title: "Drive the route", detail: "Spoken directions, so you can keep your eyes up." },
  { title: "See what to work on", detail: "One thing at a time, starting with what costs you most." },
];

/**
 * Numerals are earned here: this is a sequence, and the order is the
 * information. They are clay rather than green because they are the three
 * things *you* do — the split theme.ts sets out.
 */
export function HowItWorks() {
  return (
    <>
      <GroupHeader>How it works</GroupHeader>
      <Group>
        {STEPS.map((step, i) => (
          <Cell key={step.title}>
            <View
              testID={`step-${i + 1}`}
              style={{
                width: 26, height: 26, borderRadius: 13, marginRight: 12, marginTop: 1,
                backgroundColor: colors.clayTint, alignItems: "center", justifyContent: "center",
              }}
            >
              <Text
                maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
                style={{ ...footnote, color: colors.clay }}
              >
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...body, color: colors.label }}>{step.title}</Text>
              <Text style={{ ...caption, color: colors.labelTertiary, marginTop: 2 }}>
                {step.detail}
              </Text>
            </View>
          </Cell>
        ))}
      </Group>
    </>
  );
}

/**
 * Four rows of the DL25, drawn empty.
 *
 * The labels are read out of EXAMINER_CATEGORIES rather than written again
 * here: they are the DVSA's own wording, a learner is emailed those exact
 * words after a real test, and a second copy of them is a second thing to keep
 * in step. `filter` rather than `find`+`!` so a renamed id drops a row instead
 * of rendering `undefined` — and the count below stays honest either way.
 */
const PREVIEW_IDS = ["moveOff", "mirrors", "junctions", "positioning"];
const PREVIEW = PREVIEW_IDS.flatMap((id) => EXAMINER_CATEGORIES.filter((c) => c.id === id));
const HIDDEN = EXAMINER_CATEGORIES.length - PREVIEW.length;

const TALLY_W = 62;
const BOX = 22;

function ColumnHeader({ children, width }: { children: string; width: number }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
      style={{
        ...footnote, color: colors.labelTertiary, width, textAlign: "center",
        textTransform: "uppercase", letterSpacing: 0.5,
      }}
    >
      {children}
    </Text>
  );
}

export function MarkingSheet() {
  return (
    <View testID="marking-sheet" style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, paddingBottom: 6 }}>
        <View style={{ flex: 1 }} />
        <ColumnHeader width={TALLY_W}>Faults</ColumnHeader>
        <ColumnHeader width={BOX}>S</ColumnHeader>
        <ColumnHeader width={BOX}>D</ColumnHeader>
      </View>

      {PREVIEW.map((category, i) => (
        <View
          key={category.id}
          style={{
            flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.separator,
          }}
        >
          <Text numberOfLines={1} style={{ ...caption, color: colors.labelSecondary, flex: 1 }}>
            {category.label}
          </Text>
          {/* The tally column is a track, not a box: faults are counted in it,
              and a count needs somewhere to go. S and D are ticked or not. */}
          <View style={{ width: TALLY_W, height: BOX, borderRadius: 4, backgroundColor: colors.fill }} />
          <View style={{ width: BOX, height: BOX, borderRadius: 4, borderWidth: 1, borderColor: colors.separator }} />
          <View style={{ width: BOX, height: BOX, borderRadius: 4, borderWidth: 1, borderColor: colors.separator }} />
        </View>
      ))}

      <Text style={{ ...caption, color: colors.labelTertiary, marginTop: 10 }}>
        {`Serious and dangerous, and ${HIDDEN} more rows the examiner can mark.`}
      </Text>
    </View>
  );
}
