import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import { buildSections } from "@/lib/manoeuvreView";
import { listManoeuvres } from "@/services/manoeuvresRepo";
import { useNetwork } from "@/stores/networkStore";
import type { Manoeuvre } from "@/types/db";
import { Cell, Group, GroupHeader } from "@/ui/List";
import { ManoeuvreThumb } from "@/ui/ManoeuvreThumb";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { Skeleton } from "@/ui/Skeleton";
import { enterFrom } from "@/ui/motion";
import { colors } from "@/ui/theme";
import { body, caption, largeTitle, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";

/**
 * The four manoeuvres an examiner can ask for.
 *
 * Four rows is not enough to need a search field, a filter or a sort, so it
 * has none of them. What it does need is for a reader to tell the two bay
 * parks apart before reading either name, which is the thumbnail's job.
 *
 * Every rule lives in `manoeuvreView`. This file fetches and composes.
 */
export default function Manoeuvres() {
  const router = useRouter();
  const online = useNetwork((s) => s.online);

  const [rows, setRows] = useState<Manoeuvre[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing is set before the first await, so the mount effect below can call
  // this without setting state synchronously inside an effect.
  const load = useCallback(async () => {
    try {
      const r = await listManoeuvres();
      setRows(r.data);
      setStale(r.stale);
      setError(null);
    } catch {
      setError("Couldn't load manoeuvres.");
    }
  }, []);

  // Reference data that never changes, unlike Home's record — so this loads
  // once on mount rather than on every focus.
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // A tap, not an effect, so the message the button sits under clears at the
  // tap rather than a round trip later.
  const retry = useCallback(() => {
    setError(null);
    setRows(null);
    void load();
  }, [load]);

  const sections = buildSections(rows ?? []);

  return (
    <SafeAreaView className="flex-1 bg-field" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={enterFrom(0)} className="px-4 pb-1 pt-2">
          <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...largeTitle, color: colors.label }}>
            Manoeuvres
          </Text>
          <Text style={{ ...subheadline, color: colors.labelSecondary, marginTop: 6 }}>
            The four an examiner can ask for. One of them will come up on your test.
          </Text>
        </Animated.View>

        <OfflineBanner visible={stale || !online} />

        {error && (
          <View testID="manoeuvres-error" style={{ padding: 24, alignItems: "center", gap: 12 }}>
            <Text style={{ ...caption, color: colors.labelSecondary, textAlign: "center" }}>{error}</Text>
            <Pressable
              testID="manoeuvres-retry"
              accessibilityRole="button"
              onPress={retry}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.accent }}
            >
              <Text style={{ ...body, fontWeight: "600", color: "#FFFFFF" }}>Try again</Text>
            </Pressable>
          </View>
        )}

        {rows === null && !error && (
          <View style={{ marginHorizontal: 16, marginTop: 26, gap: 12 }}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={70} />)}
          </View>
        )}

        {sections.map((section, s) => (
          <Animated.View key={section.title} entering={enterFrom(s + 1)}>
            <GroupHeader>{section.title}</GroupHeader>
            <Group>
              {section.data.map((v) => (
                <Cell
                  key={v.manoeuvre.id}
                  testID={`manoeuvre-row-${v.manoeuvre.id}`}
                  chevron
                  onPress={() => router.push(`/manoeuvre/${v.manoeuvre.id}`)}
                >
                  <ManoeuvreThumb slug={v.slug} />
                  <View style={{ flex: 1, marginLeft: 13 }}>
                    <Text maxFontSizeMultiplier={MAX_DISPLAY_SCALE} style={{ ...body, fontWeight: "600", color: colors.label }}>
                      {v.manoeuvre.name}
                    </Text>
                    {/* "" for a name this build does not recognise, which is
                        the row falling back to its name alone rather than
                        drawing an empty second line. */}
                    {v.blurb !== "" && (
                      <Text style={{ ...caption, color: colors.labelTertiary, marginTop: 2 }}>
                        {v.blurb}
                      </Text>
                    )}
                  </View>
                </Cell>
              ))}
            </Group>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
