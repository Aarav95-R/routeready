import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { advance, ANNOUNCE_M, formatDistance, remainingM } from "@/lib/navigation";
import { bearingDeg, haversineM, LatLng } from "@/lib/geo";
import type { Hazard, NavStep, Route } from "@/types/db";
import { colors } from "@/ui/theme";

// Navigation camera: zoomed in, tilted into 3D, rotated to heading.
const NAV_PITCH = 50;
const NAV_ZOOM = 17;

function maneuverIcon(step?: NavStep): keyof typeof Ionicons.glyphMap {
  if (!step) return "navigate";
  if (step.type === "arrive") return "flag";
  if (step.type === "depart") return "navigate";
  if (step.type.includes("roundabout") || step.type === "rotary") return "sync";
  const m = step.modifier;
  if (m.includes("uturn")) return "arrow-undo";
  if (m.includes("left")) return "arrow-back";
  if (m.includes("right")) return "arrow-forward";
  return "arrow-up";
}

export default function Practice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);

  const indexRef = useRef(1);
  const preparedRef = useRef(new Set<number>());
  const executedRef = useRef(new Set<number>());
  const headingRef = useRef(0);
  const prevPosRef = useRef<LatLng | null>(null);
  const lastPosRef = useRef<LatLng | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );
  const steps = useMemo(() => route?.steps ?? [], [route]);

  const recenter = (heading = headingRef.current) => {
    const p = lastPosRef.current;
    if (p) mapRef.current?.animateCamera({ center: { latitude: p.lat, longitude: p.lng }, heading, pitch: NAV_PITCH, zoom: NAV_ZOOM }, { duration: 500 });
  };

  useEffect(() => {
    if (!steps.length) return;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setPermissionDenied(true); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 },
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };

          // Heading: prefer the GPS course; fall back to travel bearing; else keep last.
          let heading = headingRef.current;
          if (pos.coords.heading != null && pos.coords.heading >= 0 && (pos.coords.speed ?? 0) > 0.5) {
            heading = pos.coords.heading;
          } else if (prevPosRef.current && haversineM(prevPosRef.current, p) > 3) {
            heading = bearingDeg(prevPosRef.current, p);
          }
          headingRef.current = heading;
          prevPosRef.current = p;
          lastPosRef.current = p;

          // Drive the navigation camera: locked to you, tilted, heading-up.
          mapRef.current?.animateCamera(
            { center: { latitude: p.lat, longitude: p.lng }, heading, pitch: NAV_PITCH, zoom: NAV_ZOOM },
            { duration: 900 }
          );

          const st = advance(steps, p, indexRef.current);
          indexRef.current = st.index;
          setStepIndex(st.index);
          setDistanceM(st.distanceToManeuverM);
          setRemaining(remainingM(steps, p, st.index));
          setArrived(st.arrived);

          const cur = steps[st.index];
          if (cur && cur.type !== "depart") {
            const d = st.distanceToManeuverM;
            if (d <= ANNOUNCE_M && d > 40 && !preparedRef.current.has(st.index)) {
              preparedRef.current.add(st.index);
              Speech.speak(`In ${formatDistance(d)}, ${cur.instruction}`, { language: "en-GB" });
            }
            if (d <= 40 && !executedRef.current.has(st.index)) {
              executedRef.current.add(st.index);
              Speech.speak(cur.instruction, { language: "en-GB" });
            }
          }
        }
      );
    })();
    return () => { sub?.remove(); Speech.stop(); };
  }, [steps]);

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-8">
        <Text className="text-center text-[15px] font-semibold text-primary">Location access is needed to guide you along the route.</Text>
        <Text className="text-center text-[12px] text-slate-500">Enable it in Settings → Privacy → Location Services → Expo Go.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 min-h-[44px] items-center justify-center rounded-full border-[1.5px] border-slate-200 px-6">
          <Text className="text-[14px] font-semibold text-primary">Back</Text>
        </Pressable>
      </View>
    );
  }

  const current = steps[stepIndex];
  const next = steps[stepIndex + 1];
  const bigDistance = arrived ? "Arrived" : distanceM === null ? "" : formatDistance(distanceM);

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }} mapType="mutedStandard" showsUserLocation showsMyLocationButton={false} showsCompass={false}
        initialCamera={coords[0] ? { center: coords[0], heading: 0, pitch: NAV_PITCH, zoom: NAV_ZOOM, altitude: 0 } : undefined}
      >
        <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={7} lineCap="round" lineJoin="round" />
        {hazards.map((h) => (
          <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} pinColor={colors.warning}
            onPress={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }} />
        ))}
      </MapView>

      {/* Turn-by-turn instruction card */}
      <View className="absolute left-3 right-3" style={{ top: insets.top + 6 }}>
        <View className="overflow-hidden rounded-2xl bg-primary" style={{ shadowColor: "#0F172A", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
          <View className="flex-row items-center gap-3 px-4 py-3.5">
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-accent">
              <Ionicons name={maneuverIcon(current)} size={26} color="#fff" />
            </View>
            <View className="flex-1">
              {!arrived && bigDistance !== "" && (
                <Text className="text-[13px] font-semibold text-emerald-300">{bigDistance}</Text>
              )}
              <Text className="text-[17px] font-semibold leading-[21px] text-white" numberOfLines={2}>
                {current?.instruction ?? "Follow the green route"}
              </Text>
            </View>
          </View>
          {next && !arrived && (
            <View className="flex-row items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-2">
              <Ionicons name={maneuverIcon(next)} size={14} color="#94A3B8" />
              <Text className="flex-1 text-[12px] text-slate-300" numberOfLines={1}>then {next.instruction}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Recenter */}
      <Pressable
        onPress={() => recenter()}
        className="absolute right-4 h-11 w-11 items-center justify-center rounded-full bg-card"
        style={{ bottom: 96, shadowColor: "#0F172A", shadowOpacity: 0.15, shadowRadius: 8 }}
      >
        <Ionicons name="navigate" size={19} color={colors.accent} />
      </Pressable>

      {/* Bottom bar: remaining + end */}
      <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12, shadowColor: "#0F172A", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}>
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{arrived ? "Route complete" : "Remaining"}</Text>
          <Text className="text-[18px] font-semibold text-primary">{remaining === null ? "—" : formatDistance(remaining)}</Text>
        </View>
        <Pressable onPress={() => router.back()} className="min-h-[44px] items-center justify-center rounded-full bg-danger px-6">
          <Text className="text-[14px] font-semibold text-white">End</Text>
        </Pressable>
      </View>

      <BottomSheet ref={sheetRef} index={-1} snapPoints={["25%", "50%", "90%"]} enablePanDownToClose handleIndicatorStyle={{ backgroundColor: "#CBD5E1" }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {selectedHazard && (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-semibold capitalize text-primary">{selectedHazard.type}</Text>
                <Text className={`text-[11px] font-bold uppercase ${selectedHazard.severity === "high" ? "text-warning" : "text-slate-500"}`}>{selectedHazard.severity}</Text>
              </View>
              <Text className="mt-1 text-[12px] leading-5 text-slate-600">{selectedHazard.description}</Text>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
