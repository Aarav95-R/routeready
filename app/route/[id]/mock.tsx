import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { fetchDirections, Directions } from "@/services/directions";
import { useMockTest } from "@/stores/mockTestStore";
import { EXAMINER_CATEGORIES, habitualWarnings, minorCountsByCategory, type MarkLevel } from "@/lib/examiner";
import { bearingDeg, cumulativeM, haversineM, iconRotationDeg, LatLng, mpsToMph, smoothHeading, snapToPath } from "@/lib/geo";
import { advance, ANNOUNCE_M, AT_START_M, formatDistance, NAV_ZOOM_FAR, NAV_ZOOM_MID, rebaseRouteCursor, remainingM, routeProgress } from "@/lib/navigation";
import { COMPASS_ALPHA, ICON_TICK_MS, LOOP_CLOSE_M, navFix, navSnap } from "@/lib/navmap";
import { chooseRejoin, departureLine, initialOffRoute, REJOINED_LINE, SKIP_WARN_M, stepOffRoute, type OffRouteState, type Rejoin } from "@/lib/offRoute";
import { createRouteLifecycle, qualifyLocationFix, routeLifecycleReducer, type RouteFix } from "@/lib/routeLifecycle";
import type { ObservationZone, Route } from "@/types/db";
import { EXAMINER_BAR_H, ExaminerBar, ExaminerCategoryList, ExaminerWarningPill } from "@/ui/ExaminerSheet";
import { ManeuverBanner } from "@/ui/ManeuverBanner";
import { NavMap, NavMapHandle } from "@/ui/NavMap";
import { RoutePreviewCard } from "@/ui/RoutePreviewCard";
import { RouteFinishPrompt } from "@/ui/RouteFinishPrompt";
import { RouteStartPrompt } from "@/ui/RouteStartPrompt";
import { colors } from "@/ui/theme";

// The screen's own three stages, distinct from the store's phase: the store
// only knows "idle | running | finished", because it only cares whether what
// arrives is evidence. Both preview and the drive to the start leave it idle.
//
// Nothing is marked, timed or sampled before "test" — a fault cannot be scored
// against a driver who has not been told the test has begun, and the clock used
// to start the moment this screen opened.
// "at-start" is the pause on the start line, after being guided there. It
// used not to exist: reaching the start called beginTest() straight from the
// GPS callback, so the clock started and the first fault became markable while
// the phone was still in the driver's hand. The store stays idle throughout.
//
// There is no matching leg at the other end. Closing the loop is not a
// decision — the driver is back at the test centre and the drive is over — so
// the test scores itself and leaves for the result screen.
type Leg = "preview" | "approach" | "at-start" | "test" | "finish-prompt" | "location-unavailable";

// The collapsed sheet is gorhom's handle — container padding 10 pt top and
// bottom plus a 4 pt indicator (node_modules/@gorhom/bottom-sheet/src/
// components/bottomSheetHandle/styles.ts) — over the examiner bar, whose own
// height comes from ExaminerSheet.tsx so the two can never drift apart. A
// fixed pixel count, not a percentage: a percentage of screen height gives a
// different content height on every phone, which is what clipped the undo
// button and hid the warning before this fix.
const SHEET_HANDLE_H = 24;
const SHEET_COLLAPSED_BASE_H = SHEET_HANDLE_H + EXAMINER_BAR_H; // 92

// The floating logo/attribution is stacked off the collapsed sheet's height
// alone, so a phone with a home indicator carries it up rather than letting
// it sit atop the sheet. Measured from the bottom of the screen, with h =
// SHEET_COLLAPSED_BASE_H + insets.bottom:
//
//   sheet              [0,     h]
//   logo + attribution [h + 8, h + 30]   Mapbox's terms require both visible
const LOGO_GAP = 8;

// The controls row sits a tuned distance above the *sheet*, not the pill —
// it nearly touches the vehicle puck and cannot afford to inherit some other
// element's height, so it is added to insets.bottom directly rather than
// stacked through logoBottom/pillTop the way the logo is.
//
// The puck sits at 62% of screen height (NavMap's PUCK_SCREEN_FRACTION) in an
// 88 pt box (NavPuck's PUCK_SIZE), so its centre is 0.38 x H from the bottom
// of the screen. Only the middle of that box is drawn: the puck's visible
// artwork spans SVG y 19-73 inside it, so the artwork's lower edge sits
// centre - 44 + 15 = centre - 29. On a 667 pt-tall screen (iPhone SE, the
// smallest this app targets, insets.bottom 0) that is 0.38 x 667 - 29 = 224.5
// pt from the bottom. The controls row is 74 pt tall (the mirrors circle),
// so at bottom: 150 it spans [150, 224] — clearing the artwork by 0.5 pt.
//
// insets.bottom is added on top of the 150 (not folded into a single fixed
// literal) because the collapsed sheet's own height already grows by
// insets.bottom pt (see sheetCollapsedH below), and a flat 150 stopped
// clearing the Mapbox logo band by exactly that amount on any phone with a
// 34 pt home-indicator inset: logo top = 92 + 34 + 30 = 156, three pt inside
// a static [150, 224] controls row. Every notched/Dynamic-Island iPhone in
// current use has a 34 pt bottom inset, so this is not a hypothetical case.
// Growing the puck's own screen fraction with H more than covers the extra
// headroom this adds — see the check above.
//
// Do not make this depend on whether the pill, the toast or anything else is
// currently on screen: at this margin, one reserved-but-invisible band is
// enough to push the row's top edge into the puck. That is exactly what
// happened when this used to be pillBottom + PILL_MAX_H + CONTROLS_GAP.
const CONTROLS_BOTTOM = 150;

