import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { BackgroundLayer, Camera, CircleLayer, FillLayer, LineLayer, MapView, MarkerView, ShapeSource } from "@rnmapbox/maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NAV_ZOOM_MID } from "@/lib/navigation";
import type { LatLng } from "@/lib/geo";
import type { ObservationZone } from "@/types/db";
import { lineWidthExpression, mapColors, ROAD_OUTLINE_PX, roadLayers, roadWidths, trafficLayerIds } from "@/ui/mapStyle";
import { NavPuck, PUCK_SIZE } from "@/ui/NavPuck";

const NAV_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const NAV_PITCH = 55;
// Camera pushes are driven by the GPS callback, not by a timer, so the ease has
// to span the gap between fixes or the map steps rather than glides. That gap
// is 500 ms at best: watchPositionAsync asks for timeInterval 500, and on
// Android expo-location also sets minUpdateIntervalMillis to the same value
// (node_modules/expo-location/.../LocationHelpers.kt), while on iOS
// timeInterval is ignored entirely and CLLocationManager delivers about 1 Hz.
// So this wants to sit a shade under the fastest realistic cadence; tune on
// device, where the true iOS rate is measurable.
const CAM_ANIM_MS = 600;
const PUCK_SCREEN_FRACTION = 0.62; // how far down the screen the driver sits
const PAN_THRESHOLD_PX = 10;    // finger movement beyond this counts as a pan, not a tap

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

// Observation zones: a soft amber disc sized in metres, so it grows with the
// zoom the way the road does rather than staying a fixed blob of pixels. Amber
// rather than the route's emerald — it marks a place to look, not a place to
// drive — and low opacity, because the road underneath is what is being driven.
//
// The design draws the edge dashed. A CircleLayer has no dash — that would
// want a generated polygon and a LineLayer — so the edge is solid here. Every
// other value matches docs/design/2026-08-04-mock-test-map.html.
const ZONE_COLOUR = "#D97706";
const ZONE_FILL_OPACITY = 0.13;
const ZONE_EDGE_OPACITY = 0.8;
const ZONE_EDGE_PX = 2;
// Web Mercator metres per pixel at zoom 0 on the equator. A disc of r metres is
// r / (M0 * cos(lat)) pixels at zoom 0 and doubles with every zoom level, so
// the latitude term is baked into each feature and the zoom term is left to an
// exponential-base-2 interpolation between the two ends of the zoom range.
const M_PER_PX_Z0 = 156543.03392;
const ZONE_PX_AT_Z0 = 1 / M_PER_PX_Z0;
const ZONE_PX_AT_Z22 = 4194304 / M_PER_PX_Z0; // 2^22
const zoneRadius = [
  "interpolate", ["exponential", 2], ["zoom"],
  0, ["*", ["get", "r"], ZONE_PX_AT_Z0],
  22, ["*", ["get", "r"], ZONE_PX_AT_Z22],
] as any;

export type NavMapHandle = {
  recenter: () => void;
  fitBounds: () => void;
  /**
   * Push the camera to a fix. Imperative rather than an effect on `pos`,
   * because an effect would also fire for a `pos` set outside a GPS callback
   * — the one-off fix taken before watching starts — and move the camera
   * where it does not move today.
   */
  pushCamera: (centre: LatLng, heading: number, zoom: number) => void;
};

export type NavMapProps = {
  routeLL: LatLng[];              // the full active polyline
  trailIdx: number;               // split point: grey behind, emerald ahead
  pos: LatLng | null;             // already-snapped position; null hides the puck
  iconRotation: number;
  follow: boolean;
  onFollowChange: (following: boolean) => void;
  // The route is being framed, not driven: the whole polyline is drawn as one
  // line, the bounds are fitted once the map has loaded, and gestures do not
  // cancel follow because they would fight that fit.
  preview?: boolean;
  start?: LatLng | null;          // start marker; null draws none
  finish?: LatLng | null;         // finish marker; null draws none (a loop passes null)
  // Drawn as amber discs; default none. Pass a stable reference — the GeoJSON
  // is rebuilt whenever this array's identity changes, and the compass
  // re-renders the screen about fifteen times a second, so an array literal
  // would re-upload every zone's geometry on each of them.
  observationZones?: ObservationZone[];
  // Mapbox's terms require the logo and attribution notice to stay visible.
  // 92 pt clears practice.tsx's bottom bar; a caller with its own bottom
  // chrome (mock.tsx's examiner sheet) overrides this to clear its own.
  logoBottom?: number;
  children?: ReactNode;           // extra map overlays, e.g. hazard pins
};

