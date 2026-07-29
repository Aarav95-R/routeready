import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { listCentres } from "@/services/centresRepo";
import { useNetwork } from "@/stores/networkStore";
import { haversineM, LatLng } from "@/lib/geo";
import type { Centre } from "@/types/db";
import { Card } from "@/ui/Card";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const FILTERS = ["Nearest", "Pass rate", "Manual", "Auto"];

export default function Centres() {
  const router = useRouter();
  const online = useNetwork((s) => s.online);
  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await listCentres();
      setCentres(r.data);
      setStale(r.stale);
    } catch {
      setError("Couldn't load centres. Pull down to retry.");
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({});
      if (pos) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })();
  }, [load]);

  const distanceMi = useCallback(
    (c: Centre) => (me ? haversineM(me, { lat: c.lat, lng: c.lng }) / 1609.34 : null),
    [me]
  );

  const shown = useMemo(() => {
    let list = centres ?? [];
    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
    if (filter === 2) list = list.filter((c) => c.test_types.includes("manual"));
    if (filter === 3) list = list.filter((c) => c.test_types.includes("auto"));
    if (filter === 1) list = [...list].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0));
    if (filter === 0 && me) list = [...list].sort((a, b) => (distanceMi(a) ?? 1e9) - (distanceMi(b) ?? 1e9));
    return list;
  }, [centres, query, filter, me, distanceMi]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="gap-3 px-4 pb-2 pt-2">
        <Text className="text-[24px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>Test centres</Text>
        <View className="flex-row items-center gap-2 rounded-lg border border-slate-200 bg-card px-3 py-2.5">
          <Ionicons name="search" size={15} color={colors.ink3} />
          <TextInput className="flex-1 text-[14px]" placeholder="Search centres" value={query} onChangeText={setQuery} />
        </View>
        <SegmentedControl options={FILTERS} selectedIndex={filter} onChange={setFilter} />
      </View>
      <OfflineBanner visible={stale || !online} />
      {error && (
        <View className="mx-4 rounded-lg bg-danger/10 px-3 py-2">
          <Text className="text-[12px] font-semibold text-danger">{error}</Text>
        </View>
      )}
      {centres === null && !error ? (
        <View className="gap-3 px-4 pt-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={72} />)}
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          contentContainerClassName="gap-3 px-4 pb-6 pt-2"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item }) => {
            const mi = distanceMi(item);
            return (
              <Pressable onPress={() => router.push(`/centre/${item.id}`)}>
                <Card className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-[15px] font-semibold text-primary">{item.name}</Text>
                    <Text className="text-[11px] text-slate-500">
                      {item.region ?? ""}{mi !== null ? ` · ${mi.toFixed(1)} mi away` : ""}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={`text-[20px] font-semibold tracking-tight ${(item.pass_rate ?? 0) >= 45 ? "text-accent" : "text-warning"}`}>
                      {item.pass_rate?.toFixed(0) ?? "—"}%
                    </Text>
                    <Text className="text-[11px] text-slate-500">pass rate</Text>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
