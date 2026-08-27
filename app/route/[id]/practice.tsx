import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PointAnnotation } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getRoute } from "@/services/routesRepo";
import { fetchDirections, Directions } from "@/services/directions";
import { advance, ANNOUNCE_M, AT_START_M, formatDistance, NAV_ZOOM_FAR, NAV_ZOOM_MID, rebaseRouteCursor, remainingM, routeProgress } from "@/lib/navigation";
import { bearingDeg, cumulativeM, haversineM, iconRotationDeg, LatLng, mpsToMph, smoothHeading, snapToPath } from "@/lib/geo";
import { COMPASS_ALPHA, ICON_TICK_MS, LOOP_CLOSE_M, navFix, navSnap } from "@/lib/navmap";
import { chooseRejoin, departureLine, initialOffRoute, REJOINED_LINE, SKIP_WARN_M, stepOffRoute, type OffRouteState, type Rejoin } from "@/lib/offRoute";
import { stitchLegs } from "@/lib/navsteps";
import { createRouteLifecycle, qualifyLocationFix, routeLifecycleReducer, type RouteFix } from "@/lib/routeLifecycle";
import type { Hazard, NavStep, Route } from "@/types/db";
import { DriveChrome } from "@/ui/DriveChrome";
import { RoutePreviewCard } from "@/ui/RoutePreviewCard";
import { RouteFinishPrompt } from "@/ui/RouteFinishPrompt";
import { RouteStartPrompt } from "@/ui/RouteStartPrompt";
import { FACES } from "@/ui/type";
import { NavMap, NavMapHandle } from "@/ui/NavMap";

// Two rotations, two sources. The MAP turns only when the vehicle travels in a
// new direction, so it holds still at a red light however the phone is waved
// about. The ICON turns with the compass, drawn at its angle relative to the
// map — mounted facing forward the two agree and it sits upright by itself.
// The map's half of this (snap, heading filter, deadband) lives in navFix;
// COMPASS_ALPHA and ICON_TICK_MS (the icon's own, lighter filter and redraw
// throttle) live in src/lib/navmap.ts, shared with mock.tsx, so tuning one
// screen on device does not silently diverge from the other.

// "at-start" is the pause on the start line, after being guided there. It used
// not to exist: reaching the start called beginRoute() straight from the GPS
// callback, so the drive began itself while the phone was still in the
// driver's hand. Nothing is narrated or counted in this phase — the watch
// keeps running only so the map stays alive under the card.
type Phase = "preview" | "approach" | "at-start" | "route" | "finish-prompt" | "finished";

