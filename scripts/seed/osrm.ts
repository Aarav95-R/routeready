import type { LatLng } from "../../src/lib/geo";

export type OsrmRoute = {
  coords: LatLng[];            // decoded geometry
  distanceM: number;
  durationS: number;
  speedsMps: (number | null)[]; // per geometry edge, from annotations
};

export async function fetchRoute(waypoints: LatLng[]): Promise<OsrmRoute> {
  const path = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&annotations=speed&steps=false`;
  const res = await fetch(url, { headers: { "User-Agent": "routeready-seed/1.0" } });
  if (!res.ok) throw new Error(`OSRM ${res.status} for ${path}`);
  const json = (await res.json()) as any;
  if (json.code !== "Ok" || !json.routes?.length) throw new Error(`OSRM no route: ${json.code}`);
  const r = json.routes[0];
  return {
    coords: r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceM: r.distance,
    durationS: r.duration,
    speedsMps: r.legs.flatMap((l: any) => l.annotation.speed as (number | null)[]),
  };
}
