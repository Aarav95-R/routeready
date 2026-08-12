import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BackgroundLayer, Camera, CircleLayer, LineLayer, MapView, MarkerView, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import { useReducedMotion } from "react-native-reanimated";
import { haversineM, ringPolygon, type LatLng } from "@/lib/geo";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { Centre } from "@/types/db";
import { ActiveCentreMarker } from "@/ui/ActiveCentreMarker";
import { mapColors } from "@/ui/mapStyle";

const OVERVIEW_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const RING_MILES = [3, 8, 15];
const ACCENT = "#059669";
const PIN_STAGGER_MS = 70;
const RING_STAGGER_MS = 130;

// A frame of one point is degenerate bounds, and Mapbox answers those by
// zooming to the maximum — a street-level view of one pin, which is not what
// "fit what is left" means. Searching down to a single match reaches this
// routinely, so the bounds are widened to at least this span (~2.2km) first.
const MIN_SPAN_DEG = 0.02;

// The static layers draw everything except the centre the sheet is on; that
// one is a MarkerView so it can actually animate.
const INACTIVE = ["!", ["get", "active"]] as const;

// Every source below stays mounted for the life of the map and is handed an
// empty FeatureCollection when there is nothing to draw. Mounting and
// unmounting them is what produced the native "Source is not in style" crash
// the NavMap comment documents at length; the same trap is here.
const EMPTY = { type: "FeatureCollection" as const, features: [] };

export type CentresMapHandle = {
  /** Ease the camera onto one centre. */
  focus: (c: LatLng) => void;
  /** Refit the camera to the driver plus every pin. */
  fitAll: () => void;
};

export type CentresMapProps = {
  pins: Centre[];
  /**
   * What the camera must contain: the near set when there is a fix, every
   * centre when there is not. Kept separate from `pins` because the two
   * answer different questions — with no fix there are no pins at all, and
   * the map must still open framed on the country rather than on whatever
   * the base style happens to ship with.
   */
  frame: Centre[];
  identities: Map<string, CentreIdentity>;
  me: LatLng | null;
  activeId: string | null;
};

