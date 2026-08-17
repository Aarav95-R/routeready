import { cached } from "./cache";
import { classify, type Feature, type OverpassElement } from "./routePlan";

/**
 * The features a driving test is actually made of, from OpenStreetMap.
 *
 * Same data OSRM already routes on, under the same ODbL licence, so this adds
 * no new dependency and nothing that cannot be shipped. DVSA stopped
 * publishing real routes in 2010 and the GPX sets sold online are licensed
 * content — this is the legitimate way to get routes that are locally specific
 * rather than arbitrary.
 */

/**
 * One request per centre, with a separate `out` per category.
 *
 * A single union with one `out` at the end would work too, but residential
 * ways outnumber roundabouts by two orders of magnitude, so the cap would be
 * spent entirely on side streets and every route would be an estate crawl.
 * Interleaved `out` statements cap each category on its own.
 */
function query(lat: number, lng: number, radiusM: number): string {
  const near = `(around:${radiusM},${lat},${lng})`;
  return [
    "[out:json][timeout:60];",
    `way${near}[junction=roundabout];`,
    "out center 30;",
    `node${near}[highway=crossing]["crossing:markings"~"zebra"];`,
    "out 30;",
    `way${near}[highway~"^(primary|trunk)$"];`,
    "out center 30;",
    `way${near}[highway=residential];`,
    "out center 60;",
  ].join("\n");
}

/**
 * The public instances shed load rather than queue: a busy one answers 504 or
 * 429 within seconds. Across forty centres that is close to certain, so the
 * fetch rotates mirrors and backs off instead of failing the run.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(body: string, attempt: number): Promise<{ elements: OverpassElement[] }> {
  const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
  const res = await fetch(endpoint, {
    method: "POST",
    body: `data=${encodeURIComponent(body)}`,
    headers: { "User-Agent": "routeready-seed/1.0", "Content-Type": "application/x-www-form-urlencoded" },
    // Without this a stalled instance holds the connection open indefinitely
    // and the run simply stops — no error, no progress, no clue why.
    signal: AbortSignal.timeout(75_000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} from ${new URL(endpoint).host}`);
  return (await res.json()) as { elements: OverpassElement[] };
}

export async function fetchFeatures(
  centre: { lat: number; lng: number }, radiusM = 4000, attempts = 6,
): Promise<Feature[]> {
  const body = query(centre.lat, centre.lng, radiusM);
  const json = await cached(`overpass:${body}`, async () => {
    let last: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await post(body, i);
      } catch (e) {
        last = e as Error;
        // 8s, 16s, 32s… A rate-limited instance stays that way for tens of
        // seconds, so retrying quickly just burns the attempt. Logged to
        // stdout, not stderr: PowerShell 5.1 wraps a native command's stderr
        // in an ErrorRecord and kills the pipeline mid-run.
        const wait = 8000 * 2 ** Math.floor(i / ENDPOINTS.length);
        console.log(`  ${last.message} — retrying in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
    throw last ?? new Error("Overpass failed");
  });
  return (json.elements ?? []).map(classify).filter((f): f is Feature => f !== null);
}
