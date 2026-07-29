import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import { getRoute } from "@/services/routesRepo";
import type { Hazard, Route } from "@/types/db";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const SEV: Record<Hazard["severity"], string> = { low: "text-slate-500", medium: "text-accent", high: "text-warning" };

export default function RouteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );
  const region = useMemo(() => {
    if (!coords.length) return undefined;
    const lats = coords.map((c) => c.latitude);
    const lngs = coords.map((c) => c.longitude);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.4 + 0.005,
      longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.4 + 0.005,
    };
  }, [coords]);

  if (!route) {
    return <SafeAreaView className="flex-1 bg-surface"><View className="gap-3 p-4"><Skeleton h={200} /><Skeleton h={70} /><Skeleton h={64} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="h-[230px] overflow-hidden">
        <MapView style={{ flex: 1 }} mapType="mutedStandard" initialRegion={region} pitchEnabled={false} rotateEnabled={false}>
          <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
          {hazards.map((h) => (
            <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} pinColor={colors.warning} />
          ))}
        </MapView>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
        <Text className="text-[20px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>{route.name}</Text>
        <Card className="flex-row">
          <View className="flex-1 items-center"><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Time</Text><Text className="text-[14px] font-semibold text-primary">{route.estimated_minutes} min</Text></View>
          <View className="flex-1 items-center border-x border-slate-100"><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Distance</Text><Text className="text-[14px] font-semibold text-primary">{route.distance_km?.toFixed(1)} km</Text></View>
          <View className="flex-1 items-center"><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Difficulty</Text><DifficultyPips level={route.difficulty} /></View>
        </Card>
        <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Hazards on this route</Text>
        {hazards.map((h) => (
          <Card key={h.id} className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[14px] font-semibold capitalize text-primary">{h.type}</Text>
              <Text className="text-[11px] text-slate-500">{h.description}</Text>
            </View>
            <Text className={`text-[11px] font-bold uppercase ${SEV[h.severity]}`}>{h.severity}</Text>
          </Card>
        ))}
        <View className="flex-row gap-3 pb-4 pt-1">
          <View className="flex-1"><Button title="Practice drive" haptic onPress={() => router.push(`/route/${id}/practice`)} /></View>
          <View className="flex-1"><Button title="Mock test" variant="dark" haptic onPress={() => router.push(`/route/${id}/mock`)} /></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
