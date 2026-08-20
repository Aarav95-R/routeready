import { buildNavSteps, OsrmStep } from "@/lib/navsteps";
import type { LatLng } from "@/lib/geo";
import type { NavStep } from "@/types/db";

export type Directions = { coords: LatLng[]; steps: NavStep[]; distanceM: number };

/**
 * Driving directions for the two legs that are not the seeded route: guiding
 * the driver to the start line, and getting them back on the line after they
 * have left it.
 *
 * These come from **Mapbox Directions**. They used to come from
 * `router.project-osrm.org`, which is a demo server — no SLA, no capacity
 * guarantee, and a usage policy that rules out shipping apps. It rate-limits,
 * and the moment it does is the moment a driver is lost and asking for the way
 * back, which is the worst possible time for directions to stop arriving.
 *
 * The response shapes are the same because Mapbox Directions is built on OSRM
 * and answers in OSRM's own vocabulary — `depart`, `turn`, `rotary` with an
 * `exit`, `continue`, `arrive`. That is why the swap moved this file and
 * nothing else: `parseDirections`, `buildNavSteps`, `formatInstruction` and
 * `stitchLegs` are all untouched. There is a captured Mapbox response in
 * `__tests__/fixtures` holding that claim in place.
 *
 * The seed generator still talks to OSRM. It runs on a laptop at seed time
 * rather than on a phone at drive time, so it is not the same problem.
 */

/** The type name is historical: it is the shape both providers return. */
export function parseDirections(json: any): Directions {
  if (json?.code !== "Ok" || !json.routes?.length) throw new Error(`Directions: ${json?.code ?? "no response"}`);
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

/**
 * `driving`, not `driving-traffic`. The seeded routes' instructions were
 * generated with plain driving, and a drive should not change voice halfway
 * through because the approach leg came from a different profile.
 */
const PROFILE = "mapbox/driving";

/**
 * Built as its own function so the coordinate order can be tested without a
 * network call. Longitude first is the API's convention and the reverse fails
 * silently — latitude first returns a plausible route in the Gulf of Guinea
 * rather than an error, so nothing downstream can catch it.
 */
export function directionsUrl(from: LatLng, to: LatLng, token: string | undefined): string {
  // Both call sites swallow a failure into fallback mode, so a URL carrying
  // the string "undefined" would 401 and degrade silently, with nothing
  // anywhere saying the token was never set.
  if (!token) throw new Error("Directions: no Mapbox token (EXPO_PUBLIC_MAPBOX_TOKEN)");
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  return `https://api.mapbox.com/directions/v5/${PROFILE}/${path}`
    + `?overview=full&geometries=geojson&steps=true&access_token=${token}`;
}

/** Fetch driving directions from A to B. Throws; both call sites catch. */
export async function fetchDirections(from: LatLng, to: LatLng): Promise<Directions> {
  const res = await fetch(directionsUrl(from, to, process.env.EXPO_PUBLIC_MAPBOX_TOKEN));
  if (!res.ok) throw new Error(`Directions ${res.status}`);
  return parseDirections(await res.json());
}