export default function Practice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A practice loop runs about forty minutes with the phone mounted and
  // untouched, which is exactly the condition iOS auto-lock is built to end.
  // Scoped to this screen rather than set globally: the lock should come back
  // the moment the drive does not need the map. Released on unmount.
  useKeepAwake();

  const [route, setRoute] = useState<Route | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [phase, setPhase] = useState<Phase>("preview");
  // "Not yet" on the arrival card. The card gives way to a bar carrying the
  // same action, so a learner who wants a minute at the kerb gets one without
  // the drive becoming two taps away again.
  const [held, setHeld] = useState(false);
  const [approach, setApproach] = useState<Directions | null>(null);
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewLoc, setPreviewLoc] = useState<LatLng | null>(null);
  // The way back onto the route, and how far off it we are. Held in state as
  // well as a ref because both the map and the banner render from them.
  const [returnLeg, setReturnLeg] = useState<Directions | null>(null);
  const [offPhase, setOffPhase] = useState<OffRouteState["phase"]>("on-route");
  // Metres of route the chosen rejoin skips, or null when nothing is skipped
  // worth naming. State rather than read off rejoinRef at render time — a ref
  // read during render is not reactive, and React forbids it.
  const [skippedM, setSkippedM] = useState<number | null>(null);

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
  // cumulativeM of each leg's polyline, so routeComplete can measure progress
  // in metres. Held per leg because the two legs are different lines.
  const routeCumRef = useRef<number[]>([]);
  const approachCumRef = useRef<number[]>([]);
  // Latches the end of a leg. routeComplete stays true once it is true, and
  // this callback runs several times a second.
  const completedRef = useRef(false);
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
  const offRef = useRef<OffRouteState>(initialOffRoute);
  const returnLegRef = useRef<Directions | null>(null);
  const rejoinRef = useRef<Rejoin | null>(null);
  // Guards the directions fetch. The GPS callback runs several times a second
  // and a departure stays true until the driver is back on the line, so
  // without this one wrong turn queues a call per fix.
  const fetchingReturnRef = useRef(false);
  const lifecycleRef = useRef(createRouteLifecycle());

  useEffect(() => {
    getRoute(id).then((r) => { setRoute(r.data.route); setHazards(r.data.hazards); }).catch(() => {});
  }, [id]);

  const routeLL = useMemo(
    () => (route?.geometry.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    [route]
  );
  // Stitched on the way in. The rows in Supabase were written by flattening
  // OSRM's legs, so a loop planned through three waypoints carries three
  // mid-route "You have reached the end of the route" steps — see stitchLegs.
  const routeSteps = useMemo(() => stitchLegs(route?.steps ?? []), [route]);
  const routeCum = useMemo(() => cumulativeM(routeLL), [routeLL]);
  const isLoop = useMemo(
    () => routeLL.length > 1 && haversineM(routeLL[0], routeLL[routeLL.length - 1]) < LOOP_CLOSE_M,
    [routeLL]
  );

  useEffect(() => {
    routeLLRef.current = routeLL;
    routeStepsRef.current = routeSteps;
    routeCumRef.current = routeCum;
    startRef.current = routeLL[0] ?? null;
  }, [routeLL, routeSteps, routeCum]);

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
    completedRef.current = false;
    preparedRef.current = new Set();
    executedRef.current = new Set();
    setStepIndex(startIndex);
    setTrailIdx(0);
    setDistanceM(null);
    // A new leg means a new active polyline (approach vs. route), which can
    // carry an unrelated bearing — re-seed rather than ease from the old one.
    mapBearingSeededRef.current = false;
  };

  /**
   * Clear any off-route state. Called when a leg begins, so a departure on the
   * approach leg cannot leak into the drive itself.
   */
  const resetOffRoute = useCallback(() => {
    offRef.current = initialOffRoute;
    rejoinRef.current = null;
    returnLegRef.current = null;
    setOffPhase("on-route");
    setReturnLeg(null);
    setSkippedM(null);
  }, []);

  // Reaching the start line. The drive does not begin here — the card does.
  const reachStart = useCallback(() => {
    phaseRef.current = "at-start";
    setPhase("at-start");
    setHeld(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak("You've reached the start.", { language: "en-GB" });
  }, []);

  const beginRoute = useCallback(async () => {
    let lastFixAt = lifecycleRef.current.lastAcceptedFix?.timestamp ?? 0;
    if (Date.now() - lastFixAt > 5_000) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
        const raw = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        const start = startRef.current;
        const distanceToStart = start ? haversineM(raw, start) : Infinity;
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
    if (lifecycle.phase !== "active") return;
    phaseRef.current = "route";
    fallbackRef.current = false;
    setPhase("route");
    setFallback(false);
    resetLeg(1);
    resetOffRoute();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Speech.speak("Beginning the route.", { language: "en-GB" });
  }, [resetOffRoute]);

  const endRoute = useCallback(() => {
    lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
      type: "END_REQUESTED",
      at: Date.now(),
    });
    if (lifecycleRef.current.phase !== "complete") return;
    stopWatching();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    phaseRef.current = "finished";
    setPhase("finished");
  }, [stopWatching]);

  const keepDriving = useCallback(() => {
    lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, { type: "KEEP_DRIVING" });
    phaseRef.current = "route";
    setPhase("route");
  }, []);

  useEffect(() => {
    if (!routeLL.length) return;
    let active = true;
    let previewSub: Location.LocationSubscription | null = null;

    void (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!active || status !== "granted" || phaseRef.current !== "preview") return;
      previewSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 1_000 },
        (loc) => {
          if (phaseRef.current !== "preview") return;
          const start = startRef.current;
          if (!start) return;
          const raw = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setPreviewLoc(raw);
          const value: RouteFix = {
            lat: raw.lat,
            lng: raw.lng,
            timestamp: loc.timestamp,
            accuracyM: loc.coords.accuracy ?? Infinity,
            speedMph: mpsToMph(Math.max(0, loc.coords.speed ?? 0)),
            routeDistanceM: haversineM(raw, start),
            startDistanceM: haversineM(raw, start),
            finishDistanceM: haversineM(raw, routeLLRef.current.at(-1) ?? start),
            routeProgress: 0,
            trailIdx: 0,
          };
          const receivedAt = Math.max(Date.now(), value.timestamp);
          lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
            type: "FIX_RECEIVED",
            fix: value,
            receivedAt,
          });
          if (lifecycleRef.current.phase === "start-prompt") reachStart();
        },
        () => {
          lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
            type: "LOCATION_FAILED",
            reason: "watch-failed",
          });
          setPermissionDenied(true);
        },
      );
      if (!active) previewSub.remove();
      else subRef.current = previewSub;
    })();

    return () => {
      active = false;
      previewSub?.remove();
      if (subRef.current === previewSub) subRef.current = null;
    };
  }, [reachStart, routeLL.length]);

  // Re-lock the camera onto the driver after they've panned the map.
  const recenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.recenter();
  };

  /**
   * Fetch the way back onto the route.
   *
   * Never awaited by the GPS callback: that runs on every fix, and awaiting
   * here would serialise the whole nav loop behind a network call that can
   * take seconds. The result lands in a ref, and the next fix picks it up.
   */
  const fetchReturnLeg = useCallback(async (from: LatLng, rejoin: Rejoin) => {
    if (fetchingReturnRef.current) return;
    fetchingReturnRef.current = true;
    try {
      const dirs = await fetchDirections(from, rejoin.point);
      returnLegRef.current = dirs;
      setReturnLeg(dirs);
      const requestId = lifecycleRef.current.recoveryRequestId;
      if (requestId) {
        lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
          type: "RECOVERY_READY",
          requestId,
          rejoinIdx: rejoin.idx,
        });
      }
    } catch {
      // No directions available. The banner still says "off route" and the
      // route stays drawn, which is more use at the wheel than an error the
      // driver cannot act on.
      returnLegRef.current = null;
      setReturnLeg(null);
    } finally {
      fetchingReturnRef.current = false;
    }
  }, []);

  const onPosition = useCallback((loc: Location.LocationObject) => {
    const c = loc.coords;
    const raw = { lat: c.latitude, lng: c.longitude };
    const mph = Math.round(mpsToMph(Math.max(0, c.speed ?? 0)));
    setSpeedMph(mph);

    const ph = phaseRef.current;
    const start = startRef.current;
    const coords = ph === "route" ? routeLLRef.current : approachRef.current?.coords ?? [];
    const steps = ph === "route" ? routeStepsRef.current : approachRef.current?.steps ?? [];
    const cum = ph === "route" ? routeCumRef.current : approachCumRef.current;
    const isFallback = ph === "approach" && fallbackRef.current && !!start;
    const seeded = mapBearingSeededRef.current;

    const qualityProbe: RouteFix = {
      lat: raw.lat,
      lng: raw.lng,
      timestamp: loc.timestamp,
      accuracyM: c.accuracy ?? Infinity,
      speedMph: mph,
      routeDistanceM: 0,
      startDistanceM: start ? haversineM(raw, start) : Infinity,
      finishDistanceM: start ? haversineM(raw, routeLLRef.current.at(-1) ?? start) : Infinity,
      routeProgress: 0,
      trailIdx: trailRef.current,
    };
    if (!qualifyLocationFix(lifecycleRef.current, qualityProbe, Math.max(Date.now(), loc.timestamp))) {
      setPos(raw);
      return;
    }

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
    let acceptedTrailIdx = ph === "route" && !result.onRoute ? trailRef.current : result.trailIdx;
    setPos(p);
    mapBearingRef.current = result.mapBearing;
    mapBearingSeededRef.current = true;
    // The icon's angle is relative to the map, so a map that turned changes it
    // even when the phone did not move.
    setIconRotation(result.iconRotation);

    // Off-route applies to the route leg only. The approach is a drive to the
    // start line that the driver may legitimately take any way they like.
    if (ph === "route") {
      const departedBefore = offRef.current.departedIdx;
      const routeSnap = snapToPath(coords, raw, trailRef.current);
      // Searched end to end rather than through a window: the return leg is
      // short, and there is no trail index along it to window around.
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
        const rejoin = chooseRejoin(coords, cum, p, departedBefore ?? acceptedTrailIdx, mapBearingRef.current);
        rejoinRef.current = rejoin;
        returnLegRef.current = null;
        setReturnLeg(null);
        setSkippedM(rejoin && rejoin.skippedM >= SKIP_WARN_M ? rejoin.skippedM : null);
        if (rejoin) {
          // Spoken once, on leaving. A recompute is the app changing its own
          // mind, not the driver doing anything new, so it stays silent.
          if (event === "departed") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Speech.speak(departureLine(rejoin.skippedM), { language: "en-GB" });
          }
          void fetchReturnLeg(p, rejoin);
        }
      }

      if (event === "rejoined") {
        const cursor = rebaseRouteCursor(
          {
            trailIdx: trailRef.current,
            progressFloorIdx: lifecycleRef.current.progressFloorIdx,
            stepIdx: indexRef.current,
          },
          routeSnap?.idx ?? rejoinRef.current?.idx ?? acceptedTrailIdx,
          steps,
          coords,
        );
        trailRef.current = cursor.trailIdx;
        acceptedTrailIdx = cursor.trailIdx;
        indexRef.current = cursor.stepIdx;
        setTrailIdx(cursor.trailIdx);
        setStepIndex(cursor.stepIdx);
        rejoinRef.current = null;
        returnLegRef.current = null;
        setReturnLeg(null);
        setSkippedM(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Speech.speak(REJOINED_LINE, { language: "en-GB" });
      }
    }

    // Waiting on the start line for the driver to tap Begin. The map keeps up
    // with them; nothing is narrated, and no leg is being navigated.
    if (ph === "at-start") {
      const distanceToStart = start ? haversineM(raw, start) : Infinity;
      lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
        type: "FIX_RECEIVED",
        fix: {
          ...qualityProbe,
          routeDistanceM: distanceToStart,
          startDistanceM: distanceToStart,
          finishDistanceM: distanceToStart,
          trailIdx: 0,
        },
        receivedAt: Math.max(Date.now(), loc.timestamp),
      });
      mapRef.current?.pushCamera(p, mapBearingRef.current, zoomRef.current);
      return;
    }

    if (ph === "approach" && start) {
      const startFix: RouteFix = {
        ...qualityProbe,
        routeDistanceM: haversineM(p, start),
        startDistanceM: haversineM(p, start),
        finishDistanceM: haversineM(p, start),
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
    }

    if (ph === "route") {
      const routeSnap = offRef.current.phase === "off-route" || offRef.current.phase === "returning"
        ? snapToPath(coords, raw, 0, coords.length)
        : snapToPath(coords, raw, trailRef.current);
      const finish = coords.at(-1);
      const routeFix: RouteFix = {
        ...qualityProbe,
        routeDistanceM: routeSnap?.distM ?? Infinity,
        startDistanceM: start ? haversineM(p, start) : Infinity,
        finishDistanceM: finish ? haversineM(p, finish) : Infinity,
        routeProgress: routeProgress(cum, acceptedTrailIdx),
        trailIdx: acceptedTrailIdx,
      };
      lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
        type: "FIX_RECEIVED",
        fix: routeFix,
        receivedAt: Math.max(Date.now(), loc.timestamp),
      });
      if (lifecycleRef.current.phase === "finish-prompt") {
        phaseRef.current = "finish-prompt";
        setPhase("finish-prompt");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
    }

    // The end of a leg, decided from the trail index rather than the step
    // index — see routeComplete. Latched, because it stays true once true and
    // this callback runs several times a second.
    if (!isFallback && ph === "approach" && !completedRef.current && lifecycleRef.current.phase === "start-prompt") {
      completedRef.current = true;
      reachStart();
      return;
    }

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
    trailRef.current = acceptedTrailIdx;
    setTrailIdx(acceptedTrailIdx);

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

  }, [reachStart, fetchReturnLeg]);

  const zoomToMe = async () => {
    try {
      const f = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const p = { lat: f.coords.latitude, lng: f.coords.longitude };
      prevPosRef.current = p;
      setPos(p);
      return p;
    } catch { return null; }
  };

  // Memoised on `onPosition` alone, which is everything reactive it closes over
  // — the rest is refs and setters. That is deliberately the same dependency
  // the two callers below already had: they used to list `onPosition` directly
  // and call this as a plain function, which read as a missing dependency
  // because it was one. Naming it here means the callers depend on the thing
  // they actually call, and nothing about when they are rebuilt changes.
  const startWatch = useCallback(async () => {
    subRef.current?.remove();
    subRef.current = null;
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
      onPosition,
      () => {
        lifecycleRef.current = routeLifecycleReducer(lifecycleRef.current, {
          type: "LOCATION_FAILED",
          reason: "watch-failed",
        });
        setPermissionDenied(true);
      },
    );
  }, [onPosition]);

  useEffect(() => {
    if (phase !== "route" || headingSubRef.current) return;
    void startWatch();
  }, [phase, startWatch]);

  const ensurePermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setPermissionDenied(true); return false; }
    return true;
  };

  const startDirectly = useCallback(async () => {
    if (!(await ensurePermission())) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    approachRef.current = null;
    setApproach(null);
    fallbackRef.current = true;
    setFallback(true);
    phaseRef.current = "approach";
    setPhase("approach");
    resetLeg(1);
    await zoomToMe();
    await startWatch();
  }, [startWatch]);

  const guideToStart = useCallback(async () => {
    if (!(await ensurePermission())) return;
    setBusy(true);
    const me = await zoomToMe();
    const start = startRef.current;
    try {
      if (!me || !start) throw new Error("no fix");
      const dirs = await fetchDirections(me, start);
      approachRef.current = dirs; setApproach(dirs);
      approachCumRef.current = cumulativeM(dirs.coords);
      fallbackRef.current = false; setFallback(false);
    } catch {
      approachRef.current = null; setApproach(null);
      approachCumRef.current = [];
      fallbackRef.current = true; setFallback(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    phaseRef.current = "approach"; setPhase("approach");
    resetLeg(1);
    setBusy(false);
    await startWatch();
  }, [startWatch]);

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
  // "straying" is deliberately not included: it is the silent phase, and a
  // driver who has merely clipped a wide roundabout should see nothing change.
  const offRoute = offPhase === "off-route" || offPhase === "returning";

  return (
    <View className="flex-1">
      <NavMap
        ref={mapRef}
        routeLL={activeLL}
        trailIdx={trailIdx}
        // The puck is the driver on the leg being driven: none while the route
        // is being previewed, and none once it has been finished.
        pos={phase === "preview" || phase === "finished" ? null : pos}
        iconRotation={iconRotation}
        follow={following}
        onFollowChange={setFollowing}
        preview={phase === "preview"}
        start={start ?? null}
        // A loop finishes where it starts, so the flag would land on the start
        // dot and hide it.
        finish={finish && !isLoop ? finish : null}
        returnLL={returnLeg?.coords ?? undefined}
        dimRoute={offRoute}
      >
        {hazards.map((h) => (
          <PointAnnotation key={h.id} id={h.id} coordinate={[h.lng, h.lat]} onSelected={() => { setSelectedHazard(h); sheetRef.current?.snapToIndex(0); }}>
            <View className="h-4 w-4 rounded-full border-2 border-white bg-warning" />
          </PointAnnotation>
        ))}
      </NavMap>

      {/* ---------- PREVIEW ---------- */}
      {phase === "preview" && route && (
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
      {phase === "at-start" && route && (
        held ? (
          <View
            className="absolute bottom-0 left-0 right-0 bg-card px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 12, shadowColor: "#221F1C", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}
          >
            <Pressable accessibilityRole="button" accessibilityLabel="Begin route" onPress={beginRoute} className="min-h-[52px] items-center justify-center rounded-lg bg-accent active:bg-accent-pressed">
              <Text className="text-[16px] font-semibold text-white">Begin route</Text>
            </Pressable>
          </View>
        ) : (
          <RouteStartPrompt
            visible
            routeName={route.name}
            detail={`${route.distance_km?.toFixed(1)} km · ${route.estimated_minutes} min`}
            onBegin={beginRoute}
            onWait={() => setHeld(true)}
          />
        )
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
        <DriveChrome
          tone={offRoute ? "off" : "go"}
          eyebrow={offRoute ? "Off route" : isApproach ? "Heading to the start" : "Practice route"}
          distanceLabel={
            offRoute
              ? skippedM !== null ? `Rejoining · ${formatDistance(skippedM)} skipped` : "Rejoining ahead"
              : formatDistance((fallback ? directDist : distanceM) ?? 0)
          }
          instruction={
            offRoute
              ? returnLeg?.steps?.[0]?.instruction ?? "Head back toward route"
              : fallback ? "Head toward the start point" : current?.instruction ?? "Follow the route"
          }
          nextInstruction={
            offRoute
              ? returnLeg?.steps?.[1]?.instruction ?? null
              : next ? (isApproach && next.type === "arrive" ? "then the route begins" : `then ${next.instruction}`) : null
          }
          speedMph={speedMph}
          remainingLabel={
            isApproach && fallback
              ? directDist === null ? "—" : formatDistance(directDist)
              : remaining === null ? "—" : formatDistance(remaining)
          }
          following={following}
          onRecenter={recenter}
          onStop={() => { stopWatching(); router.back(); }}
        />
      )}

      {phase === "finish-prompt" && route && (
        <RouteFinishPrompt
          visible
          routeName={route.name}
          onKeepDriving={keepDriving}
          onEnd={endRoute}
        />
      )}

      {/* ---------- FINISHED ---------- */}
      {phase === "finished" && (
        <View className="absolute inset-0 items-center justify-center bg-primary/70 px-8">
          <View className="w-full items-center gap-2 rounded-3xl bg-card px-6 py-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Ionicons name="checkmark" size={34} color="#fff" /></View>
            <Text className="text-[20px] font-semibold tracking-tight text-primary" style={{ fontFamily: FACES["600"] }}>Route complete</Text>
            <Text className="text-[13px] text-slate-500">You navigated {route?.distance_km?.toFixed(1)} km of {route?.name}.</Text>
            <Pressable onPress={() => router.back()} className="mt-3 min-h-[48px] w-full items-center justify-center rounded-full bg-accent active:bg-accent-pressed">
              <Text className="text-[15px] font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      )}

      <BottomSheet ref={sheetRef} index={-1} snapPoints={["25%", "50%", "90%"]} enablePanDownToClose handleIndicatorStyle={{ backgroundColor: "#D8D1C8" }}>
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
