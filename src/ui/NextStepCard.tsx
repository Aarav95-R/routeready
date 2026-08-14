import { Pressable, Text, View } from "react-native";
import type { FaultCount, NextStep } from "@/lib/homeView";
import { Cell, Group, GroupHeader } from "@/ui/List";
import { colors } from "@/ui/theme";
import { headline, MAX_DISPLAY_SCALE, subheadline, title2 } from "@/ui/type";
import { FaultBars } from "@/ui/FaultBars";

/** "a and b", "a, b and c" — a list of tags read aloud rather than punctuated. */
function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type Copy = {
  title: string;
  claim: string;
  because: string;
  action: string;
  bars?: FaultCount[];
  tags?: string[];
};

/**
 * The five shapes, as words.
 *
 * Kept as one function returning a plain object so the copy for every state
 * sits in one place and can be read against the others. The card below draws
 * whichever of `bars` and `tags` came back.
 */
function copyFor(step: NextStep): Copy {
  switch (step.kind) {
    case "first":
      return {
        title: "Start here",
        claim: "Your first mock test",
        because:
          "Drive a real examiner route at your centre and get marked the way the DL25 marks you. It sets the baseline everything after it is measured against.",
        action: "Find a test centre near me",
      };
    case "baseline":
      return {
        title: "Work on this next",
        claim: "Take a second mock test",
        because:
          "One test shows what went wrong that day. Two show what keeps going wrong — and that's the thing worth practising.",
        action: "Start a mock test",
        tags: step.tags,
      };
    case "clean":
      return {
        title: "Work on this next",
        claim: "Nothing is costing you yet",
        because:
          "No faults recorded across your mock tests. Keep going — a fault has to show up before it can be worked on.",
        action: "Start a mock test",
      };
    case "tied":
      return {
        title: "Work on this next",
        claim: step.tags.length === 2 ? "Two faults are level" : "Nothing stands out yet",
        because: `${andList(step.tags)} are marked in the same number of tests. Another test breaks the tie.`,
        action: "Start a mock test",
      };
    case "fault":
      return {
        title: "Work on this next",
        claim: step.tag,
        // Tests, not faults: aggregate dedupes tags per test, so this can only
        // ever be how many tests the fault turned up in.
        because: `Marked in ${step.count} of your ${step.of} mock tests — more than any other fault.`,
        action: "Start a mock test",
        bars: [{ tag: step.tag, count: step.count }, ...step.runners],
      };
  }
}

/**
 * The one thing worth doing next, and the case for it.
 *
 * Takes a decision rather than making one — every rule that chooses between
 * these five shapes lives in `nextStep`, so this file is only ever wrong about
 * words.
 */
export function NextStepCard({ step, onAction }: { step: NextStep; onAction: () => void }) {
  const copy = copyFor(step);

  return (
    <>
      <GroupHeader>{copy.title}</GroupHeader>
      <Group>
        <Cell>
          <View style={{ flex: 1 }}>
            <Text
              testID="diagnosis"
              maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
              style={{ ...title2, color: colors.label }}
            >
              {copy.claim}
            </Text>
            <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 6 }}>
              {copy.because}
            </Text>

            {copy.bars && <FaultBars faults={copy.bars} lead />}

            {copy.tags && copy.tags.length > 0 && (
              <View testID="baseline-tags" style={{ marginTop: 14 }}>
                {copy.tags.map((tag) => (
                  <View
                    key={tag}
                    style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingVertical: 10 }}
                  >
                    <Text style={{ ...subheadline, color: colors.labelSecondary }}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Cell>
        <Cell>
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [
              {
                flex: 1,
                alignItems: "center",
                borderRadius: 12,
                backgroundColor: colors.accent,
                paddingVertical: 14,
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: "#FFFFFF" }}>
              {copy.action}
            </Text>
          </Pressable>
        </Cell>
      </Group>
    </>
  );
}
