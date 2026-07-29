import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LineChart } from "react-native-gifted-charts";
import * as Haptics from "expo-haptics";
import { listCentres } from "@/services/centresRepo";
import { listRoutesByCentre } from "@/services/routesRepo";
import { listFavouriteRouteIds, toggleFavourite } from "@/services/favouritesRepo";
import type { Centre, Route } from "@/types/db";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

export default function CentreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [centre, setCentre] = useState<Centre | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const c = await listCentres();
      setCentre(c.data.find((x) => x.id === id) ?? null);
      const r = await listRoutesByCentre(id);
      setRoutes(r.data);
      setFavs(await listFavouriteRouteIds().catch(() => []));
    })();
  }, [id]);

  const onFavourite = useCallback(async (routeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleFavourite(routeId).catch(() => {});
    setFavs(await listFavouriteRouteIds().catch(() => []));
  }, []);

  if (!centre) {
    return (
      <SafeAreaView className="flex-1 bg-surface"><View className="gap-3 p-4">
        <Skeleton h={28} w="60%" /><Skeleton h={90} /><Skeleton h={64} /><Skeleton h={64} />
      </View></SafeAreaView>
    );
  }

  const spark = (centre.pass_rate_history ?? []).map((v) => ({ value: v }));

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="flex-1 gap-3 px-4 pt-1">
        <Pressable onPress={() => router.back()} className="min-h-[44px] flex-row items-center gap-1">
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text className="text-[13px] font-semibold text-accent">Centres</Text>
        </Pressable>
        <Text className="text-[24px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>{centre.name}</Text>
        <Text className="text-[12px] text-slate-500">{centre.address} · {centre.test_types.join(" & ")}</Text>
        <Card className="flex-row items-end justify-between">
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pass rate</Text>
            <Text className="text-[28px] font-semibold tracking-tight text-primary">{centre.pass_rate?.toFixed(1)}%</Text>
            <Text className="text-[11px] text-slate-500">last 8 quarters</Text>
          </View>
          {spark.length > 1 && (
            <LineChart
              data={spark} width={130} height={48} curved thickness={2}
              color={colors.accent} startFillColor={colors.accent} endFillColor="#ffffff"
              startOpacity={0.12} endOpacity={0} areaChart hideDataPoints hideRules hideYAxisText
              yAxisThickness={0} xAxisThickness={0} initialSpacing={0} spacing={130 / Math.max(spark.length - 1, 1)}
              disableScroll
            />
          )}
        </Card>
        <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Routes — swipe right to start, left to favourite</Text>
        <FlatList
          data={routes ?? []}
          keyExtractor={(r) => r.id}
          contentContainerClassName="gap-3 pb-3"
          renderItem={({ item }) => (
            <ReanimatedSwipeable
              renderLeftActions={() => (
                <View className="mr-2 w-20 items-center justify-center rounded-xl bg-accent">
                  <Ionicons name="play" size={20} color="#fff" />
                </View>
              )}
              renderRightActions={() => (
                <View className="ml-2 w-20 items-center justify-center rounded-xl bg-warning">
                  <Ionicons name={favs.includes(item.id) ? "star" : "star-outline"} size={20} color="#fff" />
                </View>
              )}
              onSwipeableOpen={(direction) => {
                if (direction === "left") router.push(`/route/${item.id}/practice`);
                else onFavourite(item.id);
              }}
            >
              <Pressable onPress={() => router.push(`/route/${item.id}`)}>
                <Card className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-[14px] font-semibold text-primary">
                      {item.name}{favs.includes(item.id) ? "  ★" : ""}
                    </Text>
                    <Text className="text-[11px] text-slate-500">{item.estimated_minutes} min · {item.distance_km?.toFixed(1)} km</Text>
                  </View>
                  <DifficultyPips level={item.difficulty} />
                </Card>
              </Pressable>
            </ReanimatedSwipeable>
          )}
        />
        {routes && routes.length > 0 && (
          <View className="pb-3">
            <Button title="Start practice" haptic onPress={() => router.push(`/route/${routes[0].id}/practice`)} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
