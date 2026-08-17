import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { listCentres } from "@/services/centresRepo";
import { listRoutesByCentre } from "@/services/routesRepo";
import { listProgressByCentre } from "@/services/progressRepo";
import { listFavouriteRouteIds, toggleFavourite } from "@/services/favouritesRepo";
import type { Centre, ProgressEntry, Route } from "@/types/db";
import { enterAfter } from "@/ui/motion";
import { RouteCard } from "@/ui/RouteCard";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";
import { FACES } from "@/ui/type";

const H_PADDING = 16;

export default function CentreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [centre, setCentre] = useState<Centre | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressEntry[]>>({});

  useEffect(() => {
    (async () => {
      const c = await listCentres();
      setCentre(c.data.find((x) => x.id === id) ?? null);
      const r = await listRoutesByCentre(id);
      setRoutes(r.data);
      setFavs(await listFavouriteRouteIds().catch(() => []));
      // A missing history must never blank the routes list, so this failure is
      // swallowed: the cards simply read "New".
      const p = await listProgressByCentre(id, r.data.map((x) => x.id)).catch(() => null);
      if (p) setProgress(p.data);
    })();
  }, [id]);

  const onFavourite = useCallback(async (routeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFavs((f) => (f.includes(routeId) ? f.filter((x) => x !== routeId) : [...f, routeId]));
    await toggleFavourite(routeId).catch(() => {});
    setFavs(await listFavouriteRouteIds().catch(() => []));
  }, []);

  if (!centre) {
    return (
      <SafeAreaView className="flex-1 bg-surface"><View className="gap-3 p-4">
        <Skeleton h={28} w="60%" /><Skeleton h={200} /><Skeleton h={200} />
      </View></SafeAreaView>
    );
  }

  const attempted = routes ? routes.filter((r) => (progress[r.id]?.length ?? 0) > 0).length : 0;
  const typicalMinutes = routes?.length
    ? Math.round(routes.reduce((sum, r) => sum + (r.estimated_minutes ?? 0), 0) / routes.length)
    : null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <FlatList
        data={routes ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingBottom: 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Animated.View entering={enterAfter(0)} className="pb-3">
            <Pressable onPress={() => router.back()} className="min-h-[44px] flex-row items-center gap-1">
              <Ionicons name="chevron-back" size={18} color={colors.accent} />
              <Text className="text-[13px] font-semibold text-accent">Centres</Text>
            </Pressable>
            <Text className="text-[26px] font-semibold tracking-tight text-primary" style={{ fontFamily: FACES["600"] }}>
              {centre.name}
              {routes ? <Text className="text-[26px] font-semibold text-slate-400"> · {routes.length} routes</Text> : null}
            </Text>
            <Text className="mt-1 text-[13px] text-slate-600">
              {typicalMinutes ? `Around ${typicalMinutes} minutes each. ` : ""}{centre.test_types.join(" & ")}.
            </Text>
            <View className="mt-3 flex-row gap-2">
              {centre.pass_rate !== null && (
                <View className="flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-card px-3 py-1.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <Text className="text-[11.5px] font-semibold text-slate-600">
                    <Text className="font-bold text-primary">{centre.pass_rate.toFixed(1)}%</Text> pass rate
                  </Text>
                </View>
              )}
              {routes && routes.length > 0 && (
                <View className="flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-card px-3 py-1.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <Text className="text-[11.5px] font-semibold text-slate-600">
                    <Text className="font-bold text-primary">{attempted} of {routes.length}</Text> attempted
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        }
        ListEmptyComponent={
          routes === null
            ? <View className="gap-3.5"><Skeleton h={200} /><Skeleton h={200} /></View>
            : <Text className="pt-6 text-center text-[13px] text-slate-500">No routes seeded for this centre yet.</Text>
        }
        renderItem={({ item, index }) => (
          <ReanimatedSwipeable
            renderLeftActions={() => (
              <View className="mr-2 w-20 items-center justify-center rounded-[20px] bg-accent">
                <Ionicons name="play" size={20} color="#fff" />
              </View>
            )}
            renderRightActions={() => (
              <View className="ml-2 w-20 items-center justify-center rounded-[20px] bg-warning">
                <Ionicons name={favs.includes(item.id) ? "star" : "star-outline"} size={20} color="#fff" />
              </View>
            )}
            onSwipeableOpen={(direction) => {
              if (direction === "left") router.push(`/route/${item.id}/start`);
              else onFavourite(item.id);
            }}
          >
            <RouteCard
              route={item}
              progress={progress[item.id]}
              favourite={favs.includes(item.id)}
              width={width - H_PADDING * 2}
              index={index}
              // One card, one destination. Tapping the card and tapping Start
              // used to land on two different screens — the detail page and
              // the drive — which made the card's own tap a coin toss.
              onOpen={() => router.push(`/route/${item.id}/start`)}
              onStart={() => router.push(`/route/${item.id}/start`)}
              onFavourite={() => onFavourite(item.id)}
            />
          </ReanimatedSwipeable>
        )}
      />
    </SafeAreaView>
  );
}
