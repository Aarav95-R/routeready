import type { ObservationZone } from "@/types/db";

export type Pt = { x: number; y: number };
export type Thumb = {
  /** SVG path data, "" when there is nothing to draw. */
  d: string;
  /** Where the drive begins, for the start dot. */
  start: Pt | null;
  points: Pt[];
  /** The same transform the line used, so pins land on it. */
  project: (lng: number, lat: number) => Pt;
};

/** Beyond this, extra vertices cost more than an 88pt strip can show. */
export const MAX_THUMB_POINTS = 120;

const toRad = (d: number) => (d * Math.PI) / 180;
const round = (n: number) => Math.round(n * 100) / 100;

// Keep the first and last vertex whatever the stride works out to — dropping
// the last one leaves a loop visibly unclosed.
function decimate(coords: [number, number][]): [number, number][] {
  if (coords.length <= MAX_THUMB_POINTS) return coords;
  const step = Math.ceil(coords.length / MAX_THUMB_POINTS);
  const out = coords.filter((_, i) => i % step === 0);
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Project a route's geometry into an SVG box.
 *
 * Equirectangular about the route's mid-latitude — the same approximation
 * `projectOnSegment` in lib/geo.ts leans on, and over a few kilometres its
 * error is invisible at thumbnail scale. Both axes take the same scale, so a
 * long thin route stays long and thin instead of being stretched to fill the
 * box and losing the very shape that tells it apart from the next route.
 *
 * Coordinates arrive as [lng, lat], matching GeoLineString.
 */
export function thumbPath(coords: [number, number][], w: number, h: number, pad = 8): Thumb {
  const pts = decimate(coords ?? []);
  const centre = { x: w / 2, y: h / 2 };

  if (pts.length === 0) {
    return { d: "", start: null, points: [], project: () => centre };
  }

  const lats = pts.map(([, lat]) => lat);
  const lngs = pts.map(([lng]) => lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cosLat = Math.cos(toRad(midLat));

  // Flat local metres-ish; y is negated so north ends up at the top of an SVG
  // box, which counts downward.
  const flatX = (lng: number) => lng * cosLat;
  const flatY = (lat: number) => -lat;

  const fx = lngs.map(flatX);
  const fy = lats.map(flatY);
  const minX = Math.min(...fx), maxX = Math.max(...fx);
  const minY = Math.min(...fy), maxY = Math.max(...fy);
  const spanX = maxX - minX, spanY = maxY - minY;

  const innerW = Math.max(w - 2 * pad, 0);
  const innerH = Math.max(h - 2 * pad, 0);
  const scale = spanX === 0 && spanY === 0
    ? 0
    : Math.min(spanX === 0 ? Infinity : innerW / spanX, spanY === 0 ? Infinity : innerH / spanY);

  // Whatever the scale leaves over on the roomier axis becomes even margin.
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;

  const project = (lng: number, lat: number): Pt =>
    scale === 0
      ? centre
      : { x: round(offX + (flatX(lng) - minX) * scale), y: round(offY + (flatY(lat) - minY) * scale) };

  const points = pts.map(([lng, lat]) => project(lng, lat));
  const d = points.length < 2
    ? ""
    : points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return { d, start: points[0] ?? null, points, project };
}

/** Place observation zones on the line using the transform it was drawn with. */
export function projectZones(thumb: Thumb, zones: ObservationZone[]): Pt[] {
  return (zones ?? []).map((z) => thumb.project(z.lng, z.lat));
}
