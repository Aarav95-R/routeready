import { buildNavSteps, OsrmStep } from "@/lib/navsteps";
import type { LatLng } from "@/lib/geo";
import type { NavStep } from "@/types/db";

export type Directions = { coords: LatLng[]; steps: NavStep[]; distanceM: number };

// Pure parse of an OSRM /route response into our nav shapes.
export function parseDirections(json: any): Directions {
  if (json?.code !== "Ok" || !json.routes?.length) throw new Error(`OSRM: ${json?.code ?? "no response"}`);
  const r = json.routes[0];
  const coords: LatLng[] = r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
  const rawSteps: OsrmStep[] = (r.legs ?? []).flatMap((l: any) =>
    (l.steps ?? []).map((s: any) => ({
      name: s.name ?? "",
      distance: s.distance ?? 0,
      maneuver: {
        type: s.maneuver?.type ?? "",
        modifier: s.maneuver?.modifier,
        location: s.maneuver?.location as [number, number],
        exit: s.maneuver?.exit,
      },
    }))
  );
  return { coords, steps: buildNavSteps(rawSteps), distanceM: r.distance ?? 0 };
}

// Fetch driving directions from A to B (used to guide the driver to the route start).
export async function fetchDirections(from: LatLng, to: LatLng): Promise<Directions> {
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  return parseDirections(await res.json());
}
