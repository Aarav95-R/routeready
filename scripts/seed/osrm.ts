import { cached } from "./cache";
import type { LatLng } from "../../src/lib/geo";

export type OsrmManeuver = { type: string; modifier?: string; location: [number, number]; exit?: number };
export type OsrmStep = { name: string; distance: number; maneuver: OsrmManeuver };

export type OsrmRoute = {
  coords: LatLng[];            // decoded geometry
  distanceM: number;
  durationS: number;
  speedsMps: (number | null)[]; // per geometry edge, from annotations
  steps: OsrmStep[];            // turn-by-turn maneuvers across all legs
  /**
   * How many geometry edges each leg contributed, in order.
   *
   * A route planned through waypoints comes back as one leg per waypoint pair,
   * and the whole-route geometry is those legs concatenated — so these counts
   * are what turn "the third waypoint was the manoeuvre spot" into a slice of
   * `coords`. Taken from each leg's annotation length, which is per edge and
   * therefore one short of that leg's node count.
   */
  legEdgeCounts: number[];
};

export async function fetchRoute(waypoints: LatLng[]): Promise<OsrmRoute> {
  const path = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&annotations=speed&steps=true`;
  // A full generator run is ~400 of these. Cached on disk so a failure part
  // way through costs one retry rather than the whole run again.
  const json = await cached(`osrm:${path}`, async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": "routeready-seed/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OSRM ${res.status} for ${path}`);
    const body = (await res.json()) as any;
    if (body.code !== "Ok" || !body.routes?.length) throw new Error(`OSRM no route: ${body.code}`);
    return body;
  });
  const r = json.routes[0];
  return {
    coords: r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceM: r.distance,
    durationS: r.duration,
    speedsMps: r.legs.flatMap((l: any) => l.annotation.speed as (number | null)[]),
    legEdgeCounts: r.legs.map((l: any) => (l.annotation?.speed?.length ?? 0) as number),
    steps: r.legs.flatMap((l: any) =>
      (l.steps as any[]).map((s) => ({
        name: s.name ?? "",
        distance: s.distance ?? 0,
        maneuver: {
          type: s.maneuver?.type ?? "",
          modifier: s.maneuver?.modifier,
          location: s.maneuver?.location as [number, number],
          exit: s.maneuver?.exit,
        },
      }))
    ),
  };
}
