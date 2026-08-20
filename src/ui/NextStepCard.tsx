import { Text, useWindowDimensions, View } from "react-native";
import type { FaultCount, NextStep } from "@/lib/homeView";
import { WELCOME_ROUTE } from "@/lib/welcomeRoute";
import { Cell, Group, GroupHeader } from "@/ui/List";
import { colors } from "@/ui/theme";
import { caption, MAX_DISPLAY_SCALE, subheadline, title2 } from "@/ui/type";
import { FaultBars } from "@/ui/FaultBars";
import { PrimaryAction } from "@/ui/PrimaryAction";
import { RouteThumbnail } from "@/ui/RouteThumbnail";

/**
 * The way into a centre, named once.
 *
 * The first-run screen presses this action twice — in the card and again at
 * the end of the introduction — and an action that answers to two different
 * names is two actions as far as the reader is concerned.
 */
export const FIND_A_CENTRE = "Find a test centre near me";

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
  /** The plain facts under the claim. First run only — see `copyFor`. */
  meta?: string[];
  /** Draw the example route above the claim. First run only. */
  drawing?: boolean;
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
    // The only shape written for somebody who has not used the app yet, so it
    // is the only one that has to answer "what is this and can I stop?" before
    // it answers "what should I work on?". Everything it promises is either
    // shown (the route) or plain (the two facts); nothing about marking is
    // said until the sheet below it, which frames marking as a preview.
    case "first":
      return {
        title: "Start here",
        claim: "Your first drive",
        because:
          "Pick a centre near you and follow one of its test-style routes — test length, on the roads around the centre. Nothing is scored until you finish, and you can stop whenever you like.",
        action: FIND_A_CENTRE,
        meta: ["About 40 minutes", "Ten routes per centre"],
        drawing: true,
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
  // The card's own width: the screen less Group's 16pt margins. Taken here
  // rather than passed in, because every caller would have to compute the
  // same subtraction and only this card knows it draws anything.
  const { width } = useWindowDimensions();
  const drawingWidth = Math.max(120, width - 32);

  return (
    <>
      <GroupHeader>{copy.title}</GroupHeader>
      <Group>
        {copy.drawing && (
          <View style={{ backgroundColor: colors.drawing }}>
            <RouteThumbnail geometry={WELCOME_ROUTE} width={drawingWidth} height={124} youAreHere />
          </View>
        )}
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

            {copy.meta && (
              <View testID="first-meta" style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
                {copy.meta.map((fact, i) => (
                  <Text key={fact} style={{ ...caption, color: colors.labelTertiary }}>
                    {i === 0 ? fact : `  ·  ${fact}`}
                  </Text>
                ))}
              </View>
            )}

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
          <PrimaryAction label={copy.action} onPress={onAction} />
        </Cell>
      </Group>
    </>
  );
}
