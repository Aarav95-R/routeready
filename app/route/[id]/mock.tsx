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
import { EXAMINER_BAR_H, ExaminerBar, ExaminerCategoryList, ExaminerWarningPill } from "@/ui/ExaminerSheet";
import { NavMap, NavMapHandle } from "@/ui/NavMap";
import { colors } from "@/ui/theme";

// The collapsed sheet is gorhom's handle — container padding 10 pt top and
// bottom plus a 4 pt indicator (node_modules/@gorhom/bottom-sheet/src/
// components/bottomSheetHandle/styles.ts) — over the examiner bar, whose own
// height comes from ExaminerSheet.tsx so the two can never drift apart. A
// fixed pixel count, not a percentage: a percentage of screen height gives a
// different content height on every phone, which is what clipped the undo
// button and hid the warning before this fix.
const SHEET_HANDLE_H = 24;
const SHEET_COLLAPSED_BASE_H = SHEET_HANDLE_H + EXAMINER_BAR_H; // 92

// Everything that floats over the map is stacked off the collapsed sheet's
// height, so a phone with a home indicator carries the whole column up rather
// than letting the bands run into each other. Measured from the bottom of the
// screen, with h = SHEET_COLLAPSED_BASE_H + insets.bottom:
//
//   sheet             [0,      h]
//   logo + attribution[h + 8,  h + 30]    Mapbox's terms require both visible
//   warning pill      [h + 38, h + 82]    28 pt on one line, 44 pt wrapped
//   controls row      [h + 90, h + 164]   74 pt mirrors circle
//
// The logo and the pill used to be given the same literal (100) by
// coincidence, which put the pill straight over Mapbox's attribution.
const LOGO_GAP = 8;
const LOGO_H = 22;
const PILL_GAP = 8;
const PILL_MAX_H = 44;
const CONTROLS_GAP = 8;

// Hoisted so the compass tick — about fifteen re-renders a second — does not
// hand the BottomSheet a fresh style object each time.
const SHEET_HANDLE_INDICATOR_STYLE = { backgroundColor: "#CBD5E1" };
// The sheet's content container is a column of a known animated height, and
// gorhom gives its scrollables no flex of their own — so the list has to claim
// what is left after the pinned bar explicitly, or it sizes to its content and
// stops scrolling.
const SHEET_SCROLL_STYLE = { flex: 1 };

// Only the label is needed here, and examiner.ts keeps its own lookup private.
const CATEGORY_LABEL = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c.label]));

