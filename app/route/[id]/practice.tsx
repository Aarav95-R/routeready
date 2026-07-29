import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { deriveInstructions, Instruction, nextInstruction } from "@/lib/instructions";
import type { Hazard, Route } from "@/types/db";
import { Button } from "@/ui/Button";
import { colors } from "@/ui/theme";

export default function Practice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [current, setCurrent] = useState<Instruction | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const spokenRef = useRef(new Set<number>());
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const coords = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [route]
  );
  const instructions = useMemo(
    () => (route ? deriveInstructions(route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))) : []),
    [route]
  );

  useEffect(() => {
    if (!instructions.length) return;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setPermissionDenied(true); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const ins = nextInstruction(p, instructions, spokenRef.current);
          if (ins) {
            spokenRef.current.add(ins.idx);
            setCurrent(ins);
            Speech.speak(ins.text, { language: "en-GB" });
          }
        }
      );
    })();
    return () => { sub?.remove(); Speech.stop(); };
  }, [instructions]);

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-8">
        <Text className="text-center text-[15px] font-semibold text-primary">Location access is needed to guide you along the route.</Text>
        <Text className="text-center text-[12px] text-slate-500">Enable it in Settings → Privacy → Location Services → Expo Go.</Text>
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        style={{ flex: 1 }} mapType="mutedStandard" showsUserLocation followsUserLocation
        initialRegion={coords[0] && { ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      >
        <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
        {hazards.map((h) => (
          <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} pinColor={colors.warning}
            onPress={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }} />
        ))}
      </MapView>

      <View className="absolute left-4 right-4 top-14 rounded-xl bg-card p-3 shadow-lg" style={{ shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12 }}>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-[10px] bg-primary">
            <Ionicons name="navigate" size={18} color="#fff" />
          </View>
          <Text className="flex-1 text-[13px] font-semibold text-primary">
            {current?.text ?? "Follow the green route — guidance starts as you approach the first turn"}
          </Text>
        </View>
      </View>

      <Pressable onPress={() => router.back()} className="absolute right-4 top-28 min-h-[44px] flex-row items-center gap-1.5 rounded-full bg-card px-3 py-2" style={{ shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 8 }}>
        <Ionicons name="close" size={14} color={colors.ink2} />
        <Text className="text-[11px] font-semibold text-primary">End practice</Text>
      </Pressable>

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