// The habitual-warning pill used to float just above the controls row, but
// that band sits inside the puck's visible artwork on a short screen (see
// CONTROLS_BOTTOM above) whether or not the pill itself is rendered — the
// bottom of the screen has no spare room for it. Moved to the top instead,
// below the observation-zone toast: the pill is informational, not tied to
// the road ahead the way the toast and the controls are, so it does not need
// to live near the bottom stack at all. Measured from the top of the screen:
//
//   banner       [insets.top + 6,  insets.top + 40]
//   zone toast    insets.top + 56                    one line, ~28 pt
//   warning pill  insets.top + 92                     36 pt clear of the toast
// While off route the amber banner takes the top slot, and everything
// stacked below it moves down by its height plus a gap. Measured from
// ManeuverBanner: the eyebrow strip is 20 pt and the manoeuvre row is a
// 48 pt tile in 14 pt of padding, so 96 clears both with the gap included.
const OFF_ROUTE_BANNER_H = 96;
const ZONE_TOAST_TOP_GAP = 56;
const PILL_TOP_GAP = 92;

// Hoisted so the compass tick — about fifteen re-renders a second — does not
// hand the BottomSheet a fresh style object each time.
const SHEET_HANDLE_INDICATOR_STYLE = { backgroundColor: "#D8D1C8" };
// The sheet's content container is a column of a known animated height, and
// gorhom gives its scrollables no flex of their own — so the list has to claim
// what is left after the pinned bar explicitly, or it sizes to its content and
// stops scrolling.
const SHEET_SCROLL_STYLE = { flex: 1 };

// Only the label is needed here, and examiner.ts keeps its own lookup private.
const CATEGORY_LABEL = new Map(EXAMINER_CATEGORIES.map((c) => [c.id, c.label]));

// NavMap rebuilds its zone GeoJSON whenever this array's identity changes, and
// the compass re-renders this screen about fifteen times a second.
const NO_ZONES: ObservationZone[] = [];