export default function Mock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    phase, route, startedAt, activeZoneIdx, marks, samples,
    start, onSample, tapMirrors, addMark, undoMark, finish,
  } = useMockTest();

  const [clock, setClock] = useState("0:00");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [trailIdx, setTrailIdx] = useState(0);
  const [following, setFollowing] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [noFix, setNoFix] = useState(false);
  // Degrees to draw the user icon at, measured against the rotated map rather
  // than against north. Held in state, not a ref, because the compass has to
  // be able to redraw it between GPS fixes.
  const [iconRotation, setIconRotation] = useState(0);

  const mapRef = useRef<NavMapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const framedRef = useRef(false);
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

  // The route arrives after the first render, so this is a no-op until there is
  // something to frame. Guarded by its own ref rather than "no position yet":
  // the seed fix below sets a position before the driver has moved, and that
  // must not cost the route its one framing.
  useEffect(() => {
    if (framedRef.current || routeLL.length < 2) return;
    framedRef.current = true;
    mapRef.current?.fitBounds();
  }, [routeLL]);

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
      if (cancelled) return;
      // This used to return silently. The clock kept ticking, the map kept
      // drawing and Finish still worked, so a whole route could be driven and
      // then aggregated from no samples, no zone outcomes and no marks — which
      // is indistinguishable from a flawless drive and scores 100, passed.
      if (status !== "granted") { setPermissionDenied(true); return; }

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

      // One seed fix, as practice.tsx takes: with a 5 m distanceInterval there
      // is otherwise no puck at all until the driver has moved five metres.
      // Display only — onSample is deliberately not called with it, so scoring
      // stays on the watch callback and its cadence alone. posRef is set too,
      // so a "Before setting off" mark still gets a location. Taken after the
      // watch is running, and applied only if the watch has not beaten it, so
      // waiting for a lock cannot delay scoring or overwrite a newer fix. The
      // camera is left alone, exactly as it is on the practice screen.
      try {
        const seed = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
        if (cancelled || posRef.current !== null) return;
        const p = { lat: seed.coords.latitude, lng: seed.coords.longitude };
        posRef.current = p;
        setPos(p);
      } catch {
        // No fix available yet; the watch will deliver the first one.
      }
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
    if (activeZoneIdx === null) return;
    // Soft, not Light: a minor mark also fires Light (below), and the two have
    // to be told apart by feel — this one is passive (the zone arrived on its
    // own), that one is a deliberate tap.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    // At the 85% snap the sheet covers the controls row, Mirrors included, and
    // it does not close on its own: a passenger who pulls it up to mark a fault
    // and leaves it there scores a missed mirror check on every zone from then
    // on, while the toast above the sheet keeps asking them to answer. The
    // sheet is collapsed here rather than on every mark because this is the
    // only state in which its position can change the score, and closing it
    // under a marking finger has its own mis-tap cost.
    sheetRef.current?.collapse();
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

  const onFinish = useCallback(() => {
    // Refuse a verdict with no evidence. A drive taken indoors, or one where
    // the fix never arrives, reaches finish() with no samples and no zone
    // outcomes — the exact shape of a flawless drive — and aggregate() would
    // score it 100 and call it a pass. The guard sits on the one action that
    // produces a verdict rather than inside the scoring engine: aggregate() is
    // a pure function of the faults it is handed, and has no business knowing
    // whether the GPS was working.
    if (samples.length === 0) { setNoFix(true); return; }
    finish();
    router.replace(`/route/${id}/result`);
  }, [samples.length, finish, router, id]);

  // Held apart from the render below: the compass re-renders this screen about
  // fifteen times a second, and the list is ~70 pressables that only change
  // when a mark does.
  const barContent = useMemo(() => (
    <ExaminerBar
      minors={minors} majors={majors} credits={credits}
      lastMark={lastMark} bottomInset={insets.bottom} onUndo={onUndo}
    />
  ), [minors, majors, credits, lastMark, insets.bottom, onUndo]);

  const listContent = useMemo(
    () => <ExaminerCategoryList minorCounts={minorCounts} onMark={onMark} />,
    [minorCounts, onMark]
  );

  const recenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.recenter();
  };

  // The bar carries the safe-area inset itself (it is the whole sheet when
  // collapsed), so the list only needs breathing room under its last row.
  const sheetContentContainerStyle = useMemo(() => ({ paddingBottom: 24 }), []);

  // The collapsed height has to include the inset: the sheet is measured from
  // the bottom of the *screen*, so without it roughly 22 pt of Undo — the only
  // mis-tap recovery there is — sits inside the home indicator's edge-gesture
  // strip. Memoised because BottomSheet re-reads snapPoints on identity change.
  const sheetCollapsedH = useMemo(
    () => SHEET_COLLAPSED_BASE_H + insets.bottom,
    [insets.bottom]
  );
  const sheetSnapPoints = useMemo(() => [sheetCollapsedH, "85%"], [sheetCollapsedH]);

  const logoBottom = sheetCollapsedH + LOGO_GAP;
  const pillBottom = logoBottom + LOGO_H + PILL_GAP;
  const controlsBottom = pillBottom + PILL_MAX_H + CONTROLS_GAP;

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-8">
        <Text className="text-center text-[15px] font-semibold text-primary">Location access is needed to mark a mock test.</Text>
        <Text className="text-center text-[12px] text-slate-500">Enable it in Settings → Privacy → Location Services.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 min-h-[44px] items-center justify-center rounded-full border-[1.5px] border-slate-200 px-6">
          <Text className="text-[14px] font-semibold text-primary">Back</Text>
        </Pressable>
      </View>
    );
  }

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
        logoBottom={logoBottom}
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
        style={{ bottom: controlsBottom }}
      >
        <View pointerEvents="box-none" className="flex-1 items-start">
          <Pressable
            onPress={onFinish}
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

      {/* Floats above the collapsed sheet and the Mapbox logo, over the map —
          the one-row sheet has no room for it. Bounded left and right so a
          long label wraps inside the screen instead of running off both edges
          and over the attribution. Only the most pressing habitual category is
          shown; the per-category badges inside the sheet cover the rest. */}
      {warns[0] && (
        <View pointerEvents="none" className="absolute left-4 right-4 items-center" style={{ bottom: pillBottom }}>
          <ExaminerWarningPill warning={warns[0]} />
        </View>
      )}

      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={sheetSnapPoints}
        handleIndicatorStyle={SHEET_HANDLE_INDICATOR_STYLE}
      >
        {/* The bar sits outside the scroll view: as the first row inside it,
            scrolling down to "Before setting off" carried Undo off the top,
            and spec §3 wants it reachable at all times. A plain View, not
            BottomSheetView — that one is absolutely positioned and registers
            itself as the sheet's scrollable, both of which fight the list. */}
        {barContent}
        <BottomSheetScrollView style={SHEET_SCROLL_STYLE} contentContainerStyle={sheetContentContainerStyle}>
          {listContent}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Nothing was recorded, so there is nothing to mark. Said plainly rather
          than scored: an empty test aggregates to a flawless one. */}
      {noFix && (
        <View className="absolute inset-0 items-center justify-center bg-primary/70 px-8">
          <View className="w-full items-center gap-2 rounded-3xl bg-card px-6 py-7">
            <Text className="text-center text-[16px] font-semibold text-primary">No GPS data was recorded</Text>
            <Text className="text-center text-[12px] leading-5 text-slate-500">
              Nothing was tracked on this drive, so it cannot be marked. Scoring it now would report a clean pass you have not been assessed for.
            </Text>
            <Pressable
              onPress={() => setNoFix(false)}
              className="mt-2 min-h-[44px] w-full items-center justify-center rounded-full bg-accent active:bg-accent-pressed"
            >
              <Text className="text-[15px] font-semibold text-white">Keep driving</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              className="min-h-[44px] w-full items-center justify-center rounded-full border-[1.5px] border-slate-200"
            >
              <Text className="text-[14px] font-semibold text-primary">Leave the test</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
