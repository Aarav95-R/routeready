import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PointAnnotation } from "@rnmapbox/maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { fetchDirections, Directions } from "@/services/directions";
import { advance, ANNOUNCE_M, formatDistance, NAV_ZOOM_FAR, NAV_ZOOM_MID, remainingM } from "@/lib/navigation";
import { bearingDeg, haversineM, iconRotationDeg, LatLng, mpsToMph, smoothHeading } from "@/lib/geo";
import { navFix, navSnap } from "@/lib/navmap";
import type { Hazard, NavStep, Route } from "@/types/db";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { colors } from "@/ui/theme";
import { NavMap, NavMapHandle } from "@/ui/NavMap";

const AT_START_M = 60;
const ARRIVE_M = 30;
// Two rotations, two sources. The MAP turns only when the vehicle travels in a
// new direction, so it holds still at a red light however the phone is waved
// about. The ICON turns with the compass, drawn at its angle relative to the
// map — mounted facing forward the two agree and it sits upright by itself.
// The map's half of this (snap, heading filter, deadband) lives in navFix
// (src/lib/navmap.ts); COMPASS_ALPHA below is the icon's own, lighter filter.
const COMPASS_ALPHA = 0.35;     // icon: lighter, so twisting the phone reads as immediate
const ICON_TICK_MS = 66;        // ~15 icon updates a second; the compass fires far faster

