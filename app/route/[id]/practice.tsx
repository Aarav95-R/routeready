import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Mapbox, { BackgroundLayer, Camera, FillLayer, LineLayer, MapView, MarkerView, PointAnnotation, ShapeSource } from "@rnmapbox/maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { fetchDirections, Directions } from "@/services/directions";
import { advance, ANNOUNCE_M, formatDistance, navZoom, NAV_ZOOM_FAR, NAV_ZOOM_MID, remainingM, trailIndex } from "@/lib/navigation";
import { bearingDeg, haversineM, LatLng, mpsToMph, smoothHeading, snapToPath, turnAngleDeg } from "@/lib/geo";
import type { Hazard, NavStep, Route } from "@/types/db";
import { DifficultyPips } from "@/ui/DifficultyPips";
import { colors } from "@/ui/theme";
import { lineWidthExpression, mapColors, ROAD_OUTLINE_PX, roadWidths } from "@/ui/mapStyle";
import { NavPuck, PUCK_SIZE } from "@/ui/NavPuck";

const NAV_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const NAV_PITCH = 55;
const AT_START_M = 60;
const ARRIVE_M = 30;
const SNAP_MAX_M = 40;          // beyond this we assume you've left the route
const SNAP_WINDOW = 30;         // vertices searched either side of the current index
const ROAD_BEARING_MIN_MPH = 3; // below this a vehicle has no meaningful course
const HEADING_ALPHA = 0.15;
const HEADING_DEADBAND_DEG = 3;
const CAM_TICK_MS = 250;        // at most 4 camera updates a second
const CAM_ANIM_MS = 300;        // slightly longer than the tick, so moves blend
const PUCK_SCREEN_FRACTION = 0.62; // how far down the screen the driver sits
const PAN_THRESHOLD_PX = 10;    // finger movement beyond this counts as a pan, not a tap

type Phase = "preview" | "approach" | "route" | "finished";
type Lng = [number, number];
const toPos = (c: LatLng): Lng => [c.lng, c.lat];
const lineFeature = (coords: LatLng[]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: coords.map(toPos) },
});

