import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { useMockTest } from "@/stores/mockTestStore";
import { colors } from "@/ui/theme";

export default function Mock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { phase, route, startedAt, activeZoneIdx, start, onSample, tapMirrors, finish } = useMockTest();
  const [clock, setClock] = useState("0:00");

  useEffect(() => {
    getRoute(id).then((r) => start(r.data.route)).catch(() => {});
  }, [id, start]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      setClock(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (phase !== "running") return;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
        (pos) => onSample({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          speedMps: Math.max(0, pos.coords.speed ?? 0), t: pos.timestamp,
        })
      );
    })();
    return () => sub?.remove();
  }, [phase, onSample]);

  useEffect(() => {
    if (activeZoneIdx !== null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeZoneIdx]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );

  return (
    <View className="flex-1">
      <MapView style={{ flex: 1 }} mapType="mutedStandard" showsUserLocation followsUserLocation
        initialRegion={coords[0] && { ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
        <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
      </MapView>

      <View className="absolute left-4 right-4 top-14 flex-row items-center justify-between rounded-xl bg-card px-4 py-2.5" style={{ shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12 }}>
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-danger" />
          <Text className="text-[13px] font-semibold text-primary">Mock test</Text>
        </View>
        <Text className="text-[14px] font-semibold text-primary" style={{ fontVariant: ["tabular-nums"] }}>{clock}</Text>
      </View>

      {activeZoneIdx !== null && (
        <Text className="absolute bottom-52 self-center rounded-full bg-card/90 px-4 py-1.5 text-[11px] font-semibold text-slate-600">
          Observation zone — check your mirrors
        </Text>
      )}

      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); tapMirrors(); }}
        className={`absolute bottom-28 h-[74px] w-[74px] items-center justify-center self-center rounded-full ${activeZoneIdx !== null ? "bg-accent" : "bg-slate-300"}`}
        style={activeZoneIdx !== null ? { shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 16 } : undefined}
      >
        <Ionicons name="eye-outline" size={22} color="#fff" />
        <Text className="text-[11px] font-bold text-white">Mirrors</Text>
      </Pressable>

      <Pressable
        onPress={() => { finish(); router.replace(`/route/${id}/result`); }}
        className="absolute bottom-10 self-center min-h-[44px] flex-row items-center rounded-full bg-primary px-6 py-2.5"
      >
        <Text className="text-[13px] font-semibold text-white">Finish test</Text>
      </Pressable>
    </View>
  );
}
