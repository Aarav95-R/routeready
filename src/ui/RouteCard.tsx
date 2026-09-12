import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { difficultyWord, plainSummary, progressBadge, progressLine, shortRouteName } from "@/lib/routeSummary";
import type { ProgressEntry, Route } from "@/types/db";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { enterFrom, pulse } from "@/ui/motion";
import { RouteThumbnail } from "@/ui/RouteThumbnail";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

/**
 * One route, as a postcard: its own map, what the drive is like in the words an
 * instructor would use, and what you have already scored on it.
 *
 * The card carries no data logic — every string on it comes from
 * lib/routeSummary, which is where those rules are tested.
 */
export function RouteCard({
  route, progress = [], favourite, width, index = 0, locked = false, onOpen, onStart, onFavourite,
}: {
  route: Route;
  progress?: ProgressEntry[];
  favourite: boolean;
  width: number;
  index?: number;
  /**
   * A route at this centre that is not the free one, seen by somebody who has
   * not subscribed.
   *
   * The card keeps its drawing and its description deliberately: those are the
   * argument for paying, and a card reduced to a padlock argues for nothing.
   * What it loses is everything that implies ownership — the history line and
   * the favourite star.
   */
  locked?: boolean;
  onOpen: () => void;
  onStart: () => void;
  onFavourite: () => void;
}) {
  const history = progressLine(progress);
  const badge = progressBadge(progress);
  const driven = progress.length > 0;

  // A locked route has no history worth showing — any rows would predate a
  // lapse — and no star, because favouriting something you cannot open is a
  // promise the app cannot keep.
  const showHistory = !locked && Boolean(history);

  // Grow and straight back, no overshoot on the return. The old spring pair
  // (damping 6) threw the star to 1.25 and rang it down through four bounces,
  // twice — nearly a second of wobble to acknowledge a toggle.
  const reducedMotion = useReducedMotion();
  const starScale = useSharedValue(1);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (reducedMotion) return;
    starScale.value = pulse();
  }, [favourite, starScale, reducedMotion]);
  const starStyle = useAnimatedStyle(() => ({ transform: [{ scale: starScale.value }] }));

  return (
    <Animated.View entering={enterFrom(index)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${shortRouteName(route.name)}, ${difficultyWord(route.difficulty)}`}
        onPress={onOpen}
        className="overflow-hidden rounded-[20px] bg-card active:scale-[0.98]"
        style={{ shadowColor: "#221F1C", shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } }}
      >
        <View className="border-b border-slate-100" style={{ backgroundColor: colors.drawing, opacity: locked ? 0.55 : 1 }}>
          <RouteThumbnail
            geometry={route.geometry}
            zones={route.observation_zones}
            width={width}
            drawDelayMs={index * 60 + 220}
          />
          <View className="absolute right-2.5 top-2.5 flex-row items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1">
            {driven && !locked && <View className="h-1.5 w-1.5 rounded-full bg-accent" />}
            <Text
              testID="route-badge"
              className={`text-[10.5px] font-bold ${driven && !locked ? "text-accent" : "text-slate-500"}`}
              style={{ fontFamily: FACES["700"] }}
            >
              {locked ? "Locked" : badge}
            </Text>
          </View>
          {!locked && (
            <Pressable
              onPress={onFavourite}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={favourite ? "Remove from favourites" : "Add to favourites"}
              className="absolute left-2.5 top-2.5 h-8 w-8 items-center justify-center rounded-full bg-white/95"
            >
              <Animated.View style={starStyle}>
                <Ionicons name={favourite ? "star" : "star-outline"} size={15} color={favourite ? colors.warning : colors.ink3} />
              </Animated.View>
            </Pressable>
          )}
        </View>

        <View className="px-3.5 pb-3.5 pt-3">
          <Text className="text-[16px] font-semibold tracking-tight text-primary" style={{ fontFamily: FACES["600"] }}>
            {shortRouteName(route.name)}
          </Text>
          <Text className="mt-0.5 text-[12.5px] text-slate-600">{plainSummary(route)}</Text>
          {showHistory && (
            <Text className="mt-1 text-[12px] font-semibold text-accent" style={{ fontFamily: FACES["600"] }}>
              {history}
            </Text>
          )}
          {locked && (
            <View className="mt-2 flex-row items-center gap-1.5">
              <Ionicons name="lock-closed" size={12} color={colors.clay} />
              <Text className="text-[12px] font-semibold" style={{ color: colors.clay, fontFamily: FACES["600"] }}>
                Unlock to drive this route
              </Text>
            </View>
          )}

          <View className="mt-3 flex-row items-end justify-between">
            <View className="gap-1.5">
              <Text className="text-[12px] font-semibold text-slate-500">
                {route.estimated_minutes} min · {route.distance_km?.toFixed(1)} km
              </Text>
              <View className="flex-row items-center gap-2">
                <DifficultyPips level={route.difficulty} />
                <Text className="text-[11.5px] font-semibold text-slate-600">{difficultyWord(route.difficulty)}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onStart(); }}
              className="min-h-[36px] flex-row items-center gap-1.5 rounded-full bg-accent px-4 active:bg-accent-pressed"
            >
              <Ionicons name="play" size={13} color="#fff" />
              <Text className="text-[13.5px] font-semibold text-white">Start</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
