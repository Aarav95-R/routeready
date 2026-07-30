import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { advance, ANNOUNCE_M, destinationPoint, formatDistance, navZoom, remainingM, trailIndex } from "@/lib/navigation";
import { bearingDeg, haversineM, LatLng } from "@/lib/geo";
import type { Hazard, NavStep, Route } from "@/types/db";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { colors } from "@/ui/theme";

const NAV_PITCH = 55;
const LOOK_AHEAD_M = 60; // camera sits this far ahead of the driver

type Phase = "preview" | "navigating" | "finished";

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

  const [phase, setPhase] = useState<Phase>("preview");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [stepIndex, setStepIndex] = useState(1);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [trailIdx, setTrailIdx] = useState(0);

  const indexRef = useRef(1);
  const trailRef = useRef(0);
  const preparedRef = useRef(new Set<number>());
  const executedRef = useRef(new Set<number>());
  const headingRef = useRef(0);
  const prevPosRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
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
  const isLoop = useMemo(
    () => coords.length > 1 && haversineM(
      { lat: coords[0].latitude, lng: coords[0].longitude },
      { lat: coords[coords.length - 1].latitude, lng: coords[coords.length - 1].longitude }
    ) < 30,
    [coords]
  );

  const fitPreview = useCallback(() => {
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 60, bottom: 240, left: 60 },
        animated: true,
      });
    }
  }, [coords]);

  useEffect(() => {
    if (phase === "preview") fitPreview();
  }, [phase, fitPreview]);

  const stopWatching = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    Speech.stop();
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  const onPosition = useCallback((coordsIn: Location.LocationObjectCoords, ts: number) => {
    const p = { lat: coordsIn.latitude, lng: coordsIn.longitude };

    let heading = headingRef.current;
    if (coordsIn.heading != null && coordsIn.heading >= 0 && (coordsIn.speed ?? 0) > 0.5) heading = coordsIn.heading;
    else if (prevPosRef.current && haversineM(prevPosRef.current, p) > 3) heading = bearingDeg(prevPosRef.current, p);
    headingRef.current = heading;
    prevPosRef.current = p;
    setPos(p);

    const st = advance(steps, p, indexRef.current);
    indexRef.current = st.index;
    setStepIndex(st.index);
    setDistanceM(st.distanceToManeuverM);
    setRemaining(remainingM(steps, p, st.index));

    const ti = trailIndex(coords.map((c) => ({ lat: c.latitude, lng: c.longitude })), p, trailRef.current);
    trailRef.current = ti;
    setTrailIdx(ti);

    // Look-ahead navigation camera: locked ahead of you, tilted, heading-up.
    const centre = destinationPoint(p, heading, LOOK_AHEAD_M);
    mapRef.current?.animateCamera(
      { center: { latitude: centre.lat, longitude: centre.lng }, heading, pitch: NAV_PITCH, zoom: navZoom(st.distanceToManeuverM) },
      { duration: 900 }
    );

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

    if (st.arrived) {
      stopWatching();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("finished");
    }
  }, [steps, coords, stopWatching]);

  const startNavigation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setPermissionDenied(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("navigating");

    try {
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const p = { lat: first.coords.latitude, lng: first.coords.longitude };
      prevPosRef.current = p;
      setPos(p);
      const centre = destinationPoint(p, headingRef.current, LOOK_AHEAD_M);
      mapRef.current?.animateCamera(
        { center: { latitude: centre.lat, longitude: centre.lng }, heading: headingRef.current, pitch: NAV_PITCH, zoom: 17 },
        { duration: 700 }
      );
    } catch {
      /* the watcher will lock on shortly */
    }

    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 },
      (loc) => onPosition(loc.coords, loc.timestamp)
    );
  }, [onPosition]);

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
  const start = coords[0];
  const finish = coords[coords.length - 1];
  const traveled = coords.slice(0, Math.max(trailIdx, 1) + 1);
  const ahead = coords.slice(trailIdx);

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }} mapType="mutedStandard"
        showsUserLocation={false} showsMyLocationButton={false} showsCompass={false}
        onMapReady={() => { if (phase === "preview") fitPreview(); }}
      >
        {phase === "preview" ? (
          <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={6} lineCap="round" lineJoin="round" />
        ) : (
          <>
            <Polyline coordinates={traveled} strokeColor="#CBD5E1" strokeWidth={6} lineCap="round" lineJoin="round" />
            <Polyline coordinates={ahead} strokeColor={colors.accent} strokeWidth={7} lineCap="round" lineJoin="round" />
          </>
        )}

        {/* Start / Finish markers */}
        {start && (
          <Marker coordinate={start} anchor={{ x: 0.5, y: 0.5 }}>
            <View className="h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-accent" style={{ shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3 }}>
              <View className="h-2 w-2 rounded-full bg-white" />
            </View>
          </Marker>
        )}
        {finish && !isLoop && (
          <Marker coordinate={finish} anchor={{ x: 0.5, y: 1 }}>
            <View className="items-center">
              <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary"><Ionicons name="flag" size={14} color="#fff" /></View>
            </View>
          </Marker>
        )}

        {hazards.map((h) => (
          <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} pinColor={colors.warning}
            onPress={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }} />
        ))}

        {/* Directional puck (points up = your heading, since the camera is heading-up) */}
        {phase === "navigating" && pos && (
          <Marker coordinate={{ latitude: pos.lat, longitude: pos.lng }} anchor={{ x: 0.5, y: 0.5 }} flat>
            <View className="h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-accent" style={{ shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4 }}>
              <Ionicons name="caret-up" size={16} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ---------- PREVIEW ---------- */}
      {phase === "preview" && route && (
        <View className="absolute bottom-0 left-0 right-0 gap-3 rounded-t-3xl bg-card px-4 pt-4" style={{ paddingBottom: insets.bottom + 16, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } }}>
          <Text className="text-[18px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>{route.name}</Text>
          <View className="flex-row items-center gap-5">
            <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Distance</Text><Text className="text-[15px] font-semibold text-primary">{route.distance_km?.toFixed(1)} km</Text></View>
            <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Time</Text><Text className="text-[15px] font-semibold text-primary">{route.estimated_minutes} min</Text></View>
            <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Difficulty</Text><View className="mt-1"><DifficultyPips level={route.difficulty} /></View></View>
            {isLoop && <View className="flex-1 items-end"><Text className="text-[11px] font-semibold text-slate-400">Loop · start = finish</Text></View>}
          </View>
          <Pressable onPress={startNavigation} className="mt-1 min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-accent active:bg-accent-pressed">
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text className="text-[16px] font-semibold text-white">Start</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} className="min-h-[44px] items-center justify-center">
            <Text className="text-[13px] font-semibold text-slate-500">Back</Text>
          </Pressable>
        </View>
      )}

      {/* ---------- NAVIGATING ---------- */}
      {phase === "navigating" && (
        <>
          <View className="absolute left-3 right-3" style={{ top: insets.top + 6 }}>
            <View className="overflow-hidden rounded-2xl bg-primary" style={{ shadowColor: "#0F172A", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
              <View className="flex-row items-center gap-3 px-4 py-3.5">
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-accent">
                  <Ionicons name={maneuverIcon(current)} size={26} color="#fff" />
                </View>
                <View className="flex-1">
                  {distanceM !== null && <Text className="text-[13px] font-semibold text-emerald-300">{formatDistance(distanceM)}</Text>}
                  <Text className="text-[17px] font-semibold leading-[21px] text-white" numberOfLines={2}>
                    {current?.instruction ?? "Follow the green route"}
                  </Text>
                </View>
              </View>
              {next && (
                <View className="flex-row items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-2">
                  <Ionicons name={maneuverIcon(next)} size={14} color="#94A3B8" />
                  <Text className="flex-1 text-[12px] text-slate-300" numberOfLines={1}>then {next.instruction}</Text>
                </View>
              )}
            </View>
          </View>

          <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12, shadowColor: "#0F172A", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}>
            <View className="flex-1">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Remaining</Text>
              <Text className="text-[18px] font-semibold text-primary">{remaining === null ? "—" : formatDistance(remaining)}</Text>
            </View>
            <Pressable onPress={() => { stopWatching(); router.back(); }} className="min-h-[44px] items-center justify-center rounded-full bg-danger px-7">
              <Text className="text-[14px] font-semibold text-white">Stop</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ---------- FINISHED ---------- */}
      {phase === "finished" && (
        <View className="absolute inset-0 items-center justify-center bg-primary/70 px-8">
          <View className="w-full items-center gap-2 rounded-3xl bg-card px-6 py-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Ionicons name="checkmark" size={34} color="#fff" /></View>
            <Text className="text-[20px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>Route complete</Text>
            <Text className="text-[13px] text-slate-500">You navigated {route?.distance_km?.toFixed(1)} km of {route?.name}.</Text>
            <Pressable onPress={() => router.back()} className="mt-3 min-h-[48px] w-full items-center justify-center rounded-full bg-accent active:bg-accent-pressed">
              <Text className="text-[15px] font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      )}

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