export const NavMap = forwardRef<NavMapHandle, NavMapProps>(function NavMap(
  {
    routeLL,
    trailIdx,
    pos,
    iconRotation,
    follow,
    onFollowChange,
    preview = false,
    start = null,
    finish = null,
    observationZones,
    logoBottom = 92,
    children,
  },
  ref
) {
  const cameraRef = useRef<Camera>(null);
  const mapHeightRef = useRef(0);
  const followingRef = useRef(follow);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // What the camera was last asked for. Seeded with the bearing and zoom a
  // caller starts a leg at, so a recenter before the first fix behaves as it
  // did when these were the caller's own two refs.
  const lastCameraRef = useRef({ heading: 0, zoomLevel: NAV_ZOOM_MID });

  useEffect(() => { followingRef.current = follow; }, [follow]);

  // Drive the camera by hand. followUserLocation would centre on the raw GPS
  // fix and rotate to the raw compass, both of which are exactly what we are
  // trying to filter out, and neither is reachable from JS.
  // There is deliberately no throttle here: expo-location cannot deliver faster
  // than the 500 ms it is asked for on either platform, so one would only ever
  // drop fixes the camera needs.
  const pushCamera = useCallback((centre: LatLng, heading: number, zoomLevel: number) => {
    // Recorded before the follow guard: fixes keep arriving while the driver
    // has the map panned away, and recenter has to jump to the newest one
    // rather than to wherever following was switched off.
    lastCameraRef.current = { heading, zoomLevel };
    if (!followingRef.current) return;

    // Padding shifts the camera centre down the screen so more road is visible
    // ahead: centreFraction = 0.5 + paddingTop / (2 * height).
    const paddingTop = mapHeightRef.current * (PUCK_SCREEN_FRACTION - 0.5) * 2;

    cameraRef.current?.setCamera({
      centerCoordinate: [centre.lng, centre.lat],
      heading,
      zoomLevel,
      pitch: NAV_PITCH,
      padding: { paddingTop, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
      animationDuration: CAM_ANIM_MS,
      animationMode: "easeTo",
    });
  }, []);

  // Re-lock the camera onto the driver after they've panned the map. The ref is
  // written before the push, not left to the effect above: onFollowChange goes
  // through the caller's state and has not flushed yet, so pushCamera would
  // still read the old false and bail.
  const recenter = useCallback(() => {
    followingRef.current = true;
    onFollowChange(true);
    const { heading, zoomLevel } = lastCameraRef.current;
    if (pos) pushCamera(pos, heading, zoomLevel);
  }, [onFollowChange, pos, pushCamera]);

  const fitBounds = useCallback(() => {
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

  useImperativeHandle(ref, () => ({ recenter, fitBounds, pushCamera }), [recenter, fitBounds, pushCamera]);

  // Waze-style base: wide white roads on warm off-white land, with parks and
  // water carrying the only other colour. Applied as overrides on the loaded
  // style's own layers rather than a fork of the whole style.
  //
  // Every road class is drawn three times by this style — at grade, on a
  // bridge, and in a tunnel — so the table in mapStyle.ts covers all three.
  // Styling only the "road-" set left a carriageway changing colour and width
  // halfway across a flyover. `npm run check:map-style` verifies every id
  // against the live style, because a wrong `existing` id is a silent no-op.
  //
  // Memoised: this is ~60 static elements and the compass re-renders this
  // screen about fifteen times a second.
  const baseLayers = useMemo(() => (
    <>
      <BackgroundLayer id="land" existing style={{ backgroundColor: mapColors.land }} />
      <FillLayer id="landuse" existing style={{ fillColor: mapColors.park }} />
      <FillLayer id="water" existing style={{ fillColor: mapColors.water }} />
      <FillLayer id="building" existing style={{ fillColor: mapColors.building }} />

      {/* On a "-case" layer lineWidth is the outline thickness per side and
          lineGapWidth is the hole the fill sits in, so the gap carries the
          fill's width table. It must track that fill exactly or the outline
          stops sitting flush. */}
      {roadLayers.map((l) =>
        l.kind === "case" ? (
          <LineLayer key={l.id} id={l.id} existing style={{ lineColor: mapColors.roadCasing, lineGapWidth: lineWidth(roadWidths[l.width]), lineWidth: ROAD_OUTLINE_PX }} />
        ) : l.kind === "fill" ? (
          <LineLayer key={l.id} id={l.id} existing style={{ lineColor: l.color, lineWidth: lineWidth(roadWidths[l.width]) }} />
        ) : (
          <LineLayer key={l.id} id={l.id} existing style={{ lineColor: l.color }} />
        )
      )}

      {/* Congestion ribbons, hidden: traffic is out of scope, their "low"
          green would outshine the emerald route, and their line-offset is
          interpolated against stock widths so they no longer sit on the road. */}
      {trafficLayerIds.map((id) => (
        <LineLayer key={id} id={id} existing style={{ lineOpacity: 0 }} />
      ))}
    </>
  ), []);

  const zoneShape = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (observationZones ?? []).map((z, i) => ({
      type: "Feature" as const,
      id: i,
      properties: { r: z.radiusM / Math.cos((z.lat * Math.PI) / 180) },
      geometry: { type: "Point" as const, coordinates: toPos(z) },
    })),
  }), [observationZones]);

  // Memoised on the only two inputs that can change the geometry. Both callers
  // re-render at the compass tick (~15 Hz) and rnmapbox pushes a ShapeSource's
  // whole polyline across the bridge whenever `shape` changes identity — a few
  // thousand coordinates on a real route, fifteen times a second, for the
  // length of a test. trailIdx only advances on a GPS fix, so this drops the
  // uploads to the fix rate.
  //
  // Nothing is driven until the trail index has actually advanced. The old
  // Math.max(trailIdx, 1) floor always produced a two-vertex stub, which was
  // invisible while both halves were the same emerald and would now show as a
  // grey tick sitting at the start line before the driver has moved.
  const traveledFeature = useMemo(() => {
    const traveled = trailIdx > 0 ? routeLL.slice(0, trailIdx + 1) : [];
    return traveled.length > 1 ? lineFeature(traveled) : null;
  }, [routeLL, trailIdx]);

  const aheadFeature = useMemo(() => {
    const ahead = routeLL.slice(trailIdx);
    return ahead.length > 1 ? lineFeature(ahead) : null;
  }, [routeLL, trailIdx]);

  const previewFeature = useMemo(
    () => (routeLL.length > 1 ? lineFeature(routeLL) : null),
    [routeLL]
  );

  return (
    <MapView
      style={{ flex: 1 }} styleURL={NAV_STYLE} scaleBarEnabled={false} compassEnabled={false}
      // Rotate and pitch are ours to set, the way they are in Waze and Google
      // Maps in nav mode. This is also what makes the icon's angle sound:
      // nothing but setCamera can change the map bearing, so the map bearing
      // is always exactly what the caller last pushed.
      rotateEnabled={false} pitchEnabled={false}
      logoPosition={{ bottom: logoBottom, left: 8 }} attributionPosition={{ bottom: logoBottom, right: 8 }}
      onDidFinishLoadingMap={() => { if (preview) fitBounds(); }}
      onLayout={(e) => { mapHeightRef.current = e.nativeEvent.layout.height; }}
      onTouchStart={(e) => {
        const t = e.nativeEvent.touches[0];
        touchStartRef.current = t ? { x: t.pageX, y: t.pageY } : null;
      }}
      onTouchMove={(e) => {
        // A tap (e.g. opening a hazard callout, or the puck itself) fires
        // touchStart/End with no real movement; only a genuine drag should
        // cancel follow. Anything under the threshold is left alone.
        if (preview) return;
        const startPt = touchStartRef.current;
        const t = e.nativeEvent.touches[0];
        if (!startPt || !t) return;
        const moved = Math.hypot(t.pageX - startPt.x, t.pageY - startPt.y);
        if (moved > PAN_THRESHOLD_PX) onFollowChange(false);
      }}
      // Backstop for the touch handlers above, which depend on RN touch
      // events surviving Mapbox's native gesture recognisers — unverified on
      // device, and if they do not, the map cannot be panned at all. This
      // signal comes from the native side instead, so it also catches a
      // pinch, which may never deliver a JS touch move. Preview is excluded
      // so it cannot fight fitBounds.
      onCameraChanged={(s) => {
        // Fires once per frame of any camera move, including our own, so bail
        // out on two cheap reads before touching state.
        if (!followingRef.current || preview) return;
        if (s.gestures?.isGestureActive) onFollowChange(false);
      }}
    >
      <Camera ref={cameraRef} />

      {baseLayers}

      {zoneShape.features.length > 0 && (
        <ShapeSource id="zones" shape={zoneShape}>
          {/* A CircleLayer cannot dash its stroke — that would want a polygon
              and a LineLayer — so the edge is a solid line at low opacity. */}
          <CircleLayer
            id="zoneDiscs"
            style={{
              circleRadius: zoneRadius,
              circleColor: ZONE_COLOUR,
              circleOpacity: ZONE_FILL_OPACITY,
              circleStrokeColor: ZONE_COLOUR,
              circleStrokeWidth: ZONE_EDGE_PX,
              circleStrokeOpacity: ZONE_EDGE_OPACITY,
              // The camera is pitched (NAV_PITCH), and the default "viewport"
              // alignment would draw these as screen-facing billboards
              // standing up out of the road. A zone is a patch of tarmac, so
              // it has to lie flat on it.
              circlePitchAlignment: "map",
            }}
          />
        </ShapeSource>
      )}

      {preview ? (
        previewFeature && (
          <ShapeSource id="route" shape={previewFeature}>
            <LineLayer id="routeCasing" style={{ lineColor: mapColors.routeCasing, lineWidth: 15, lineCap: "round", lineJoin: "round" }} />
            <LineLayer id="routeCore" style={{ lineColor: mapColors.routeCore, lineWidth: 10, lineCap: "round", lineJoin: "round" }} />
          </ShapeSource>
        )
      ) : (
        <>
          {traveledFeature && (
            <ShapeSource id="trail" shape={traveledFeature}>
              <LineLayer id="trailCasing" style={{ lineColor: mapColors.routeDrivenCasing, lineWidth: 14, lineCap: "round", lineJoin: "round" }} />
              <LineLayer id="trailCore" style={{ lineColor: mapColors.routeDrivenCore, lineWidth: 9, lineCap: "round", lineJoin: "round" }} />
            </ShapeSource>
          )}
          {aheadFeature && (
            <ShapeSource id="ahead" shape={aheadFeature}>
              <LineLayer id="aheadCasing" style={{ lineColor: mapColors.routeCasing, lineWidth: 16, lineCap: "round", lineJoin: "round" }} />
              <LineLayer id="aheadCore" style={{ lineColor: mapColors.routeCore, lineWidth: 11, lineCap: "round", lineJoin: "round" }} />
            </ShapeSource>
          )}
        </>
      )}

      {start && (
        <MarkerView id="start" coordinate={toPos(start)} anchor={{ x: 0.5, y: 0.5 }}>
          <View className="h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-accent"><View className="h-2 w-2 rounded-full bg-white" /></View>
        </MarkerView>
      )}
      {finish && (
        <MarkerView id="finish" coordinate={toPos(finish)} anchor={{ x: 0.5, y: 1 }}>
          <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary"><Ionicons name="flag" size={14} color="#fff" /></View>
        </MarkerView>
      )}
      {children}
      {pos && (
        <MarkerView id="puck" coordinate={toPos(pos)} anchor={{ x: 0.5, y: 0.5 }} style={{ width: PUCK_SIZE, height: PUCK_SIZE }}>
          {/* Drawn at its angle relative to the map, not to north: rotate
              gestures are off and a pan only translates the centre, so the
              map bearing is always exactly what setCamera last applied.
              Mounted facing forward this comes out at 0 on its own. */}
          <NavPuck rotation={iconRotation} />
        </MarkerView>
      )}
    </MapView>
  );
});
