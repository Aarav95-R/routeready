import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatDistance } from "@/lib/navigation";
import type { Route } from "@/types/db";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

export type RoutePreviewCardProps = {
  route: Route;
  isLoop: boolean;
  /** Metres from the driver to the start line; null when there is no fix yet. */
  distToStart: number | null;
  /** Close enough that the two ways of setting off collapse into one button. */
  atStart: boolean;
  /** Directions are being fetched — every button is inert until they land. */
  busy: boolean;
  onGuideToStart: () => void;
  /**
   * "Start directly from here" — set off now and steer to the start on a
   * bearing, because the driver would rather not be routed there.
   */
  onStartUnguided: () => void;
  /**
   * The collapsed "Start", offered only when the driver is already on the
   * start line. A separate callback rather than a second use of the one
   * above: they read alike and mean opposite things — one opens a drive to
   * the start, the other says there is no drive to make — and sharing a prop
   * is what put a full-screen bearing arrow over a car parked on the start.
   */
  onBeginAtStart: () => void;
  onBack: () => void;
};

/**
 * The card a route is looked at before it is driven: what the route is, how far
 * away its start is, and the two ways of setting off. Shared by the practice
 * and mock test screens so a drive and an assessed drive begin the same way —
 * they took the same shape once and drifted, which is exactly what a second
 * copy of this markup would let happen again.
 *
 * Positioning belongs to the caller's screen; this is the card itself.
 */
export function RoutePreviewCard({
  route, isLoop, distToStart, atStart, busy,
  onGuideToStart, onStartUnguided, onBeginAtStart, onBack,
}: RoutePreviewCardProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute bottom-0 left-0 right-0 gap-2.5 rounded-t-3xl bg-card px-4 pt-4"
      style={{ paddingBottom: insets.bottom + 14, shadowColor: "#221F1C", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } }}
    >
      <Text className="text-[18px] font-semibold tracking-tight text-primary" style={{ fontFamily: FACES["600"] }}>{route.name}</Text>
      <View className="flex-row items-center gap-5">
        <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Distance</Text><Text className="text-[15px] font-semibold text-primary">{route.distance_km?.toFixed(1)} km</Text></View>
        <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Time</Text><Text className="text-[15px] font-semibold text-primary">{route.estimated_minutes} min</Text></View>
        <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Difficulty</Text><View className="mt-1"><DifficultyPips level={route.difficulty} /></View></View>
        {isLoop && <View className="flex-1 items-end"><Text className="text-[11px] font-semibold text-slate-400">Loop · start = finish</Text></View>}
      </View>

      {atStart ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Start" disabled={busy} onPress={onBeginAtStart} className="mt-1 min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-accent active:bg-accent-pressed">
          <Ionicons name="navigate" size={18} color="#fff" /><Text className="text-[16px] font-semibold text-white">Start</Text>
        </Pressable>
      ) : (
        <>
          <View className="mt-0.5 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-2.5">
            <Ionicons name="location-outline" size={15} color={colors.accent} />
            <Text className="text-[12px] font-semibold text-slate-600">
              {distToStart !== null ? `You're ${formatDistance(distToStart)} from the start` : "You're away from the start point"}
            </Text>
          </View>
          <Pressable disabled={busy} onPress={onGuideToStart} className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-accent active:bg-accent-pressed">
            <Ionicons name="navigate" size={18} color="#fff" /><Text className="text-[16px] font-semibold text-white">{busy ? "Finding route…" : "Guide me to the start"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Start directly from here" disabled={busy} onPress={onStartUnguided} className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-slate-200 bg-card">
            <Ionicons name="arrow-forward" size={17} color={colors.primary} /><Text className="text-[15px] font-semibold text-primary">Start directly from here</Text>
          </Pressable>
        </>
      )}
      <Pressable onPress={onBack} className="min-h-[40px] items-center justify-center"><Text className="text-[13px] font-semibold text-slate-500">Back</Text></Pressable>
    </View>
  );
}