// lineWidthExpression returns unknown[] (see src/ui/mapStyle.ts); LineLayer's
// style prop wants a narrower Mapbox Expression tuple — narrow it once here.
const lineWidth = (stops: Parameters<typeof lineWidthExpression>[0]) => lineWidthExpression(stops) as any;

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
  const headingRef = useRef(0);
  const prevPosRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const cameraRef = useRef<Camera>(null);
  const smoothHeadingRef = useRef(0);
  const headingSeededRef = useRef(false); // first fix of a leg snaps straight to target, no ease-in
  const zoomRef = useRef(NAV_ZOOM_MID);
  const lastCamRef = useRef(0);
  const mapHeightRef = useRef(0);
  const followingRef = useRef(true);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { followingRef.current = following; }, [following]);

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

  const fitPreview = useCallback(() => {
    if (routeLL.length < 2) return;
    const lats = routeLL.map((c) => c.lat);
    const lngs = routeLL.map((c) => c.lng);
    cameraRef.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      [100, 60, 300, 60],
      600
    );
  }, [routeLL]);

  useEffect(() => { if (phase === "preview") fitPreview(); }, [phase, fitPreview]);

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
    headingSeededRef.current = false;
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

  // Drive the camera by hand. followUserLocation would centre on the raw GPS
  // fix and rotate to the raw compass, both of which are exactly what we are
  // trying to filter out, and neither is reachable from JS.
  const pushCamera = useCallback((centre: LatLng, heading: number, zoom: number, force = false) => {
    if (!followingRef.current) return;
    const now = Date.now();
    if (!force && now - lastCamRef.current < CAM_TICK_MS) return;
    lastCamRef.current = now;

    // Padding shifts the camera centre down the screen so more road is visible
    // ahead: centreFraction = 0.5 + paddingTop / (2 * height).
    const paddingTop = mapHeightRef.current * (PUCK_SCREEN_FRACTION - 0.5) * 2;

    cameraRef.current?.setCamera({
      centerCoordinate: [centre.lng, centre.lat],
      heading,
      zoomLevel: zoom,
      pitch: NAV_PITCH,
      padding: { paddingTop, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
      animationDuration: force ? 500 : CAM_ANIM_MS,
      animationMode: "easeTo",
    });
  }, []);

  // Re-lock the camera onto the driver after they've panned the map.
  const recenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    followingRef.current = true;
    setFollowing(true);
    if (pos) pushCamera(pos, smoothHeadingRef.current, zoomRef.current, true);
  };

  const onPosition = useCallback((c: Location.LocationObjectCoords) => {
    const raw = { lat: c.latitude, lng: c.longitude };
    const mph = Math.round(mpsToMph(Math.max(0, c.speed ?? 0)));
    setSpeedMph(mph);

    const ph = phaseRef.current;
    const start = startRef.current;
    const coords = ph === "route" ? routeLLRef.current : approachRef.current?.coords ?? [];

    // Snap onto the active polyline. Raw GPS wanders 5-15 m, which drifts the
    // puck through gardens; the route is already in memory, so no API call.
    const snap = snapToPath(coords, raw, trailRef.current, SNAP_WINDOW);
    const onRoute = !!snap && snap.distM <= SNAP_MAX_M;
    const p = onRoute ? snap!.point : raw;
    setPos(p);

    // The snap gives us the road bearing for free — pointing down the road
    // removes most of the wobble a hand-held compass introduces.
    const target = onRoute && mph >= ROAD_BEARING_MIN_MPH ? snap!.bearing : headingRef.current;
    if (!headingSeededRef.current) {
      // First fix of a leg: jump straight to the target rather than easing
      // 15% of the way there, which would otherwise leave the camera facing
      // up to ~180 degrees wrong for a couple of dozen fixes.
      smoothHeadingRef.current = target;
      headingSeededRef.current = true;
    } else if (Math.abs(turnAngleDeg(smoothHeadingRef.current, target)) >= HEADING_DEADBAND_DEG) {
      // Deadband: sub-3-degree wiggle never reaches the camera at all.
      smoothHeadingRef.current = smoothHeading(smoothHeadingRef.current, target, HEADING_ALPHA);
    }

    if (ph === "approach" && fallbackRef.current && start) {
      const d = haversineM(p, start);
      setDirectDist(Math.round(d));
      setCrowRot(bearingDeg(p, start) - headingRef.current);
      zoomRef.current = NAV_ZOOM_FAR;
      pushCamera(p, smoothHeadingRef.current, NAV_ZOOM_FAR);
      if (d <= ARRIVE_M) beginRoute();
      return;
    }

    const steps = ph === "route" ? routeStepsRef.current : approachRef.current?.steps ?? [];
    if (!steps.length) return;

    const st = advance(steps, p, indexRef.current);
    indexRef.current = st.index;
    setStepIndex(st.index);
    setDistanceM(st.distanceToManeuverM);
    setRemaining(remainingM(steps, p, st.index));
    const ti = onRoute ? Math.max(trailRef.current, snap!.idx) : trailIndex(coords, p, trailRef.current);
    trailRef.current = ti;
    setTrailIdx(ti);

    zoomRef.current = navZoom(st.distanceToManeuverM, zoomRef.current);
    pushCamera(p, smoothHeadingRef.current, zoomRef.current);

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
      if (ph === "approach") beginRoute();
      else {
        stopWatching();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        phaseRef.current = "finished";
        setPhase("finished");
      }
    }
  }, [beginRoute, stopWatching, pushCamera]);

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
    // Compass heading — updates as the phone turns, even when standing still,
    // so the follow camera rotates with the driver (not only when moving).
    headingSubRef.current = await Location.watchHeadingAsync((h) => {
      const hd = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (hd != null && hd >= 0) headingRef.current = hd;
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

  const activeLL = phase === "approach" && approach ? approach.coords : routeLL;
  const traveled = activeLL.slice(0, Math.max(trailIdx, 1) + 1);
  const ahead = activeLL.slice(trailIdx);
  const isApproach = phase === "approach";
  const current = (isApproach ? approach?.steps : routeSteps)?.[stepIndex];
  const next = (isApproach ? approach?.steps : routeSteps)?.[stepIndex + 1];
  const aheadCore = isApproach ? "#94A3B8" : mapColors.routeCore;
  const aheadCasing = isApproach ? "#64748B" : mapColors.routeCasing;

  return (
    <View className="flex-1">
      <MapView
        style={{ flex: 1 }} styleURL={NAV_STYLE} scaleBarEnabled={false} compassEnabled={false}
        logoPosition={{ bottom: 92, left: 8 }} attributionPosition={{ bottom: 92, right: 8 }}
        onDidFinishLoadingMap={() => { if (phaseRef.current === "preview") fitPreview(); }}
        onLayout={(e) => { mapHeightRef.current = e.nativeEvent.layout.height; }}
        onTouchStart={(e) => {
          const t = e.nativeEvent.touches[0];
          touchStartRef.current = t ? { x: t.pageX, y: t.pageY } : null;
        }}
        onTouchMove={(e) => {
          // A tap (e.g. opening a hazard callout, or the puck itself) fires
          // touchStart/End with no real movement; only a genuine drag should
          // cancel follow. Anything under the threshold is left alone.
          if (phaseRef.current === "preview") return;
          const start = touchStartRef.current;
          const t = e.nativeEvent.touches[0];
          if (!start || !t) return;
          const moved = Math.hypot(t.pageX - start.x, t.pageY - start.y);
          if (moved > PAN_THRESHOLD_PX) setFollowing(false);
        }}
      >
        <Camera ref={cameraRef} />

        {/* Waze-style base: wide white roads on warm off-white land, with parks
            and water carrying the only other colour. Applied as overrides on the
            loaded style's own layers rather than a fork of the whole style.
            Ids are navigation-day-v1's real ones (verified against the style
            JSON) — the background layer is called "land", not "background",
            and every road layer carries a "-navigation" suffix plus, for
            motorway casing and street fill, an extra low-zoom variant. */}
        <BackgroundLayer id="land" existing style={{ backgroundColor: mapColors.land }} />
        <FillLayer id="landuse" existing style={{ fillColor: mapColors.park }} />
        <FillLayer id="water" existing style={{ fillColor: mapColors.water }} />
        <FillLayer id="building" existing style={{ fillColor: mapColors.building }} />

        {/* Casings: on this style a "-case" layer draws an outline either side
            of a hole, so lineGapWidth carries the fill's width table and
            lineWidth is only the outline. The gap must track its fill layer's
            width expression exactly or the outline stops sitting flush. */}
        <LineLayer id="road-motorway-trunk-case-navigation" existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths.motorway), lineWidth: ROAD_OUTLINE_PX }} />
        <LineLayer id="road-motorway-trunk-case-low-navigation" existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths.motorway), lineWidth: ROAD_OUTLINE_PX }} />
        <LineLayer id="road-motorway-trunk-navigation" existing style={{ lineColor: mapColors.motorwayFill, lineWidth: lineWidth(roadWidths.motorway) }} />
        <LineLayer id="road-primary-case-navigation" existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths.primary), lineWidth: ROAD_OUTLINE_PX }} />
        <LineLayer id="road-primary-navigation" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidth(roadWidths.primary) }} />
        <LineLayer id="road-secondary-tertiary-case-navigation" existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths.primary), lineWidth: ROAD_OUTLINE_PX }} />
        <LineLayer id="road-secondary-tertiary-navigation" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidth(roadWidths.primary) }} />
        <LineLayer id="road-street-case-navigation" existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths.residential), lineWidth: ROAD_OUTLINE_PX }} />
        <LineLayer id="road-street-navigation" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidth(roadWidths.residential) }} />
        <LineLayer id="road-street-low-navigation" existing style={{ lineColor: mapColors.roadFill, lineWidth: lineWidth(roadWidths.residential) }} />

        {/* Slip roads carry the motorway's sand fill in this style, not the
            grey-blue of the minor roads; they are sized as residential because
            stock draws them exactly as wide as a street. */}
        <LineLayer id="road-major-link-case-navigation" existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths.residential), lineWidth: ROAD_OUTLINE_PX }} />
        <LineLayer id="road-major-link-navigation" existing style={{ lineColor: mapColors.motorwayFill, lineWidth: lineWidth(roadWidths.residential) }} />

        {/* Service roads, tracks and minor links: recoloured to the palette
            (they otherwise keep the base style's blue-grey), but left at their
            stock widths. Widening a car-park aisle to street width would make
            it read as a road the driver could be asked to turn into. Leaving
            both width and gap untouched keeps the outline flush automatically. */}
        <LineLayer id="road-minor-case-navigation" existing style={{ lineColor: mapColors.roadCasing }} />
        <LineLayer id="road-minor-navigation" existing style={{ lineColor: mapColors.roadFill }} />

        {/* Live traffic. navigation-day-v1 ships congestion ribbons that
            light-v11 did not; the spec puts traffic out of scope, and their
            "low" green (hsl(120,70%,60%)) would outshine the emerald route.
            Their line-offset is also interpolated against stock road widths,
            so with the fills rewritten above they no longer sit on the road.
            Ids enumerated from the style JSON: every line layer on the
            "traffic" source-layer. */}
        <LineLayer id="traffic-tunnel-link-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-tunnel-minor-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-tunnel-street-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-tunnel-secondary-tertiary-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-tunnel-primary-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-tunnel-major-link-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-tunnel-motorway-trunk-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-link-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-minor-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-street-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-secondary-tertiary-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-primary-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-major-link-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-motorway-trunk-case-navigation" existing style={{ lineOpacity: 0 }} />
        <LineLayer id="traffic-bridge-road-motorway-trunk-navigation" existing style={{ lineOpacity: 0 }} />

        {phase === "preview" ? (
          routeLL.length > 1 && (
            <ShapeSource id="route" shape={lineFeature(routeLL)}>
              <LineLayer id="routeCasing" style={{ lineColor: mapColors.routeCasing, lineWidth: 15, lineCap: "round", lineJoin: "round" }} />
              <LineLayer id="routeCore" style={{ lineColor: mapColors.routeCore, lineWidth: 10, lineCap: "round", lineJoin: "round" }} />
            </ShapeSource>
          )
        ) : (
          <>
            {traveled.length > 1 && (
              <ShapeSource id="trail" shape={lineFeature(traveled)}>
                <LineLayer id="trailCasing" style={{ lineColor: mapColors.routeCasing, lineWidth: 15, lineCap: "round", lineJoin: "round" }} />
                <LineLayer id="trailCore" style={{ lineColor: mapColors.routeCore, lineWidth: 10, lineCap: "round", lineJoin: "round" }} />
              </ShapeSource>
            )}
            {ahead.length > 1 && (
              <ShapeSource id="ahead" shape={lineFeature(ahead)}>
                <LineLayer id="aheadCasing" style={{ lineColor: aheadCasing, lineWidth: 16, lineCap: "round", lineJoin: "round" }} />
                <LineLayer id="aheadCore" style={{ lineColor: aheadCore, lineWidth: 11, lineCap: "round", lineJoin: "round" }} />
              </ShapeSource>
            )}
          </>
        )}

        {start && (
          <MarkerView id="start" coordinate={toPos(start)} anchor={{ x: 0.5, y: 0.5 }}>
            <View className="h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-accent"><View className="h-2 w-2 rounded-full bg-white" /></View>
          </MarkerView>
        )}
        {finish && !isLoop && (
          <MarkerView id="finish" coordinate={toPos(finish)} anchor={{ x: 0.5, y: 1 }}>
            <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary"><Ionicons name="flag" size={14} color="#fff" /></View>
          </MarkerView>
        )}
        {hazards.map((h) => (
          <PointAnnotation key={h.id} id={h.id} coordinate={[h.lng, h.lat]} onSelected={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }}>
            <View className="h-4 w-4 rounded-full border-2 border-white bg-warning" />
          </PointAnnotation>
        ))}
        {(phase === "approach" || phase === "route") && pos && (
          <MarkerView id="puck" coordinate={toPos(pos)} anchor={{ x: 0.5, y: 0.5 }} style={{ width: PUCK_SIZE, height: PUCK_SIZE }}>
            {/* A pan only translates the camera centre, it never resets bearing —
                the map is left rotated to whatever setCamera last applied, whether
                following or not. So the puck stays heading-up either way. */}
            <NavPuck rotation={0} />
          </MarkerView>
        )}
      </MapView>

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