export const CentresMap = forwardRef<CentresMapHandle, CentresMapProps>(
  function CentresMap({ pins, frame, identities, me, activeId }, ref) {
    const camera = useRef<Camera>(null);

    // Pins and rings arrive in sequence rather than all at once. The reveal is
    // a count, not a per-frame geometry change: expanding the rings by
    // regenerating their vertices every frame would re-upload three polygons to
    // the native map sixty times a second, which is the churn NavMap's header
    // comment exists to warn about. They appear rather than fade — the changes
    // arrive as source data, and Mapbox's paint transitions only animate
    // changes to a property's own value.
    const reducedMotion = useReducedMotion();
    const [revealed, setRevealed] = useState(0);
    const [ringsShown, setRingsShown] = useState(0);

    // The stagger is a first impression, not a response to data. It keyed on
    // `pins` identity before, and `pins` is a fresh array on every recompute,
    // so one keystroke in search emptied the map and re-dropped every pin at
    // 70ms apiece.
    const staggered = useRef(false);

    useEffect(() => {
      const showEverything = () => { setRevealed(pins.length); setRingsShown(RING_MILES.length); };
      if (reducedMotion) { staggered.current = true; showEverything(); return; }
      if (staggered.current) { showEverything(); return; }

      // Nothing to make an entrance with yet; the first non-empty set owns it.
      if (!pins.length) return;

      staggered.current = true;
      const timers = [
        ...pins.map((_, i) => setTimeout(() => setRevealed(i + 1), (i + 1) * PIN_STAGGER_MS)),
        ...RING_MILES.map((_, i) => setTimeout(() => setRingsShown(i + 1), (i + 1) * RING_STAGGER_MS)),
      ];
      return () => timers.forEach(clearTimeout);
    }, [pins, reducedMotion]);

    const rings = useMemo(() => {
      if (!me) return EMPTY;
      return {
        type: "FeatureCollection" as const,
        features: RING_MILES.slice(0, ringsShown).map((mi) => ({
          type: "Feature" as const,
          properties: { miles: mi },
          geometry: ringPolygon(me, mi * 1609.34),
        })),
      };
    }, [me, ringsShown]);

    // Only a revealed pin gets a marker, so the entrance stagger still reads
    // as pins arriving rather than one of them jumping the queue.
    const activeCentre = pins.slice(0, revealed).find((c) => c.id === activeId) ?? null;
    const activeIdentity = activeCentre ? identities.get(activeCentre.id) ?? null : null;

    const pinShape = useMemo(() => ({
      type: "FeatureCollection" as const,
      features: pins.slice(0, revealed).map((c) => {
        const identity = identities.get(c.id);
        return {
          type: "Feature" as const,
          properties: {
            id: c.id,
            name: c.name,
            hue: identity?.hue ?? "#475569",
            initials: identity?.initials ?? "",
            active: c.id === activeId,
          },
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] as [number, number] },
        };
      }),
    }), [pins, identities, activeId, revealed]);

    const meShape = useMemo(() => {
      if (!me) return EMPTY;
      return {
        type: "FeatureCollection" as const,
        features: [{
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: [me.lng, me.lat] as [number, number] },
        }],
      };
    }, [me]);

    const fitAll = useCallback(() => {
      const points = frame.map((p) => [p.lng, p.lat] as [number, number]);
      if (me) points.push([me.lng, me.lat]);
      if (!points.length) return;
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      const padLng = Math.max(0, MIN_SPAN_DEG - (Math.max(...lngs) - Math.min(...lngs))) / 2;
      const padLat = Math.max(0, MIN_SPAN_DEG - (Math.max(...lats) - Math.min(...lats))) / 2;
      camera.current?.fitBounds(
        [Math.max(...lngs) + padLng, Math.max(...lats) + padLat],
        [Math.min(...lngs) - padLng, Math.min(...lats) - padLat],
        [80, 40, 380, 40],   // top, right, bottom, left — the sheet covers the bottom half
        600
      );
    }, [frame, me]);

    useImperativeHandle(ref, () => ({
      focus: (c) => camera.current?.setCamera({
        centerCoordinate: [c.lng, c.lat],
        animationDuration: 350,
        animationMode: "easeTo",
      }),
      fitAll,
    }), [fitAll]);

    // The camera frames itself: on first paint, and again whenever the framed
    // *set* changes — which is how selecting Manual refits to what is left.
    // Keyed on the sorted ids, not on `frame`'s array identity, so switching
    // Nearest to Pass rate reorders the sheet and moves nothing on the map.
    // An empty frame is left alone rather than fitted to nothing, so a search
    // matching no centres keeps the last fit.
    const frameKey = frame.map((c) => c.id).sort().join("|");
    useEffect(() => {
      if (frameKey) fitAll();
      // fitAll closes over `frame` itself, which changes identity far more
      // often than the set it describes; frameKey is the change that matters.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameKey]);

    return (
      <MapView
        style={{ flex: 1 }}
        styleURL={OVERVIEW_STYLE}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
      >
        {/* What shows when tiles have not loaded, which is what offline looks
            like. A flat warm ground reads as deliberate; a grey void reads as
            broken. */}
        <BackgroundLayer id="ground" style={{ backgroundColor: mapColors.land }} />

        <Camera ref={camera} />

        <ShapeSource id="rings" shape={rings}>
          <LineLayer
            id="ring-lines"
            style={{
              lineColor: ACCENT, lineWidth: 1.5, lineDasharray: [4, 5], lineOpacity: 0.28,
              lineOpacityTransition: { duration: 600, delay: 0 },
            }}
          />
        </ShapeSource>

        {/* The inactive pins only. The active one is filtered out here and
            drawn as a MarkerView below, because a layer cannot animate a
            change that arrives as source data — see ActiveCentreMarker. */}
        <ShapeSource id="pins" shape={pinShape}>
          <CircleLayer
            id="pin-body"
            filter={INACTIVE}
            style={{
              circleColor: ["get", "hue"],
              circleRadius: 11,
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 2,
              circleTranslate: [0, -18],
            }}
          />
          <SymbolLayer
            id="pin-initials"
            filter={INACTIVE}
            style={{
              textField: ["get", "initials"],
              textSize: 9.5,
              textColor: "#FFFFFF",
              textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              textOffset: [0, -1.6],
              textAllowOverlap: true,
            }}
          />
        </ShapeSource>

        {activeCentre && activeIdentity && (
          <MarkerView
            id="active-centre"
            coordinate={[activeCentre.lng, activeCentre.lat]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
          >
            <ActiveCentreMarker
              centre={activeCentre}
              identity={activeIdentity}
              distanceM={me ? haversineM(me, { lat: activeCentre.lat, lng: activeCentre.lng }) : null}
            />
          </MarkerView>
        )}

        <ShapeSource id="me" shape={meShape}>
          <CircleLayer
            id="me-halo"
            style={{ circleColor: ACCENT, circleOpacity: 0.22, circleRadius: 16 }}
          />
          <CircleLayer
            id="me-dot"
            style={{ circleColor: ACCENT, circleRadius: 6, circleStrokeColor: "#FFFFFF", circleStrokeWidth: 2.5 }}
          />
        </ShapeSource>
      </MapView>
    );
  }
);
