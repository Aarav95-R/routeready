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
