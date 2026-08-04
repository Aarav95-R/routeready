import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { useMockTest } from "@/stores/mockTestStore";
import { EXAMINER_CATEGORIES, minorCountsByCategory, type MarkLevel } from "@/lib/examiner";
import { haversineM, iconRotationDeg, LatLng, mpsToMph, smoothHeading } from "@/lib/geo";
import { NAV_ZOOM_MID } from "@/lib/navigation";
import { navFix, navSnap } from "@/lib/navmap";
import { ExaminerSheet } from "@/ui/ExaminerSheet";
import { NavMap, NavMapHandle } from "@/ui/NavMap";
import { colors } from "@/ui/theme";

// Two rotations, two sources — the same split the practice screen uses. The MAP
// turns only when the vehicle travels in a new direction (handled inside
// navFix); the ICON turns with the compass, drawn at its angle relative to the
// map. COMPASS_ALPHA is the icon's own, lighter filter.
const COMPASS_ALPHA = 0.35;
const ICON_TICK_MS = 66;        // ~15 icon updates a second; the compass fires far faster

// The puck sits at 62% of screen height and the collapsed examiner sheet takes
// the bottom 12%. The controls row lives in the gap between them: high enough
// to clear the sheet, low enough not to sit under the vehicle.
const CONTROLS_BOTTOM = 150;
const SHEET_SNAP_POINTS = ["12%", "85%"];

// Only the label is needed here, and examiner.ts keeps its own lookup private.
const CATEGORY_LABEL = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c.label]));

