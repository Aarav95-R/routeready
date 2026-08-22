/**
 * Does a centre's ten loops actually land in the target band?
 *
 * Runs the real bisection against real OSRM answers for one or more centres,
 * and prints the spread. Written when the six-waypoint planner turned out to
 * converge at Mill Hill and not at Hendon — a difference no unit test could
 * have shown, because the thing that broke was the road network's shape rather
 * than the arithmetic.
 *
 * Overpass comes from the on-disk cache when it is warm. OSRM is fetched with
 * the same politeness sleep the generator uses, so a centre takes a couple of
 * minutes.
 *
 *   npx tsx scripts/check-planner.ts                    # the two known cases
 *   npx tsx scripts/check-planner.ts Croydon Watford    # any centre by name
 *
 * Read-only: it fetches and measures, and writes nothing but the cache.
 */
import centres from "./seed/centres.json";
import { fetchRoute } from "./seed/osrm";
import { fetchFeatures } from "./seed/overpass";
import { searchRoute } from "./seed/search";
import { acceptable, inferPhases, PACE } from "./seed/testPhases";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The two that made the point: one that always converged, one that never did. */
const DEFAULT_CENTRES = ["Mill Hill (London)", "Hendon"];

type CentreRow = { name: string; lat: number; lng: number };

async function measure(row: CentreRow) {
  const centre = { lat: row.lat, lng: row.lng };
  const features = await fetchFeatures(centre);

  console.log(`\n=== ${row.name} — ${features.length} features ===`);
  const kms: number[] = [];
  let inBand = 0;
  let totalFetches = 0;

  for (let ri = 0; ri < 10; ri++) {
    const found = await searchRoute(centre, features, ri, fetchRoute, sleep);
    const r = found.route;
    const { scale, fetches } = found;

    const km = r.distanceM / 1000;
    const mins = Math.round((r.durationS / 60) * PACE);
    // The shipping rule, not a second copy of it - distance band and the
    // 55-minute ceiling together.
    const ok = acceptable(r.distanceM, r.durationS);
    const phases = inferPhases(r.coords, features);
    const real = phases.filter((p) => p.kind !== "ring").length;

    if (ok) inBand++;
    kms.push(km);
    totalFetches += fetches;

    console.log(
      `  Route ${String(ri + 1).padStart(2)}  ` +
      `${km.toFixed(1).padStart(5)} km  ${String(mins).padStart(3)} min  ` +
      `scale ${scale.toFixed(2).padStart(5)}  ${String(fetches).padStart(2)} fetch  ` +
      `${found.retried ? "retried  " : "         "}` +
      `phases ${phases.length} (${real} real)  ${ok ? "in band" : "OUT"}`
    );
    await sleep(700);
  }

  const sorted = [...kms].sort((a, b) => a - b);
  console.log(
    `  -> ${inBand}/10 in band (13–19 km).  ` +
    `min ${sorted[0].toFixed(1)}  median ${sorted[5].toFixed(1)}  ` +
    `max ${sorted[9].toFixed(1)} km.  ${totalFetches} fetches.`
  );
  return { inBand, sorted };
}

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length > 0 ? wanted : DEFAULT_CENTRES;

  for (const name of names) {
    const row = (centres as CentreRow[]).find(
      (c) => c.name === name || c.name.toLowerCase().startsWith(name.toLowerCase())
    );
    if (!row) {
      console.error(`No centre matching "${name}" in centres.json.`);
      continue;
    }
    await measure(row);
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
