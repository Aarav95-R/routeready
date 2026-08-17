import { memo } from "react";
import { BackgroundLayer, FillLayer, LineLayer } from "@rnmapbox/maps";
import { lineWidthExpression, mapColors, ROAD_OUTLINE_PX, roadLayers, roadWidths, trafficLayerIds } from "@/ui/mapStyle";

// The Waze-style base every map in the app is drawn on: wide white roads on
// warm off-white land, with parks and water carrying the only other colour.
// Shared so the centres overview and the navigation map are the same map at
// two zooms, rather than two maps that happen to use the same style URL.
//
// Applied as overrides on the loaded style's own layers — `existing` — rather
// than as a fork of the style or as layers of our own. That distinction is the
// whole point of this file: a layer added without `existing` goes on *top* of
// the stack (RNMBXLayer.add -> style.addLayer), so an added background paints
// over every road, park and label beneath it. The centres map did exactly that
// and rendered as a flat tan rectangle with pins on it.
//
// Every road class is drawn three times by this style — at grade, on a bridge,
// and in a tunnel — so the table in mapStyle.ts covers all three. Styling only
// the "road-" set left a carriageway changing colour and width halfway across
// a flyover. `npm run check:map-style` verifies every id against the live
// style, because a wrong `existing` id is a silent no-op.
//
// Memoised on nothing: this is ~60 static elements and its callers re-render
// often — the nav screen about fifteen times a second, off the compass.

// lineWidthExpression returns unknown[] (see src/ui/mapStyle.ts); LineLayer's
// style prop wants a narrower Mapbox Expression tuple — narrow it once here.
const lineWidth = (stops: Parameters<typeof lineWidthExpression>[0]) => lineWidthExpression(stops) as any;

export const MapBase = memo(function MapBase() {
  return (
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
  );
});