export default function Mock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A practice loop runs about forty minutes with the phone mounted and
  // untouched, which is exactly the condition iOS auto-lock is built to end.
  // Scoped to this screen rather than set globally: the lock should come back
  // the moment the drive does not need the map. Released on unmount.
  useKeepAwake();
  const {
    startedAt, activeZoneIdx, marks,
    start, onSample, tapMirrors, addMark, undoMark, finish, addDeviation,
  } = useMockTest();

  // The way back onto the route, and how far off it we are.
  const [returnLeg, setReturnLeg] = useState<Directions | null>(null);
  const [offPhase, setOffPhase] = useState<OffRouteState["phase"]>("on-route");
  // Metres of route the chosen rejoin skips, or null when nothing worth
  // naming is skipped. State, not a ref — the banner renders from it.
  const [skippedM, setSkippedM] = useState<number | null>(null);

  // Held here rather than read back off the store: the route has to be drawn
  // and framed while it is being previewed, and the store must not know about a
  // test that has not started. It is handed over in beginTest.
  const [route, setRoute] = useState<Route | null>(null);
  const [leg, setLeg] = useState<Leg>("preview");
  // "Not yet" on the arrival card. The card gives way to a bar carrying the
  // same action, so a learner who wants a minute at the kerb gets one without
  // the test becoming two taps away again.
  const [held, setHeld] = useState(false);
  const [clock, setClock] = useState("0:00");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [trailIdx, setTrailIdx] = useState(0);
  const [following, setFollowing] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Degrees to draw the user icon at, measured against the rotated map rather
  // than against north. Held in state, not a ref, because the compass has to
  // be able to redraw it between GPS fixes.
  const [iconRotation, setIconRotation] = useState(0);

  // The drive to the start line. Its own polyline, its own step list, and a
  // fallback for when directions cannot be fetched at all.
  const [previewLoc, setPreviewLoc] = useState<LatLng | null>(null);
  const [approach, setApproach] = useState<Directions | null>(null);
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [directDist, setDirectDist] = useState<number | null>(null);
  const [crowRot, setCrowRot] = useState(0);

  const mapRef = useRef<NavMapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);
  const legRef = useRef<Leg>("preview");
  const routeRef = useRef<Route | null>(null);
  const approachRef = useRef<Directions | null>(null);
  const fallbackRef = useRef(false);
  const startRef = useRef<LatLng | null>(null);
  const indexRef = useRef(1);
  const preparedRef = useRef(new Set<number>());
  const executedRef = useRef(new Set<number>());
  const routeLLRef = useRef<LatLng[]>([]);
  // cumulativeM of each leg's polyline, so routeComplete can measure progress
  // in metres. Held per leg because the two legs are different lines.
  const routeCumRef = useRef<number[]>([]);
  const approachCumRef = useRef<number[]>([]);
  // Latches the end of a leg. routeComplete stays true once it is true, and
  // the watch fires several times a second — without this the test would be
  // scored again on every fix and the result screen stacked on itself.
  const completedRef = useRef(false);
  const lifecycleRef = useRef(createRouteLifecycle());
  const trailRef = useRef(0);
  const mapBearingRef = useRef(0);            // what the map is rotated to: travel direction only
  const mapBearingSeededRef = useRef(false);  // first fix snaps straight to target, no ease-in
  const compassRef = useRef(0);               // smoothed compass, drives the icon
  const compassSeededRef = useRef(false);
  const lastIconRef = useRef(0);
  const zoomRef = useRef(NAV_ZOOM_MID);
  const offRef = useRef<OffRouteState>(initialOffRoute);
  const returnLegRef = useRef<Directions | null>(null);
  const rejoinRef = useRef<Rejoin | null>(null);
  // Guards the directions fetch: the GPS callback runs several times a second
  // and a departure stays true until the driver is back on the line.
  const returnRequestRef = useRef(0);
  const failedLegRef = useRef<Leg>("preview");
  // When the current departure began, so its duration can be recorded. Null
  // whenever the driver is on the route.
  const offSinceRef = useRef<number | null>(null);
  // Where a mark gets stamped. The raw fix, like everything else the store is
  // told: a mark is evidence of what happened, not a point on the drawn line.
  const posRef = useRef<LatLng | null>(null);

  useEffect(() => {
    getRoute(id).then((r) => setRoute(r.data.route)).catch(() => {});
  }, [id]);

  // Only while the test is being driven. startedAt is 0 until the store is
  // started, so an unguarded interval reported the milliseconds since 1970 as
  // a duration — and, once fixed, would still have timed the walk to the car.
  useEffect(() => {
    if (leg !== "test") return;
    const tick = () => {
      const s = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      setClock(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [leg, startedAt]);

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

  const routeCum = useMemo(() => cumulativeM(routeLL), [routeLL]);

  useEffect(() => {
    routeLLRef.current = routeLL;
    routeCumRef.current = routeCum;
    routeRef.current = route;
    startRef.current = routeLL[0] ?? null;
  }, [routeLL, routeCum, route]);

  // routeLL is a dependency because it arrives after the first render: the fit
  // is a no-op until there is a route to frame.
  useEffect(() => { if (leg === "preview") mapRef.current?.fitBounds(); }, [leg, routeLL]);

  // How far the driver is from the start line, for the preview card. A last
  // known fix rather than a live one: this is a card being read at a standstill,
  // and asking for a fresh lock would cost a permission prompt before the
  // driver has chosen to do anything.
  useEffect(() => {
    if (!routeLL.length) return;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      const p = await Location.getLastKnownPositionAsync();
      if (p) setPreviewLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
    })();
  }, [routeLL.length]);

  // Reaching the start line after being guided to it. The test does not begin
  // here — the card does.
  const reachStart = useCallback(() => {
    legRef.current = "at-start";
    setLeg("at-start");
    setHeld(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak("You have reached the start.", { language: "en-GB" });
  }, []);

  // The drive proper begins here, and only ever from a tap: the Start buttons
  // on the preview card, or Begin on the arrival card. This is the only place
  // the store is told anything, so it is also the moment the clock, the
  // samples and the marks come alive.
  /**
   * Fetch the way back onto the route.
   *
   * Never awaited by the GPS callback: that runs on every fix, and awaiting
   * here would serialise the whole nav loop behind a network call.
   */
  const fetchReturnLeg = useCallback(async (from: LatLng, rejoin: Rejoin) => {
    const request = ++returnRequestRef.current;
    try {
      const dirs = await fetchDirections(from, rejoin.point);
      if (request !== returnRequestRef.current || !["off-route", "returning"].includes(offRef.current.phase)) return;
      returnLegRef.current = dirs;
      setReturnLeg(dirs);
    } catch {
      if (request !== returnRequestRef.current) return;
      // No directions available. The banner still says "off route" and the
      // route stays drawn, which is more use at the wheel than an error.
      returnLegRef.current = null;
      setReturnLeg(null);
    }
  }, []);

  const beginTest = useCallback(async () => {
    const r = routeRef.current;
    if (!r) return;
    let lastFixAt = lifecycleRef.current.lastAcceptedFix?.timestamp ?? 0;
    if (Date.now() - lastFixAt > 5_000) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
        const raw = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        const startPoint = startRef.current;
        const distanceToStart = startPoint ? haversineM(raw, startPoint) : Infinity;
        const fix: RouteFix = {
          lat: raw.lat, lng: raw.lng, timestamp: loc.timestamp,
          accuracyM: loc.coords.accuracy ?? Infinity,
          speedMph: mpsToMph(Math.max(0, loc.coords.speed ?? 0)),
          routeDistanceM: distanceToStart, startDistanceM: distanceToStart,
          finishDistanceM: distanceToStart, routeProgress: 0, trailIdx: 0,
        };
        lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
          type: "FIX_RECEIVED", fix, receivedAt: Math.max(Date.now(), loc.timestamp),
        });
        lastFixAt = fix.timestamp;
      } catch { return; }
    }
    const lifecycle = routeLifecycleReducer(lifecycleRef.current, {
      type: "BEGIN_REQUESTED",
      at: Math.max(Date.now(), lastFixAt),
    });
    lifecycleRef.current = lifecycle;
    if (lifecycle.phase !== "active" || lifecycle.startedAt === null) return;
    legRef.current = "test";
    setLeg("test");
    start(r, lifecycle.startedAt);
    // A departure on the drive to the start must not carry into the test.
    offRef.current = initialOffRoute;
    rejoinRef.current = null;
    returnLegRef.current = null;
    returnRequestRef.current += 1;
    offSinceRef.current = null;
    setOffPhase("on-route");
    setReturnLeg(null);
    setSkippedM(null);
    trailRef.current = 0;
    setTrailIdx(0);
    completedRef.current = false;
    // A new leg means a new active polyline, which can carry an unrelated
    // bearing — re-seed rather than easing round from the approach's.
    mapBearingSeededRef.current = false;
    zoomRef.current = NAV_ZOOM_MID;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Speech.speak("The mock test begins now.", { language: "en-GB" });
  }, [start]);

  // The drive to the start line. Narrated turn by turn and never marked: no
  // sample reaches the store, so a wrong turn on the way over cannot cost a
  // fault, and the observation zones on the test route are not live yet.
  const onApproachPosition = useCallback((loc: Location.LocationObject) => {
    const c = loc.coords;
    const raw = { lat: c.latitude, lng: c.longitude };
    posRef.current = raw;

    const startPoint = startRef.current;
    const distanceToStart = startPoint ? haversineM(raw, startPoint) : Infinity;
    const startFix: RouteFix = {
      lat: raw.lat,
      lng: raw.lng,
      timestamp: loc.timestamp,
      accuracyM: c.accuracy ?? Infinity,
      speedMph: mpsToMph(Math.max(0, c.speed ?? 0)),
      routeDistanceM: distanceToStart,
      startDistanceM: distanceToStart,
      finishDistanceM: distanceToStart,
      routeProgress: 0,
      trailIdx: trailRef.current,
    };
    lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
      type: "FIX_RECEIVED",
      fix: startFix,
      receivedAt: Math.max(Date.now(), loc.timestamp),
    });
    if (lifecycleRef.current.phase === "start-prompt") {
      reachStart();
      return;
    }

    const dirs = approachRef.current;
    const startPt = startRef.current;
    const isFallback = fallbackRef.current && !!startPt;
    const steps = dirs?.steps ?? [];

    const snap = navSnap(dirs?.coords ?? [], raw, trailRef.current);
    const st = !isFallback && steps.length ? advance(steps, snap.pos, indexRef.current) : null;

    const result = navFix({
      mph: Math.round(mpsToMph(Math.max(0, c.speed ?? 0))),
      gpsCourse: c.heading ?? null,
      mapBearing: mapBearingRef.current,
      compass: compassRef.current,
      bearingSeeded: mapBearingSeededRef.current,
      zoom: zoomRef.current,
      distanceToManeuverM: st?.distanceToManeuverM ?? null,
      snap,
    });
    const p = result.pos;
    setPos(p);
    mapBearingRef.current = result.mapBearing;
    mapBearingSeededRef.current = true;
    setIconRotation(result.iconRotation);

    // The start line is reached geometrically, not by walking the step index —
    // see routeComplete. A step index only moves when the driver passes within
    // 25 m of each manoeuvre in turn, and one missed junction used to strand
    // the handover for the rest of the drive.

    // No directions could be fetched, so there is nothing to follow but the
    // direction of the start. The arrow is screen-space, so it is measured
    // against the bearing the map is actually rotated to.
    if (isFallback) {
      const d = haversineM(p, startPt!);
      setDirectDist(Math.round(d));
      setCrowRot(bearingDeg(p, startPt!) - mapBearingRef.current);
      zoomRef.current = NAV_ZOOM_FAR;
      mapRef.current?.pushCamera(p, mapBearingRef.current, NAV_ZOOM_FAR);
      return;
    }

    if (!st) {
      // A leg can legitimately arrive with no steps. The camera still has to
      // follow, or the driver watches their puck walk off a frozen map.
      mapRef.current?.pushCamera(p, mapBearingRef.current, zoomRef.current);
      return;
    }

    indexRef.current = st.index;
    setStepIndex(st.index);
    setDistanceM(st.distanceToManeuverM);
    setRemaining(remainingM(steps, p, st.index));
    trailRef.current = result.trailIdx;
    setTrailIdx(result.trailIdx);
    zoomRef.current = result.zoom;
    mapRef.current?.pushCamera(p, mapBearingRef.current, result.zoom);

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

  }, [reachStart]);

  // The end of the drive. No confirmation and no guard on the samples: unlike
  // the Finish button, which can be pressed from a car that never got a fix,
  // getting here at all requires the trail index to have travelled the length
  // of the route, and that only moves on real fixes.
  //
  // The watch is not torn down here — the screen is leaving, and its unmount
  // effect owns that, exactly as the Finish button leaves it to.
  const finishAndNavigate = useCallback((at: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    const since = offSinceRef.current;
    if (since !== null) {
      addDeviation({
        atIdx: offRef.current.departedIdx ?? trailRef.current,
        skippedM: rejoinRef.current?.skippedM ?? 0,
        seconds: Math.max(0, Math.round((at - since) / 1000)),
      });
      offSinceRef.current = null;
    }
    returnRequestRef.current += 1;
    finish(at);
    router.replace(`/route/${id}/result`);
  }, [addDeviation, finish, router, id]);

  const endTest = useCallback(() => {
    lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
      type: "END_REQUESTED",
      at: Date.now(),
    });
    const completedAt = lifecycleRef.current.completedAt;
    if (lifecycleRef.current.phase !== "complete" || completedAt === null) return;
    finishAndNavigate(completedAt);
  }, [finishAndNavigate]);

  const keepDriving = useCallback(() => {
    lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, { type: "KEEP_DRIVING" });
    legRef.current = "test";
    setLeg("test");
  }, []);

  const onPosition = useCallback((loc: Location.LocationObject) => {
    const c = loc.coords;
    const raw = { lat: c.latitude, lng: c.longitude };
    if (legRef.current === "preview") {
      const startPoint = startRef.current;
      if (!startPoint) return;
      setPreviewLoc(raw);
      const distanceToStart = haversineM(raw, startPoint);
      const startFix: RouteFix = {
        lat: raw.lat,
        lng: raw.lng,
        timestamp: loc.timestamp,
        accuracyM: c.accuracy ?? Infinity,
        speedMph: mpsToMph(Math.max(0, c.speed ?? 0)),
        routeDistanceM: distanceToStart,
        startDistanceM: distanceToStart,
        finishDistanceM: distanceToStart,
        routeProgress: 0,
        trailIdx: 0,
      };
      lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
        type: "FIX_RECEIVED",
        fix: startFix,
        receivedAt: Math.max(Date.now(), loc.timestamp),
      });
      if (lifecycleRef.current.phase === "start-prompt") reachStart();
      return;
    }
    if (legRef.current === "approach") { onApproachPosition(loc); return; }
    // Waiting on the start line for the driver to tap Begin. Nothing reaches
    // the store: a fault cannot be scored against a test that has not started.
    if (legRef.current === "at-start") {
      setPos(raw);
      const startPoint = startRef.current;
      const distanceToStart = startPoint ? haversineM(raw, startPoint) : Infinity;
      lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
        type: "FIX_RECEIVED",
        fix: {
          lat: raw.lat, lng: raw.lng, timestamp: loc.timestamp,
          accuracyM: c.accuracy ?? Infinity,
          speedMph: mpsToMph(Math.max(0, c.speed ?? 0)),
          routeDistanceM: distanceToStart, startDistanceM: distanceToStart,
          finishDistanceM: distanceToStart, routeProgress: 0, trailIdx: 0,
        },
        receivedAt: Math.max(Date.now(), loc.timestamp),
      });
      return;
    }
    if (legRef.current === "finish-prompt") { setPos(raw); return; }

    const qualityProbe: RouteFix = {
      lat: raw.lat,
      lng: raw.lng,
      timestamp: loc.timestamp,
      accuracyM: c.accuracy ?? Infinity,
      speedMph: mpsToMph(Math.max(0, c.speed ?? 0)),
      routeDistanceM: 0,
      startDistanceM: 0,
      finishDistanceM: 0,
      routeProgress: 0,
      trailIdx: trailRef.current,
    };
    if (!qualifyLocationFix(lifecycleRef.current, qualityProbe, Math.max(Date.now(), loc.timestamp))) {
      setPos(raw);
      return;
    }
    // Scoring sees the raw fix, never the snapped one. Snapping assumes you are
    // on the route, and a mock test is exactly where someone might not be — it
    // could otherwise credit an observation zone the driver never entered, or
    // hide one they did.
    onSample({ lat: c.latitude, lng: c.longitude, speedMps: Math.max(0, c.speed ?? 0), t: loc.timestamp });

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
    let acceptedTrailIdx = result.onRoute ? result.trailIdx : trailRef.current;
    trailRef.current = acceptedTrailIdx;
    setTrailIdx(acceptedTrailIdx);
    zoomRef.current = result.zoom;
    mapRef.current?.pushCamera(result.pos, result.mapBearing, result.zoom);

    // Off-route. Identical guidance to the practice screen — a learner mid-turn
    // needs the same help whether or not the run is being scored — but here
    // each departure is also recorded, because a mock result that quietly hides
    // a wandered drive is not worth taking. It is not a fault and never reaches
    // the marks.
    {
      const coords = routeLLRef.current;
      const departedBefore = offRef.current.departedIdx;
      const routeSnap = offRef.current.phase === "off-route" || offRef.current.phase === "returning"
        ? snapToPath(coords, raw, 0, coords.length)
        : snapToPath(coords, raw, trailRef.current);
      const legSnap = returnLegRef.current
        ? snapToPath(returnLegRef.current.coords, raw, 0, returnLegRef.current.coords.length)
        : null;
      const { state, event } = stepOffRoute(offRef.current, {
        routeDistM: routeSnap?.distM ?? Infinity,
        returnLegDistM: legSnap?.distM ?? null,
        trailIdx: acceptedTrailIdx,
        returnLegReady: returnLegRef.current !== null,
        timestampMs: loc.timestamp,
      });
      offRef.current = state;
      setOffPhase(state.phase);

      if (event === "departed" || event === "recompute") {
        const rejoin = chooseRejoin(coords, routeCumRef.current, result.pos, departedBefore ?? acceptedTrailIdx, mapBearingRef.current);
        rejoinRef.current = rejoin;
        returnLegRef.current = null;
        setReturnLeg(null);
        setSkippedM(rejoin && rejoin.skippedM >= SKIP_WARN_M ? rejoin.skippedM : null);
        if (rejoin) {
          if (event === "departed") {
            offSinceRef.current = Date.now();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Speech.speak(departureLine(rejoin.skippedM), { language: "en-GB" });
          }
          void fetchReturnLeg(result.pos, rejoin);
        }
      }

      if (event === "rejoined") {
        returnRequestRef.current += 1;
        const cursor = rebaseRouteCursor(
          {
            trailIdx: trailRef.current,
            progressFloorIdx: lifecycleRef.current.progressFloorIdx,
            stepIdx: indexRef.current,
          },
          routeSnap?.idx ?? rejoinRef.current?.idx ?? acceptedTrailIdx,
          [],
          coords,
        );
        trailRef.current = cursor.trailIdx;
        acceptedTrailIdx = cursor.trailIdx;
        setTrailIdx(cursor.trailIdx);
        // Recorded before the refs are cleared, and against the index the
        // driver actually left at rather than where they came back.
        const since = offSinceRef.current;
        if (since !== null) {
          addDeviation({
            atIdx: departedBefore ?? acceptedTrailIdx,
            skippedM: rejoinRef.current?.skippedM ?? 0,
            seconds: Math.round((Date.now() - since) / 1000),
          });
        }
        offSinceRef.current = null;
        rejoinRef.current = null;
        returnLegRef.current = null;
        setReturnLeg(null);
        setSkippedM(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Speech.speak(REJOINED_LINE, { language: "en-GB" });
      }
    }

    const finishPoint = routeLLRef.current.at(-1);
    const routeSnap = snapToPath(routeLLRef.current, raw, trailRef.current);
    const routeFix: RouteFix = {
      ...qualityProbe,
      routeDistanceM: routeSnap?.distM ?? Infinity,
      startDistanceM: startRef.current ? haversineM(raw, startRef.current) : Infinity,
      finishDistanceM: finishPoint ? haversineM(raw, finishPoint) : Infinity,
      routeProgress: routeProgress(routeCumRef.current, acceptedTrailIdx),
      trailIdx: acceptedTrailIdx,
    };
    lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
      type: "FIX_RECEIVED",
      fix: routeFix,
      receivedAt: Math.max(Date.now(), loc.timestamp),
    });
    if (lifecycleRef.current.phase === "finish-prompt") {
      legRef.current = "finish-prompt";
      setLeg("finish-prompt");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [onSample, onApproachPosition, reachStart, addDeviation, fetchReturnLeg]);

  const stopWatching = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    headingSubRef.current?.remove();
    headingSubRef.current = null;
    Speech.stop();
  }, []);
  useEffect(() => stopWatching, [stopWatching]);

  const startWatch = useCallback(async () => {
    subRef.current?.remove();
    subRef.current = null;
    headingSubRef.current?.remove();
    headingSubRef.current = null;
    // headingSub is declared outside the try so a throw from
    // watchPositionAsync — after watchHeadingAsync already resolved — can
    // still find it and remove it. An uncaught throw anywhere here used to
    // escape with no .catch: cleanup only ever looks at headingSubRef/subRef,
    // and neither is assigned until the very end, so cleanup found nothing to
    // remove and the magnetometer ran for the life of the process, plus an
    // unhandled promise rejection.
    let headingSub: Location.LocationSubscription | null = null;
    try {
      // The compass drives the icon, and only the icon. It fires as the phone
      // turns, including standing still, which is the whole point: the map is
      // pinned to the direction of travel and cannot answer a phone being
      // turned on the spot.
      headingSub = await Location.watchHeadingAsync((h) => {
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
        onPosition,
        () => {
          lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
            type: "LOCATION_FAILED",
            reason: "watch-failed",
          });
          failedLegRef.current = legRef.current;
          legRef.current = "location-unavailable";
          setLeg("location-unavailable");
          setPermissionDenied(true);
        },
      );
      headingSubRef.current = headingSub;
      subRef.current = sub;
    } catch {
      // A magnetometer or GPS failure on first run is exactly the kind of
      // thing only a real device surfaces. permissionDenied is reused rather
      // than inventing a third dead-end screen: either way the test cannot be
      // scored, and "check Settings" is the same remedy to offer.
      headingSub?.remove();
      failedLegRef.current = legRef.current;
      legRef.current = "location-unavailable";
      setLeg("location-unavailable");
      setPermissionDenied(true);
      return;
    }

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
      if (posRef.current !== null) return;
      const p = { lat: seed.coords.latitude, lng: seed.coords.longitude };
      posRef.current = p;
      setPos(p);
    } catch {
      // No fix available yet; the watch will deliver the first one.
    }
  }, [onPosition]);

  useEffect(() => {
    if (!routeLL.length || leg !== "preview" || subRef.current) return;
    let active = true;
    void (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (active && status === "granted") await startWatch();
    })();
    return () => { active = false; };
  }, [leg, routeLL.length, startWatch]);

  // Asked for at the moment the driver commits to setting off, not on mount.
  // A refusal used to return silently: the clock kept ticking, the map kept
  // drawing and Finish still worked, so a whole route could be driven and then
  // aggregated from no samples, no zone outcomes and no marks — which is
  // indistinguishable from a flawless drive and scores 100, passed.
  const ensurePermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setPermissionDenied(true); return false; }
    return true;
  };

  const startDirectly = useCallback(async () => {
    if (!(await ensurePermission())) return;
    approachRef.current = null;
    setApproach(null);
    fallbackRef.current = true;
    setFallback(true);
    legRef.current = "approach";
    setLeg("approach");
    await startWatch();
  }, [startWatch]);

  const guideToStart = useCallback(async () => {
    if (!(await ensurePermission())) return;
    setBusy(true);
    let me: LatLng | null = null;
    try {
      const f = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      me = { lat: f.coords.latitude, lng: f.coords.longitude };
      posRef.current = me;
      setPos(me);
    } catch {
      // Handled below: no fix means no directions to fetch, which is the
      // fallback case rather than a dead end.
    }
    const startPt = startRef.current;
    try {
      if (!me || !startPt) throw new Error("no fix");
      const dirs = await fetchDirections(me, startPt);
      approachRef.current = dirs; setApproach(dirs);
      approachCumRef.current = cumulativeM(dirs.coords);
      fallbackRef.current = false; setFallback(false);
    } catch {
      approachRef.current = null; setApproach(null);
      approachCumRef.current = [];
      fallbackRef.current = true; setFallback(true);
    }

    indexRef.current = 1;
    setStepIndex(1);
    trailRef.current = 0;
    setTrailIdx(0);
    preparedRef.current = new Set();
    executedRef.current = new Set();
    setDistanceM(null);
    mapBearingSeededRef.current = false;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    legRef.current = "approach";
    setLeg("approach");
    setBusy(false);
    await startWatch();
  }, [startWatch]);

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
    finishAndNavigate(Date.now());
  }, [finishAndNavigate]);

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
  // "straying" is deliberately excluded: it is the silent phase, and a driver
  // who has merely clipped a wide roundabout should see nothing change.
  const offRoute = leg === "test" && (offPhase === "off-route" || offPhase === "returning");
  // Everything stacked under the top slot moves down while the amber banner
  // occupies it, so the clock and the zone toast are never hidden behind it.
  const offRouteShift = offRoute ? OFF_ROUTE_BANNER_H : 0;
  const pillTop = insets.top + PILL_TOP_GAP + offRouteShift;
  const controlsBottom = CONTROLS_BOTTOM + insets.bottom;

  const distToStart = previewLoc && routeLL[0] ? haversineM(previewLoc, routeLL[0]) : null;
  const atStart = distToStart !== null && distToStart < AT_START_M;

  // The polyline being driven. One rule on both legs: green is road still to
  // drive, grey is road already driven — so the approach is drawn exactly as
  // the test route is, and the banner is what says which one this is.
  const activeLL = leg === "approach" && approach ? approach.coords : routeLL;
  const approachStep = approach?.steps[stepIndex];
  const approachNext = approach?.steps[stepIndex + 1];

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-8">
        <Text className="text-center text-[15px] font-semibold text-primary">Location access is needed to mark a mock test.</Text>
        <Text className="text-center text-[12px] text-slate-500">Enable it in Settings → Privacy → Location Services.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry location"
          onPress={() => {
            lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, { type: "RETRY_LOCATION" });
            const resume = failedLegRef.current === "location-unavailable" ? "preview" : failedLegRef.current;
            legRef.current = resume;
            setLeg(resume);
            setPermissionDenied(false);
            void startWatch();
          }}
          className="mt-2 min-h-[44px] items-center justify-center rounded-lg bg-accent px-6"
        >
          <Text className="text-[14px] font-semibold text-white">Retry location</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openSettings()} className="min-h-[44px] items-center justify-center rounded-lg border-[1.5px] border-slate-200 px-6">
          <Text className="text-[14px] font-semibold text-primary">Open settings</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="min-h-[44px] items-center justify-center px-6">
          <Text className="text-[14px] font-semibold text-primary">Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <NavMap
        ref={mapRef}
        routeLL={activeLL}
        trailIdx={trailIdx}
        // The puck is the driver on the leg being driven, and there is no
        // driver to draw while the route is only being looked at.
        pos={leg === "preview" ? null : pos}
        iconRotation={iconRotation}
        follow={following}
        onFollowChange={setFollowing}
        preview={leg === "preview"}
        start={routeLL[0] ?? null}
        // A loop finishes where it starts, so the flag would land on the start
        // dot and hide it.
        finish={!isLoop ? routeLL[routeLL.length - 1] ?? null : null}
        // Hidden on the way to the start: the zones belong to the test route,
        // and drawn over the approach they are discs floating off the line
        // being driven, marking places the driver is not being assessed on yet.
        observationZones={leg === "approach" ? NO_ZONES : observationZones}
        returnLL={returnLeg?.coords ?? undefined}
        dimRoute={offRoute}
        // The examiner sheet only exists once the test does; on the other legs
        // NavMap's own default clears the bottom chrome.
        logoBottom={leg === "test" ? logoBottom : undefined}
      />

      {/* ---------- PREVIEW ---------- */}
      {leg === "preview" && route && (
        <RoutePreviewCard
          route={route}
          isLoop={isLoop}
          distToStart={distToStart}
          atStart={atStart}
          busy={busy}
          onGuideToStart={guideToStart}
          onStartHere={startDirectly}
          onBack={() => router.back()}
        />
      )}

      {/* ---------- AT THE START ---------- */}
      {leg === "at-start" && route && (
        held ? (
          <View
            className="absolute bottom-0 left-0 right-0 bg-card px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 12, shadowColor: "#221F1C", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}
          >
            <Pressable accessibilityRole="button" accessibilityLabel="Begin route" onPress={beginTest} className="min-h-[52px] items-center justify-center rounded-lg bg-accent active:bg-accent-pressed">
              <Text className="text-[16px] font-semibold text-white">Begin route</Text>
            </Pressable>
          </View>
        ) : (
          <RouteStartPrompt
            visible
            routeName={route.name}
            detail={`${route.distance_km?.toFixed(1)} km · ${route.estimated_minutes} min`}
            onBegin={beginTest}
            onWait={() => setHeld(true)}
          />
        )
      )}

      {/* ---------- HEADING TO THE START ---------- */}
      {leg === "approach" && (
        <>
          {fallback && (
            <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
              <View style={{ transform: [{ rotate: `${crowRot}deg` }] }}>
                <Ionicons name="navigate" size={96} color="rgba(5,150,105,0.85)" />
              </View>
            </View>
          )}

          <View className="absolute left-3 right-3" style={{ top: insets.top + 6 }}>
            <ManeuverBanner
              eyebrow="Heading to the start"
              fallback={fallback}
              step={approachStep}
              next={approachNext}
              arriveLabel="then the mock test begins"
              distanceM={fallback ? directDist : distanceM}
            />
          </View>

          <Pressable
            onPress={recenter}
            className="absolute right-4 h-12 w-12 items-center justify-center rounded-full bg-card"
            style={{ bottom: 100, shadowColor: "#221F1C", shadowOpacity: 0.18, shadowRadius: 8 }}
          >
            <Ionicons name="navigate" size={20} color={colors.accent} />
          </Pressable>

          <View
            className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 bg-card px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 12, shadowColor: "#221F1C", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}
          >
            <View className="flex-1">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">To the start</Text>
              <Text className="text-[18px] font-semibold text-primary">
                {fallback
                  ? (directDist === null ? "—" : formatDistance(directDist))
                  : (remaining === null ? "—" : formatDistance(remaining))}
              </Text>
            </View>
            {/* Nothing has been assessed yet, so there is nothing to score and
                nothing to discard — this leaves rather than finishing. */}
            <Pressable
              onPress={() => { stopWatching(); router.back(); }}
              className="min-h-[44px] items-center justify-center rounded-full bg-danger px-7"
            >
              <Text className="text-[14px] font-semibold text-white">Stop</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ---------- MOCK TEST ---------- */}
      {leg === "test" && (
      <>
      {offRoute && (
        <View className="absolute left-3 right-3 z-10" style={{ top: insets.top + 6 }}>
          <ManeuverBanner
            tone="off"
            eyebrow="Off route"
            // Until the return leg lands there is no turn to give, so the
            // banner says what is happening rather than showing a stale
            // instruction from the route the driver has left.
            fallback={!returnLeg}
            fallbackText="Rejoining the route"
            step={returnLeg?.steps?.[0]}
            next={returnLeg?.steps?.[1]}
            distanceM={null}
            distanceLabel={
              skippedM !== null ? `Rejoining — ${formatDistance(skippedM)} skipped` : "Rejoining ahead"
            }
          />
        </View>
      )}

      <View
        className="absolute left-4 right-4 flex-row items-center justify-between rounded-xl bg-card px-4 py-2.5"
        style={{ top: insets.top + 6 + offRouteShift, shadowColor: "#221F1C", shadowOpacity: 0.12, shadowRadius: 12 }}
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
          style={{ top: insets.top + ZONE_TOAST_TOP_GAP + offRouteShift }}
        >
          Observation zone — check your mirrors
        </Text>
      )}

      {/* Below the zone toast, not the controls row — see PILL_TOP_GAP above
          for why the pill lives at the top of the screen now. Bounded left
          and right so a long label wraps inside the screen instead of running
          off both edges. Only the most pressing habitual category is shown;
          the per-category badges inside the sheet cover the rest. */}
      {warns[0] && (
        <View pointerEvents="none" className="absolute left-4 right-4 items-center" style={{ top: pillTop }}>
          <ExaminerWarningPill warning={warns[0]} />
        </View>
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
            style={{ shadowColor: "#221F1C", shadowOpacity: 0.18, shadowRadius: 8 }}
          >
            <Ionicons name="navigate" size={20} color={colors.accent} />
          </Pressable>
        </View>
      </View>

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

      </>
      )}

      {leg === "finish-prompt" && route && (
        <RouteFinishPrompt
          visible
          routeName={route.name}
          onKeepDriving={keepDriving}
          onEnd={endTest}
        />
      )}
    </View>
  );
}