type Phase = "preview" | "approach" | "route" | "finished";

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
  const [approach, setApproach] = useState<Directions | null>(null);
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewLoc, setPreviewLoc] = useState<LatLng | null>(null);

  const [pos, setPos] = useState<LatLng | null>(null);
  const [stepIndex, setStepIndex] = useState(1);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [trailIdx, setTrailIdx] = useState(0);
  const [speedMph, setSpeedMph] = useState(0);
  const [directDist, setDirectDist] = useState<number | null>(null);
  const [crowRot, setCrowRot] = useState(0);
  const [following, setFollowing] = useState(true);
  // Degrees to draw the user icon at, measured against the rotated map rather
  // than against north. Held in state, not a ref, because the compass has to
  // be able to redraw it between GPS fixes.
  const [iconRotation, setIconRotation] = useState(0);

  const phaseRef = useRef<Phase>("preview");
  const approachRef = useRef<Directions | null>(null);
  const fallbackRef = useRef(false);
  const routeLLRef = useRef<LatLng[]>([]);
  const routeStepsRef = useRef<NavStep[]>([]);
  const startRef = useRef<LatLng | null>(null);
  const indexRef = useRef(1);
  const trailRef = useRef(0);
  const preparedRef = useRef(new Set<number>());
  const executedRef = useRef(new Set<number>());
  const prevPosRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const mapRef = useRef<NavMapHandle>(null);
  const mapBearingRef = useRef(0);     // what the map is rotated to: travel direction only
  const compassRef = useRef(0);        // smoothed compass, drives the icon
  const compassSeededRef = useRef(false);
  const lastIconRef = useRef(0);
  const mapBearingSeededRef = useRef(false); // first fix of a leg snaps straight to target, no ease-in
  const zoomRef = useRef(NAV_ZOOM_MID);

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const routeLL = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    [route]
  );
  const routeSteps = useMemo(() => route?.steps ?? [], [route]);
  const isLoop = useMemo(
    () => routeLL.length > 1 && haversineM(routeLL[0], routeLL[routeLL.length - 1]) < 30,
    [routeLL]
  );

  useEffect(() => {
    routeLLRef.current = routeLL;
    routeStepsRef.current = routeSteps;
    startRef.current = routeLL[0] ?? null;
  }, [routeLL, routeSteps]);

  useEffect(() => {
    if (!routeLL.length) return;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      const p = await Location.getLastKnownPositionAsync();
      if (p) setPreviewLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
    })();
  }, [routeLL.length]);

  // routeLL is a dependency because it arrives after the first render: the
  // fit is a no-op until there is a route to frame.
  useEffect(() => { if (phase === "preview") mapRef.current?.fitBounds(); }, [phase, routeLL]);

  const stopWatching = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    headingSubRef.current?.remove();
    headingSubRef.current = null;
    Speech.stop();
  }, []);
  useEffect(() => stopWatching, [stopWatching]);

  const resetLeg = (startIndex: number) => {
    indexRef.current = startIndex;
    trailRef.current = 0;
    preparedRef.current = new Set();
    executedRef.current = new Set();
    setStepIndex(startIndex);
    setTrailIdx(0);
    setDistanceM(null);
    // A new leg means a new active polyline (approach vs. route), which can
    // carry an unrelated bearing — re-seed rather than ease from the old one.
    mapBearingSeededRef.current = false;
  };

  const beginRoute = useCallback(() => {
    phaseRef.current = "route";
    fallbackRef.current = false;
    setPhase("route");
    setFallback(false);
    resetLeg(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Speech.speak("You've reached the start. Beginning the route.", { language: "en-GB" });
  }, []);

  // Re-lock the camera onto the driver after they've panned the map.
  const recenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.recenter();
  };

  const onPosition = useCallback((c: Location.LocationObjectCoords) => {
    const raw = { lat: c.latitude, lng: c.longitude };
    const mph = Math.round(mpsToMph(Math.max(0, c.speed ?? 0)));
    setSpeedMph(mph);

    const ph = phaseRef.current;
    const start = startRef.current;
    const coords = ph === "route" ? routeLLRef.current : approachRef.current?.coords ?? [];
    const steps = ph === "route" ? routeStepsRef.current : approachRef.current?.steps ?? [];
    const isFallback = ph === "approach" && fallbackRef.current && !!start;
    const seeded = mapBearingSeededRef.current;

    const fixInput = {
      mph,
      gpsCourse: c.heading ?? null,
      mapBearing: mapBearingRef.current,
      compass: compassRef.current,
      bearingSeeded: seeded,
      zoom: zoomRef.current,
    };

    // The snap is computed once, here — navZoom needs the distance to the
    // next manoeuvre, and that distance needs the snapped position, so the
    // snap has to exist before navFix can be called at all.
    const snap = navSnap(coords, raw, trailRef.current);
    const needsDistance = !isFallback && steps.length > 0;
    let st: ReturnType<typeof advance> | null = null;
    let distanceToManeuverM: number | null = null;
    if (needsDistance) {
      st = advance(steps, snap.pos, indexRef.current);
      distanceToManeuverM = st.distanceToManeuverM;
    }

    const result = navFix({ ...fixInput, distanceToManeuverM, snap });
    const p = result.pos;
    setPos(p);
    mapBearingRef.current = result.mapBearing;
    mapBearingSeededRef.current = true;
    // The icon's angle is relative to the map, so a map that turned changes it
    // even when the phone did not move.
    setIconRotation(result.iconRotation);

    if (isFallback) {
      const d = haversineM(p, start!);
      setDirectDist(Math.round(d));
      // Screen-space overlay, so subtract the bearing the map is actually
      // rotated to — the map bearing the camera is given below, not the raw
      // compass, which runs tens of degrees ahead of it through a turn. This
      // arrow is the only navigation aid the fallback path has.
      setCrowRot(bearingDeg(p, start!) - mapBearingRef.current);
      zoomRef.current = NAV_ZOOM_FAR;
      mapRef.current?.pushCamera(p, mapBearingRef.current, NAV_ZOOM_FAR);
      if (d <= ARRIVE_M) beginRoute();
      return;
    }

    if (!steps.length) {
      // A leg can legitimately arrive with no steps (routes.steps defaults to
      // '[]' in the schema, and an approach fetch can come back with none).
      // Skip only the step-dependent work: the camera still has to follow, or
      // the driver watches their puck walk off a frozen map.
      mapRef.current?.pushCamera(p, mapBearingRef.current, zoomRef.current);
      return;
    }

    indexRef.current = st!.index;
    setStepIndex(st!.index);
    setDistanceM(st!.distanceToManeuverM);
    setRemaining(remainingM(steps, p, st!.index));
    trailRef.current = result.trailIdx;
    setTrailIdx(result.trailIdx);

    zoomRef.current = result.zoom;
    mapRef.current?.pushCamera(p, mapBearingRef.current, zoomRef.current);

    const cur = steps[st!.index];
    if (cur && cur.type !== "depart") {
      const d = st!.distanceToManeuverM;
      if (d <= ANNOUNCE_M && d > 40 && !preparedRef.current.has(st!.index)) {
        preparedRef.current.add(st!.index);
        Speech.speak(`In ${formatDistance(d)}, ${cur.instruction}`, { language: "en-GB" });
      }
      if (d <= 40 && !executedRef.current.has(st!.index)) {
        executedRef.current.add(st!.index);
        Speech.speak(cur.instruction, { language: "en-GB" });
      }
    }

    if (st!.arrived) {
      if (ph === "approach") beginRoute();
      else {
        stopWatching();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        phaseRef.current = "finished";
        setPhase("finished");
      }
    }
  }, [beginRoute, stopWatching]);

  const zoomToMe = async () => {
    try {
      const f = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const p = { lat: f.coords.latitude, lng: f.coords.longitude };
      prevPosRef.current = p;
      setPos(p);
      return p;
    } catch { return null; }
  };

  const startWatch = async () => {
    // The compass drives the icon, and only the icon. It fires as the phone
    // turns, including standing still, which is the whole point: the map is
    // pinned to the direction of travel and cannot answer a phone being
    // turned on the spot.
    headingSubRef.current = await Location.watchHeadingAsync((h) => {
      const hd = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (hd == null || hd < 0) return;
      compassRef.current = compassSeededRef.current
        ? smoothHeading(compassRef.current, hd, COMPASS_ALPHA)
        : hd;
      compassSeededRef.current = true;

      // The sensor fires far faster than anything needs to be redrawn, and
      // each of these re-renders the screen.
      const now = Date.now();
      if (now - lastIconRef.current < ICON_TICK_MS) return;
      lastIconRef.current = now;
      setIconRotation(iconRotationDeg(mapBearingRef.current, compassRef.current));
    });
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 1, timeInterval: 500 },
      (loc) => onPosition(loc.coords)
    );
  };

  const ensurePermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setPermissionDenied(true); return false; }
    return true;
  };

  const startDirectly = useCallback(async () => {
    if (!(await ensurePermission())) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    phaseRef.current = "route"; setPhase("route");
    resetLeg(1);
    await zoomToMe();
    await startWatch();
  }, [onPosition]);

  const guideToStart = useCallback(async () => {
    if (!(await ensurePermission())) return;
    setBusy(true);
    const me = await zoomToMe();
    const start = startRef.current;
    try {
      if (!me || !start) throw new Error("no fix");
      const dirs = await fetchDirections(me, start);
      approachRef.current = dirs; setApproach(dirs);
      fallbackRef.current = false; setFallback(false);
    } catch {
      approachRef.current = null; setApproach(null);
      fallbackRef.current = true; setFallback(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    phaseRef.current = "approach"; setPhase("approach");
    resetLeg(1);
    setBusy(false);
    await startWatch();
  }, [onPosition]);

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-8">
        <Text className="text-center text-[15px] font-semibold text-primary">Location access is needed to guide you along the route.</Text>
        <Text className="text-center text-[12px] text-slate-500">Enable it in Settings → Privacy → Location Services.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 min-h-[44px] items-center justify-center rounded-full border-[1.5px] border-slate-200 px-6">
          <Text className="text-[14px] font-semibold text-primary">Back</Text>
        </Pressable>
      </View>
    );
  }

  const start = routeLL[0];
  const finish = routeLL[routeLL.length - 1];
  const distToStart = previewLoc && start ? haversineM(previewLoc, start) : null;
  const atStart = distToStart !== null && distToStart < AT_START_M;

  // One rule on both legs, including the drive to the start: green is road
  // still to drive, grey is road already driven. The approach used to be muted
  // end to end to say "this is not the test yet", but grey cannot mean both
  // that and "done" at once — and the banner says "Heading to the start"
  // throughout anyway.
  const activeLL = phase === "approach" && approach ? approach.coords : routeLL;
  const isApproach = phase === "approach";
  const current = (isApproach ? approach?.steps : routeSteps)?.[stepIndex];
  const next = (isApproach ? approach?.steps : routeSteps)?.[stepIndex + 1];

  return (
    <View className="flex-1">
      <NavMap
        ref={mapRef}
        routeLL={activeLL}
        trailIdx={trailIdx}
        // The puck is the driver on the leg being driven: none while the route
        // is being previewed, and none once it has been finished.
        pos={phase === "approach" || phase === "route" ? pos : null}
        iconRotation={iconRotation}
        follow={following}
        onFollowChange={setFollowing}
        preview={phase === "preview"}
        start={start ?? null}
        // A loop finishes where it starts, so the flag would land on the start
        // dot and hide it.
        finish={finish && !isLoop ? finish : null}
      >
        {hazards.map((h) => (
          <PointAnnotation key={h.id} id={h.id} coordinate={[h.lng, h.lat]} onSelected={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }}>
            <View className="h-4 w-4 rounded-full border-2 border-white bg-warning" />
          </PointAnnotation>
        ))}
      </NavMap>

      {/* ---------- PREVIEW ---------- */}
      {phase === "preview" && route && (
        <View className="absolute bottom-0 left-0 right-0 gap-2.5 rounded-t-3xl bg-card px-4 pt-4" style={{ paddingBottom: insets.bottom + 14, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } }}>
          <Text className="text-[18px] font-semibold tracking-tight text-primary" style={{ fontFamily: "Inter_600SemiBold" }}>{route.name}</Text>
          <View className="flex-row items-center gap-5">
            <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Distance</Text><Text className="text-[15px] font-semibold text-primary">{route.distance_km?.toFixed(1)} km</Text></View>
            <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Time</Text><Text className="text-[15px] font-semibold text-primary">{route.estimated_minutes} min</Text></View>
            <View><Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Difficulty</Text><View className="mt-1"><DifficultyPips level={route.difficulty} /></View></View>
            {isLoop && <View className="flex-1 items-end"><Text className="text-[11px] font-semibold text-slate-400">Loop · start = finish</Text></View>}
          </View>

          {atStart ? (
            <Pressable disabled={busy} onPress={startDirectly} className="mt-1 min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-accent active:bg-accent-pressed">
              <Ionicons name="navigate" size={18} color="#fff" /><Text className="text-[16px] font-semibold text-white">Start</Text>
            </Pressable>
          ) : (
            <>
              <View className="mt-0.5 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-2.5">
                <Ionicons name="location-outline" size={15} color={colors.accent} />
                <Text className="text-[12px] font-semibold text-slate-600">
                  {distToStart !== null ? `You're ${formatDistance(distToStart)} from the start` : "You're away from the start point"}
                </Text>
              </View>
              <Pressable disabled={busy} onPress={guideToStart} className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-full bg-accent active:bg-accent-pressed">
                <Ionicons name="navigate" size={18} color="#fff" /><Text className="text-[16px] font-semibold text-white">{busy ? "Finding route…" : "Guide me to the start"}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={startDirectly} className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-slate-200 bg-card">
                <Ionicons name="arrow-forward" size={17} color={colors.primary} /><Text className="text-[15px] font-semibold text-primary">Start directly from here</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={() => router.back()} className="min-h-[40px] items-center justify-center"><Text className="text-[13px] font-semibold text-slate-500">Back</Text></Pressable>
        </View>
      )}

      {/* ---------- APPROACH FALLBACK ---------- */}
      {phase === "approach" && fallback && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ transform: [{ rotate: `${crowRot}deg` }] }}>
            <Ionicons name="navigate" size={96} color="rgba(5,150,105,0.85)" />
          </View>
        </View>
      )}

      {/* ---------- APPROACH / ROUTE ---------- */}
      {(phase === "approach" || phase === "route") && (
        <>
          <View className="absolute left-3 right-3" style={{ top: insets.top + 6 }}>
            <View className="overflow-hidden rounded-2xl bg-primary" style={{ shadowColor: "#0F172A", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
              {isApproach && (
                <View className="flex-row items-center gap-1.5 px-4 py-1.5" style={{ backgroundColor: "#064E3B" }}>
                  <Ionicons name="flag-outline" size={12} color="#6EE7B7" />
                  <Text className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">Heading to the start</Text>
                </View>
              )}
              <View className="flex-row items-center gap-3 px-4 py-3.5">
                <View className={`h-12 w-12 items-center justify-center rounded-xl ${fallback ? "bg-slate-600" : "bg-accent"}`}>
                  <Ionicons name={fallback ? "navigate" : maneuverIcon(current)} size={26} color="#fff" />
                </View>
                <View className="flex-1">
                  {fallback
                    ? directDist !== null && <Text className="text-[13px] font-semibold text-emerald-300">{formatDistance(directDist)}</Text>
                    : distanceM !== null && <Text className="text-[13px] font-semibold text-emerald-300">{formatDistance(distanceM)}</Text>}
                  <Text className="text-[17px] font-semibold leading-[21px] text-white" numberOfLines={2}>
                    {fallback ? "Head toward the start point" : current?.instruction ?? "Follow the route"}
                  </Text>
                </View>
              </View>
              {!fallback && next && (
                <View className="flex-row items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-2">
                  <Ionicons name={maneuverIcon(next)} size={14} color="#94A3B8" />
                  <Text className="flex-1 text-[12px] text-slate-300" numberOfLines={1}>
                    {isApproach && next.type === "arrive" ? "then the route begins" : `then ${next.instruction}`}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {phase === "route" && (
            <View className="absolute left-4 items-center rounded-2xl bg-card px-3 py-2" style={{ bottom: 100, shadowColor: "#0F172A", shadowOpacity: 0.15, shadowRadius: 8 }}>
              <Text className="text-[20px] font-bold leading-5 text-primary" style={{ fontVariant: ["tabular-nums"] }}>{speedMph}</Text>
              <Text className="text-[8px] font-bold tracking-wider text-slate-500">MPH</Text>
            </View>
          )}

          <Pressable onPress={recenter} className="absolute right-4 h-12 w-12 items-center justify-center rounded-full bg-card" style={{ bottom: 100, shadowColor: "#0F172A", shadowOpacity: 0.18, shadowRadius: 8 }}>
            <Ionicons name="navigate" size={20} color={colors.accent} />
          </Pressable>

          <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12, shadowColor: "#0F172A", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}>
            <View className="flex-1">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{isApproach ? "To the start" : "Remaining"}</Text>
              <Text className="text-[18px] font-semibold text-primary">
                {isApproach && fallback ? (directDist === null ? "—" : formatDistance(directDist)) : (remaining === null ? "—" : formatDistance(remaining))}
              </Text>
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
