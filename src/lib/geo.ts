export type LatLng = { lat: number; lng: number };
const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function turnAngleDeg(prev: number, next: number): number {
  let d = next - prev;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function cumulativeM(coords: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]));
  return out;
}

export function nearestVertex(coords: LatLng[], p: LatLng): { idx: number; distM: number } {
  let idx = 0;
  let distM = Infinity;
  coords.forEach((c, i) => {
    const d = haversineM(c, p);
    if (d < distM) { distM = d; idx = i; }
  });
  return { idx, distM };
}

export function isInZone(p: LatLng, zone: { lat: number; lng: number; radiusM: number }): boolean {
  return haversineM(p, zone) <= zone.radiusM;
}

export function mpsToMph(mps: number): number {
  return mps * 2.23694;
}

const BANDS = [20, 30, 40, 60, 70] as const;
export function bandSpeedMph(mps: number): (typeof BANDS)[number] {
  const mph = mpsToMph(mps);
  for (const b of BANDS) if (mph <= b + 2) return b;
  return 70;
}

export type Projection = { point: LatLng; t: number; distM: number };

// Perpendicular projection of `p` onto segment a->b. Works in local metres
// via an equirectangular approximation around `a` — over a single route
// segment (tens of metres) the error is far below GPS noise.
export function projectOnSegment(a: LatLng, b: LatLng, p: LatLng): Projection {
  const cosLat = Math.cos(toRad(a.lat));
  const x = (c: LatLng) => toRad(c.lng) * R * cosLat;
  const y = (c: LatLng) => toRad(c.lat) * R;

  const dx = x(b) - x(a);
  const dy = y(b) - y(a);
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x(p) - x(a)) * dx + (y(p) - y(a)) * dy) / len2));

  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return { point, t, distM: haversineM(point, p) };
}

export type Snap = { point: LatLng; idx: number; distM: number; bearing: number };

// Snap `p` onto the polyline, searching only the segments within `windowSize`
// vertices of `nearIdx`. The window matters: the seeded routes are loops, and
// an unbounded search snaps the driver onto the return leg wherever the
// outbound and inbound roads run close together.
export function snapToPath(coords: LatLng[], p: LatLng, nearIdx = 0, windowSize = 30): Snap | null {
  if (coords.length < 2) return null;
  const last = coords.length - 2;
  const centre = Math.min(Math.max(nearIdx, 0), last);
  const lo = Math.max(0, centre - windowSize);
  const hi = Math.min(last, centre + windowSize);

  let best: Snap | null = null;
  for (let i = lo; i <= hi; i++) {
    const pr = projectOnSegment(coords[i], coords[i + 1], p);
    if (!best || pr.distM < best.distM) {
      best = { point: pr.point, idx: i, distM: pr.distM, bearing: bearingDeg(coords[i], coords[i + 1]) };
    }
  }
  return best;
}

// Circular exponential moving average. Wraps correctly across 0/360 by
// easing along the shortest signed turn rather than the raw difference.
export function smoothHeading(prev: number, next: number, alpha = 0.15): number {
  const delta = turnAngleDeg(prev, next);
  return (((prev + delta * alpha) % 360) + 360) % 360;
}

// How far to rotate the user icon on a map that is itself rotated.
//
// The map is drawn heading-up along the direction of travel, so an icon angle
// measured against north would double-count that rotation. What the icon shows
// is the difference between where the phone points and where the road goes:
// mounted on the windscreen the two agree and the arrow sits upright on its
// own, and twisting the phone at a standstill swings the arrow while the map
// underneath holds still.
export function iconRotationDeg(mapBearing: number, compass: number): number {
  return turnAngleDeg(mapBearing, compass);
}
