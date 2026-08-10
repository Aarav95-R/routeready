import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { assignIdentities } from "@/lib/centreIdentity";
import {
  buildSections,
  type CentreFilter, type CentreSort, type ViewCentre,
} from "@/lib/centresView";
import { haversineM, type LatLng } from "@/lib/geo";
import { listCentres } from "@/services/centresRepo";
import { useNetwork } from "@/stores/networkStore";
import type { Centre } from "@/types/db";
import { CENTRE_ROW_H, CentreRow } from "@/ui/CentreRow";
import { CentresMap, type CentresMapHandle } from "@/ui/CentresMap";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { Skeleton } from "@/ui/Skeleton";
import { colors } from "@/ui/theme";

const SORTS: { key: CentreSort; label: string }[] = [
  { key: "nearest", label: "Nearest" },
  { key: "pass", label: "Pass rate" },
];
const FILTERS: { key: CentreFilter; label: string }[] = [
  { key: "manual", label: "Manual" },
  { key: "auto", label: "Auto" },
];

type Row = { kind: "header"; title: string } | { kind: "centre"; item: ViewCentre; index: number };

export default function Centres() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const online = useNetwork((s) => s.online);
  const map = useRef<CentresMapHandle>(null);

  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CentreSort>("nearest");
  const [filter, setFilter] = useState<CentreFilter>("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await listCentres();
      setCentres(r.data);
      setStale(r.stale);
    } catch {
      setError("Couldn't load centres.");
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      // No fix means no distances and no near set. The sort falls back rather
      // than leaving a "Nearest" control that silently does nothing, which is
      // what the screen this replaces did.
      if (status !== "granted") { setSort("pass"); return; }
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
      if (pos) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })();
  }, [load]);

  // Identity is assigned from the distance-sorted list, never the displayed
  // one, so re-sorting by pass rate repaints nothing.
  const identities = useMemo(() => {
    const all = centres ?? [];
    const ordered = me
      ? [...all].sort((a, b) =>
          haversineM(me, { lat: a.lat, lng: a.lng }) - haversineM(me, { lat: b.lat, lng: b.lng }))
      : all;
    return assignIdentities(ordered);
  }, [centres, me]);

  const sections = useMemo(
    () => buildSections({ centres: centres ?? [], me, sort, filter, query }),
    [centres, me, sort, filter, query]
  );

  // Pins are the pinned entries that survived the filter and the search, not
  // the raw near set: nearSet() is deliberately computed off the unfiltered
  // list (so pin membership and identity colours stay stable), but the map
  // must not keep showing a pin for a row the user just filtered away.
  const pins = useMemo(
    () => sections.flatMap((s) => s.data).filter((v) => v.pinned).map((v) => v.centre),
    [sections]
  );

  // One flat array, because a fixed row height is what lets the map binding
  // work out the active centre from a scroll offset without measuring.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let index = 0;
    for (const section of sections) {
      if (sections.length > 1) out.push({ kind: "header", title: section.title });
      for (const item of section.data) out.push({ kind: "centre", item, index: index++ });
    }
    return out;
  }, [sections]);

  const empty = centres !== null && !error && rows.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <CentresMap ref={map} pins={pins} identities={identities} me={me} activeId={null} />

      <View style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, flexDirection: "row", gap: 8 }}>
        <View style={pillStyle}>
          <Ionicons name="location" size={13} color={colors.accent} />
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.primary }}>Test centres</Text>
        </View>
        {!me && (
          <Pressable
            testID="enable-location"
            style={pillStyle}
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== "granted") return;
              const pos = await Location.getCurrentPositionAsync({});
              setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: "#64748B" }}>Turn on location for distances</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable testID="recentre" style={pillStyle} onPress={() => map.current?.fitAll()}>
          <Ionicons name="locate" size={15} color={colors.accent} />
        </Pressable>
      </View>

      <BottomSheet index={0} snapPoints={["52%", "92%"]} bottomInset={0}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Ionicons name="search" size={15} color={colors.ink3} />
            <TextInput
              testID="centre-search"
              style={{ flex: 1, fontSize: 14 }}
              placeholder="Search centres"
              value={query}
              onChangeText={setQuery}
            />
          </View>

          {/* Two axes, not one. Choosing a car type keeps the sort. */}
          <View style={{ flexDirection: "row", backgroundColor: "rgba(226,232,240,0.8)", borderRadius: 9, padding: 2 }}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                testID={`sort-${s.key}`}
                disabled={s.key === "nearest" && !me}
                onPress={() => setSort(s.key)}
                style={[segStyle, sort === s.key && segOnStyle]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: segTextColor(sort === s.key, s.key === "nearest" && !me) }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(filter === f.key ? "all" : f.key)}
                style={[segStyle, filter === f.key && segOnStyle]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: segTextColor(filter === f.key, false) }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <OfflineBanner visible={stale || !online} />

        {/* A sheet whose list has been replaced by an error has nothing to pull
            down, so the retry is a button. */}
        {error && (
          <View testID="centres-error" style={{ padding: 24, alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>{error}</Text>
            <Pressable
              testID="centres-retry"
              onPress={load}
              style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.accent }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>Try again</Text>
            </Pressable>
          </View>
        )}

        {centres === null && !error && (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={CENTRE_ROW_H - 12} />)}
          </View>
        )}

        {empty && (
          <View testID="centres-empty" style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748B" }}>No centres match “{query}”.</Text>
          </View>
        )}

        {!error && rows.length > 0 && (
          <BottomSheetFlatList
            data={rows}
            keyExtractor={(r) => (r.kind === "header" ? `h:${r.title}` : r.item.centre.id)}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item: row }) =>
              row.kind === "header" ? (
                <Text style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: "#94A3B8" }}>
                  {row.title}
                </Text>
              ) : (
                <CentreRow
                  item={row.item}
                  identity={identities.get(row.item.centre.id)!}
                  active={false}
                  index={row.index}
                  onPress={() => router.push(`/centre/${row.item.centre.id}`)}
                />
              )
            }
          />
        )}
      </BottomSheet>
    </View>
  );
}

const pillStyle = {
  backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 999,
  paddingHorizontal: 13, paddingVertical: 7,
  flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
  shadowColor: "#0F172A", shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
};
const segStyle = { flex: 1, minHeight: 32, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 7 };
const segOnStyle = {
  backgroundColor: "#FFFFFF",
  shadowColor: "#0F172A", shadowOpacity: 0.14, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 },
};
const segTextColor = (on: boolean, disabled: boolean) =>
  disabled ? "#CBD5E1" : on ? colors.primary : "#64748B";
