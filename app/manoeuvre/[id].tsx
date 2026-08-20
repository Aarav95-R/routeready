import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent,
  Pressable, ScrollView, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { sceneFor } from "@/lib/manoeuvreScenes";
import { activeStepAt } from "@/lib/manoeuvreView";
import { listManoeuvres } from "@/services/manoeuvresRepo";
import type { Manoeuvre } from "@/types/db";
import { Group, GroupHeader } from "@/ui/List";
import { ManoeuvreDiagram } from "@/ui/ManoeuvreDiagram";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";
import { body, caption, footnote, headline, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";

/**
 * One manoeuvre: the diagram, pinned, and everything written about it below.
 *
 * The diagram does not scroll. Six steps and three tips overflow every phone,
 * and if the drawing went with them it would be gone by step four — which is
 * exactly where the steering gets hard to picture and where a reader most
 * needs to see where the car ends up.
 *
 * The active step is one number. Tapping a row sets it; scrolling sets it to
 * whichever row has reached the top. Both write the same state, so the
 * diagram can never disagree with what is being read. `activeStepAt` holds
 * that rule and is tested on its own.
 */
export default function ManoeuvreDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [rows, setRows] = useState<Manoeuvre[] | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const r = await listManoeuvres();
        setRows(r.data);
      } catch {
        // The list screen is the only way in and it has already fetched, so
        // the cache is warm by the time anyone is here. An empty list reaches
        // the same "not found" the screen already draws.
        setRows([]);
      }
    })();
  }, []);

  // The rows are not a fixed height — details wrap to two lines or three — so
  // the scroll binding reads a table the list fills in rather than dividing by
  // a constant the way the centres sheet can.
  //
  // It takes two measurements, not one, because neither is any use alone. A
  // row reports its position relative to the wrapper the group puts around
  // it, which is 0 for the first row and 1 for every row under a hairline;
  // the group reports its own position in the scroll content. Added together
  // they are where the row actually is. Reading only the row's own y is what
  // this screen shipped with, and it pinned the diagram to the last step the
  // moment anyone scrolled a single pixel.
  const groupTop = useRef(0);
  const rowTops = useRef<number[]>([]);
  const tops = useRef<number[]>([]);

  const retotal = useCallback(() => {
    tops.current = rowTops.current.map((y) => groupTop.current + y);
  }, []);

  const measureGroup = useCallback((e: LayoutChangeEvent) => {
    groupTop.current = e.nativeEvent.layout.y;
    retotal();
  }, [retotal]);

  const measureRow = useCallback((i: number, e: LayoutChangeEvent) => {
    rowTops.current[i] = e.nativeEvent.layout.y;
    retotal();
  }, [retotal]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setStep(activeStepAt(e.nativeEvent.contentOffset.y, tops.current));
  }, []);

  const manoeuvre = rows?.find((m) => m.id === id) ?? null;
  const scene = manoeuvre ? sceneFor(manoeuvre.name) : null;

  const back = (
    <Pressable
      testID="manoeuvre-back"
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      onPress={() => router.back()}
      style={{ padding: 4 }}
    >
      <Ionicons name="chevron-back" size={24} color={colors.accent} />
    </Pressable>
  );

  const bar = { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 12, paddingBottom: 8 };

  if (rows === null) {
    return (
      <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
        <View style={bar}>{back}</View>
        <View style={{ marginHorizontal: 16, gap: 12 }}>
          <Skeleton h={190} />
          <Skeleton h={220} />
        </View>
      </SafeAreaView>
    );
  }

  if (manoeuvre === null) {
    return (
      <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
        <View style={bar}>{back}</View>
        <View testID="manoeuvre-missing" style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ ...caption, color: colors.labelSecondary }}>That manoeuvre isn&rsquo;t here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
      <View style={bar}>
        {back}
        <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...headline, color: colors.label }}>
          {manoeuvre.name}
        </Text>
      </View>

      {/* Outside the ScrollView, which is the whole design of this screen. */}
      {scene !== null && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <View style={{ backgroundColor: colors.cell, borderRadius: 10, padding: 10 }}>
            <View style={{ aspectRatio: 320 / 190, borderRadius: 6, overflow: "hidden" }}>
              <ManoeuvreDiagram scene={scene} step={step} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingTop: 8 }}>
              <Text style={{ ...caption, color: colors.labelTertiary }}>
                Step {Math.min(step, manoeuvre.steps.length - 1) + 1} of {manoeuvre.steps.length}
              </Text>
              <View style={{ flexDirection: "row", gap: 5 }}>
                {manoeuvre.steps.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 6, height: 6, borderRadius: 3,
                      backgroundColor: i <= step ? colors.accent : colors.fill,
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <GroupHeader>Step by step</GroupHeader>
        <Group testID="manoeuvre-steps" onLayout={measureGroup} onRowLayout={measureRow}>
          {manoeuvre.steps.map((s, i) => (
            <Pressable
              key={i}
              testID={`manoeuvre-step-${i}`}
              accessibilityRole="button"
              onPress={() => setStep(i)}
              style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", gap: 12 }}
            >
              <View
                style={{
                  width: 23, height: 23, borderRadius: 12, marginTop: 1,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: i === step ? colors.accent : colors.fill,
                }}
              >
                <Text style={{ ...footnote, fontVariant: ["tabular-nums"], color: i === step ? "#FFFFFF" : colors.labelTertiary }}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
                  style={{ ...body, fontWeight: "600", color: i === step ? colors.accent : colors.label }}
                >
                  {s.title}
                </Text>
                <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 3 }}>{s.detail}</Text>
              </View>
            </Pressable>
          ))}
        </Group>

        {manoeuvre.tips.length > 0 && (
          <>
            <GroupHeader>Tips</GroupHeader>
            <Group>
              {manoeuvre.tips.map((t, i) => (
                <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", gap: 12 }}>
                  {/* Clay, not green. Green is the road; a tip is advice to
                      the person driving on it. */}
                  <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 7, backgroundColor: colors.clay }} />
                  <Text style={{ ...subheadline, color: colors.labelSecondary, flex: 1 }}>{t}</Text>
                </View>
              ))}
            </Group>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
