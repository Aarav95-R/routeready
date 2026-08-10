import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { BackgroundLayer, Camera, CircleLayer, LineLayer, MapView, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import { ringPolygon, type LatLng } from "@/lib/geo";
import type { CentreIdentity } from "@/lib/centreIdentity";
import type { Centre } from "@/types/db";
import { mapColors } from "@/ui/mapStyle";

const OVERVIEW_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const RING_MILES = [3, 8, 15];
const ACCENT = "#059669";

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
  identities: Map<string, CentreIdentity>;
  me: LatLng | null;
  activeId: string | null;
};

export const CentresMap = forwardRef<CentresMapHandle, CentresMapProps>(
  function CentresMap({ pins, identities, me, activeId }, ref) {
    const camera = useRef<Camera>(null);

    const rings = useMemo(() => {
      if (!me) return EMPTY;
      return {
        type: "FeatureCollection" as const,
        features: RING_MILES.map((mi) => ({
          type: "Feature" as const,
          properties: { miles: mi },
          geometry: ringPolygon(me, mi * 1609.34),
        })),
      };
    }, [me]);

    const pinShape = useMemo(() => ({
      type: "FeatureCollection" as const,
      features: pins.map((c) => {
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
    }), [pins, identities, activeId]);

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

    useImperativeHandle(ref, () => ({
      focus: (c) => camera.current?.setCamera({
        centerCoordinate: [c.lng, c.lat],
        animationDuration: 350,
        animationMode: "easeTo",
      }),
      fitAll: () => {
        const points = [...pins.map((p) => [p.lng, p.lat] as [number, number])];
        if (me) points.push([me.lng, me.lat]);
        if (!points.length) return;
        const lngs = points.map((p) => p[0]);
        const lats = points.map((p) => p[1]);
        camera.current?.fitBounds(
          [Math.max(...lngs), Math.max(...lats)],
          [Math.min(...lngs), Math.min(...lats)],
          [80, 40, 380, 40],   // top, right, bottom, left — the sheet covers the bottom half
          600
        );
      },
    }), [pins, me]);

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
            style={{ lineColor: ACCENT, lineWidth: 1.5, lineDasharray: [4, 5], lineOpacity: 0.28 }}
          />
        </ShapeSource>

        <ShapeSource id="pins" shape={pinShape}>
          <CircleLayer
            id="pin-body"
            style={{
              circleColor: ["get", "hue"],
              circleRadius: ["case", ["get", "active"], 15, 11],
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 2,
              circleTranslate: [0, -18],
            }}
          />
          <SymbolLayer
            id="pin-initials"
            style={{
              textField: ["get", "initials"],
              textSize: ["case", ["get", "active"], 13, 9.5],
              textColor: "#FFFFFF",
              textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              textOffset: [0, -1.6],
              textAllowOverlap: true,
            }}
          />
          <SymbolLayer
            id="pin-label"
            style={{
              textField: ["case", ["get", "active"], ["get", "name"], ""],
              textSize: 11,
              textColor: ["get", "hue"],
              textHaloColor: "#FFFFFF",
              textHaloWidth: 1.6,
              textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              textOffset: [0, -3.6],
              textAllowOverlap: true,
            }}
          />
        </ShapeSource>

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