export default function Mock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    phase, route, startedAt, activeZoneIdx, marks,
    start, onSample, tapMirrors, addMark, undoMark, warnings, finish,
  } = useMockTest();

  const [clock, setClock] = useState("0:00");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [trailIdx, setTrailIdx] = useState(0);
  const [following, setFollowing] = useState(true);
  // Degrees to draw the user icon at, measured against the rotated map rather
  // than against north. Held in state, not a ref, because the compass has to
  // be able to redraw it between GPS fixes.
  const [iconRotation, setIconRotation] = useState(0);

  const mapRef = useRef<NavMapHandle>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);
  const routeLLRef = useRef<LatLng[]>([]);
  const trailRef = useRef(0);
  const mapBearingRef = useRef(0);            // what the map is rotated to: travel direction only
  const mapBearingSeededRef = useRef(false);  // first fix snaps straight to target, no ease-in
  const compassRef = useRef(0);               // smoothed compass, drives the icon
  const compassSeededRef = useRef(false);
  const lastIconRef = useRef(0);
  const zoomRef = useRef(NAV_ZOOM_MID);
  // Where a mark gets stamped. The raw fix, like everything else the store is
  // told: a mark is evidence of what happened, not a point on the drawn line.
  const posRef = useRef<LatLng | null>(null);

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

  const routeLL = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    [route]
  );
  // NavMap keys its zone GeoJSON off this array's identity, and the compass
  // re-renders this screen about fifteen times a second — a literal would
  // re-upload every zone's geometry on each of them.
  const observationZones = useMemo(() => route?.observation_zones ?? [], [route]);

  const isLoop = useMemo(
    () => routeLL.length > 1 && haversineM(routeLL[0], routeLL[routeLL.length - 1]) < 30,
    [routeLL]
  );

  useEffect(() => { routeLLRef.current = routeLL; }, [routeLL]);

  // The route arrives after the first render, so this is a no-op until there
  // is something to frame — and pointless once a fix has taken the camera over.
  useEffect(() => { if (posRef.current === null) mapRef.current?.fitBounds(); }, [routeLL]);

  const onPosition = useCallback((loc: Location.LocationObject) => {
    const c = loc.coords;
    // Scoring sees the raw fix, never the snapped one. Snapping assumes you are
    // on the route, and a mock test is exactly where someone might not be — it
    // could otherwise credit an observation zone the driver never entered, or
    // hide one they did.
    onSample({ lat: c.latitude, lng: c.longitude, speedMps: Math.max(0, c.speed ?? 0), t: loc.timestamp });

    const raw = { lat: c.latitude, lng: c.longitude };
    posRef.current = raw;

    // Snapped once, here, and only for the display. A mock test has no turn
    // steps, so there is no manoeuvre distance to compute between the snap and
    // navFix, and distanceToManeuverM is null — the zoom then holds at
    // whatever it was seeded with.
    const snap = navSnap(routeLLRef.current, raw, trailRef.current);
    const result = navFix({
      mph: Math.round(mpsToMph(Math.max(0, c.speed ?? 0))),
      gpsCourse: c.heading ?? null,
      mapBearing: mapBearingRef.current,
      compass: compassRef.current,
      bearingSeeded: mapBearingSeededRef.current,
      zoom: zoomRef.current,
      distanceToManeuverM: null,
      snap,
    });

    setPos(result.pos);
    mapBearingRef.current = result.mapBearing;
    mapBearingSeededRef.current = true;
    // The icon's angle is relative to the map, so a map that turned changes it
    // even when the phone did not move.
    setIconRotation(result.iconRotation);
    trailRef.current = result.trailIdx;
    setTrailIdx(result.trailIdx);
    zoomRef.current = result.zoom;
    mapRef.current?.pushCamera(result.pos, result.mapBearing, result.zoom);
  }, [onSample]);

  useEffect(() => {
    if (phase !== "running") return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      // The compass drives the icon, and only the icon. It fires as the phone
      // turns, including standing still, which is the whole point: the map is
      // pinned to the direction of travel and cannot answer a phone being
      // turned on the spot.
      const headingSub = await Location.watchHeadingAsync((h) => {
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
      // distanceInterval stays at 5 m: recorded tests are compared against
      // earlier ones, and the sample cadence is part of what they score.
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
        onPosition
      );
      if (cancelled) { headingSub.remove(); sub.remove(); return; }
      headingSubRef.current = headingSub;
      subRef.current = sub;
    })();
    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
      headingSubRef.current?.remove();
      headingSubRef.current = null;
    };
  }, [phase, onPosition]);

  useEffect(() => {
    if (activeZoneIdx !== null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeZoneIdx]);

  const minors = useMemo(() => marks.filter((m) => m.level === "minor").length, [marks]);
  const majors = useMemo(() => marks.filter((m) => m.level === "major").length, [marks]);
  const credits = useMemo(() => marks.filter((m) => m.level === "credit").length, [marks]);
  const minorCounts = useMemo(() => minorCountsByCategory(marks), [marks]);
  const lastMark = useMemo(() => {
    const m = marks[marks.length - 1];
    if (!m) return null;
    return { label: CATEGORY_LABEL.get(m.category) ?? m.category, level: m.level };
  }, [marks]);
  // warnings() reads the store's marks itself, so `marks` is the real
  // dependency even though it does not appear in the call.
  const warns = useMemo(() => warnings(), [marks, warnings]);

  const onMark = useCallback((category: string, level: MarkLevel) => {
    // Marking happens by feel, on a phone in a cradle, while watching the road:
    // the levels have to be told apart without looking.
    if (level === "major") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (level === "credit") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addMark(category, level, posRef.current);
  }, [addMark]);

  const onUndo = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    undoMark();
  }, [undoMark]);

  // Held apart from the render below: the compass re-renders this screen about
  // fifteen times a second, and the sheet is ~70 pressables that only change
  // when a mark does.
  const sheetContent = useMemo(() => (
    <ExaminerSheet
      minors={minors} majors={majors} credits={credits}
      lastMark={lastMark} minorCounts={minorCounts} warnings={warns}
      onMark={onMark} onUndo={onUndo}
    />
  ), [minors, majors, credits, lastMark, minorCounts, warns, onMark, onUndo]);

  const recenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.recenter();
  };

  return (
    <View className="flex-1">
      <NavMap
        ref={mapRef}
        routeLL={routeLL}
        trailIdx={trailIdx}
        pos={pos}
        iconRotation={iconRotation}
        follow={following}
        onFollowChange={setFollowing}
        // Until the first fix there is no driver to follow, so the route is
        // framed whole rather than left at the default world view.
        preview={pos === null}
        start={routeLL[0] ?? null}
        // A loop finishes where it starts, so the flag would land on the start
        // dot and hide it.
        finish={!isLoop ? routeLL[routeLL.length - 1] ?? null : null}
        observationZones={observationZones}
      />

      <View
        className="absolute left-4 right-4 flex-row items-center justify-between rounded-xl bg-card px-4 py-2.5"
        style={{ top: insets.top + 6, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12 }}
      >
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-danger" />
          <Text className="text-[13px] font-semibold text-primary">Mock test</Text>
        </View>
        <Text className="text-[14px] font-semibold text-primary" style={{ fontVariant: ["tabular-nums"] }}>{clock}</Text>
      </View>

      {/* Under the banner rather than above the mirrors button: on a short
          screen the bottom of the map is taken by the controls row, and the
          puck sits directly above it. */}
      {activeZoneIdx !== null && (
        <Text
          className="absolute self-center rounded-full bg-card/90 px-4 py-1.5 text-[11px] font-semibold text-slate-600"
          style={{ top: insets.top + 56 }}
        >
          Observation zone — check your mirrors
        </Text>
      )}

      {/* Three columns, so the mirrors button stays centred under the puck and
          the two side controls can never grow into it. */}
      <View
        pointerEvents="box-none"
        className="absolute left-4 right-4 flex-row items-center"
        style={{ bottom: CONTROLS_BOTTOM }}
      >
        <View pointerEvents="box-none" className="flex-1 items-start">
          <Pressable
            onPress={() => { finish(); router.replace(`/route/${id}/result`); }}
            className="min-h-[44px] flex-row items-center rounded-full bg-primary px-5 py-2.5"
          >
            <Text className="text-[13px] font-semibold text-white">Finish test</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); tapMirrors(); }}
          className={`h-[74px] w-[74px] items-center justify-center rounded-full ${activeZoneIdx !== null ? "bg-accent" : "bg-slate-300"}`}
          style={activeZoneIdx !== null ? { shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 16 } : undefined}
        >
          <Ionicons name="eye-outline" size={22} color="#fff" />
          <Text className="text-[11px] font-bold text-white">Mirrors</Text>
        </Pressable>

        <View pointerEvents="box-none" className="flex-1 items-end">
          <Pressable
            onPress={recenter}
            className="h-12 w-12 items-center justify-center rounded-full bg-card"
            style={{ shadowColor: "#0F172A", shadowOpacity: 0.18, shadowRadius: 8 }}
          >
            <Ionicons name="navigate" size={20} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      <BottomSheet
        index={0}
        snapPoints={SHEET_SNAP_POINTS}
        handleIndicatorStyle={{ backgroundColor: "#CBD5E1" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {sheetContent}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}
