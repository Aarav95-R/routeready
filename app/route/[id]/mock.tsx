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
import { EXAMINER_CATEGORIES, habitualWarnings, minorCountsByCategory, type MarkLevel } from "@/lib/examiner";
import { haversineM, iconRotationDeg, LatLng, mpsToMph, smoothHeading } from "@/lib/geo";
import { NAV_ZOOM_MID } from "@/lib/navigation";
import { COMPASS_ALPHA, ICON_TICK_MS, LOOP_CLOSE_M, navFix, navSnap } from "@/lib/navmap";
import { ExaminerSheet, ExaminerWarningPill } from "@/ui/ExaminerSheet";
import { NavMap, NavMapHandle } from "@/ui/NavMap";
import { colors } from "@/ui/theme";

// The puck sits at 62% of screen height; the controls row lives above the
// collapsed sheet, high enough to clear it and low enough not to sit under
// the vehicle.
const CONTROLS_BOTTOM = 150;
// The collapsed sheet is one row: "Examiner", the three tallies and Undo, in
// a px-4 py-3 container (12 pt top/bottom padding) whose row height is driven
// by Undo's 44 pt minHeight — 24 + 44 = 68 pt of content. Gorhom adds its own
// handle above that: container padding 10 pt top/bottom plus a 4 pt indicator
// = 24 pt (node_modules/@gorhom/bottom-sheet/src/components/bottomSheetHandle/styles.ts).
// 68 + 24 = 92 pt total, comfortably under CONTROLS_BOTTOM (150) so the two
// never overlap. A fixed pixel count, not a percentage: a percentage of
// screen height gives a different content height on every phone, which is
// what clipped the undo button and hid the warning before this fix.
const SHEET_COLLAPSED_H = 92;
const SHEET_SNAP_POINTS = [SHEET_COLLAPSED_H, "85%"];
// Clears the collapsed sheet (92 pt) with room for the ~20 pt logo/attribution
// mark itself; Mapbox's terms require both to stay visible.
const MOCK_LOGO_BOTTOM = 100;
// Floats above the sheet and below the controls row (top edge at
// CONTROLS_BOTTOM + 74 pt mirrors circle = 224), clear of both.
const WARNING_PILL_BOTTOM = SHEET_COLLAPSED_H + 8;

// Hoisted so the compass tick — about fifteen re-renders a second — does not
// hand the BottomSheet a fresh style object each time.
const SHEET_HANDLE_INDICATOR_STYLE = { backgroundColor: "#CBD5E1" };

// Only the label is needed here, and examiner.ts keeps its own lookup private.
const CATEGORY_LABEL = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c.label]));

export default function Mock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    phase, route, startedAt, activeZoneIdx, marks,
    start, onSample, tapMirrors, addMark, undoMark, finish,
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
    () => routeLL.length > 1 && haversineM(routeLL[0], routeLL[routeLL.length - 1]) < LOOP_CLOSE_M,
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
    //
    // This is also the split behind the puck-vs-toast disagreement below: the
    // puck is drawn at `result.pos` (snapped, from this call) while the zone
    // toast is driven by the untouched `raw` fix passed to onSample above. The
    // two can differ by up to SNAP_MAX_M (40 m) near the edge of a zone. That
    // is correct — the toast has to answer "did the driver actually enter the
    // zone", not "does the drawn line say so" — but it will look like a bug to
    // anyone watching the map and the toast disagree on device.
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
    // Soft, not Light: a minor mark also fires Light (below), and the two have
    // to be told apart by feel — this one is passive (the zone arrived on its
    // own), that one is a deliberate tap.
    if (activeZoneIdx !== null) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
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
  const warns = useMemo(() => habitualWarnings(marks), [marks]);

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
      lastMark={lastMark} minorCounts={minorCounts}
      onMark={onMark} onUndo={onUndo}
    />
  ), [minors, majors, credits, lastMark, minorCounts, onMark, onUndo]);

  const recenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.recenter();
  };

  // Hoisted out of the BottomSheetScrollView below for the same reason as
  // SHEET_HANDLE_INDICATOR_STYLE, but this one depends on the safe-area inset
  // so it cannot be a module-level constant.
  const sheetContentContainerStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + 24 }),
    [insets.bottom]
  );

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
        logoBottom={MOCK_LOGO_BOTTOM}
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

      {/* Floats above the collapsed sheet, over the map — the one-row sheet has
          no room for it. Only the most pressing habitual category is shown;
          the per-category badges inside the sheet cover the rest. */}
      {warns[0] && (
        <View className="absolute self-center" style={{ bottom: WARNING_PILL_BOTTOM }}>
          <ExaminerWarningPill warning={warns[0]} />
        </View>
      )}

      <BottomSheet
        index={0}
        snapPoints={SHEET_SNAP_POINTS}
        handleIndicatorStyle={SHEET_HANDLE_INDICATOR_STYLE}
      >
        <BottomSheetScrollView contentContainerStyle={sheetContentContainerStyle}>
          {sheetContent}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}
