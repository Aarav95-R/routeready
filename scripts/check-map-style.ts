// Verify the layer overrides in src/ui/mapStyle.ts against the live
// navigation-day-v1 style. A wrong `existing` id is a silent no-op in
// rnmapbox — nothing warns, the layer simply keeps its stock look — which is
// how an earlier pass shipped eight ids that matched nothing at all. Run this
// after touching the tables, and after any Mapbox style version bump.
//
//   npm run check:map-style
import { readFileSync } from "node:fs";
import { roadLayers, trafficLayerIds } from "../src/ui/mapStyle";

type StyleLayer = { id: string; type: string; "source-layer"?: string };

// Road-family line layers we leave at stock. Each is a decision, not an
// oversight, so an unexpected addition here should be looked at.
const EXPECTED_UNSTYLED = [
  "road-construction-navigation",
  "bridge-construction-navigation",
  "tunnel-construction-navigation",
  "road-rail",
  "road-rail-tracks",
  "bridge-rail",
  "bridge-rail-tracks",
];

async function main() {
  // npm run always sets the cwd to the package root.
  const env = readFileSync(".env", "utf8");
  const token = env.match(/^EXPO_PUBLIC_MAPBOX_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!token) throw new Error("EXPO_PUBLIC_MAPBOX_TOKEN not found in .env");

  const res = await fetch(
    `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1?access_token=${token}`
  );
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const style = (await res.json()) as { layers: StyleLayer[] };

  const inStyle = new Set(style.layers.map((l) => l.id));
  const declared = [...roadLayers.map((l) => l.id), ...trafficLayerIds];
  const phantom = declared.filter((id) => !inStyle.has(id));

  const roadFamily = style.layers
    .filter(
      (l) => l.type === "line" && l["source-layer"] === "road" && /^(road|bridge|tunnel)-/.test(l.id)
    )
    .map((l) => l.id);
  const unstyled = roadFamily.filter((id) => !declared.includes(id));
  const unexpected = unstyled.filter((id) => !EXPECTED_UNSTYLED.includes(id));

  console.log(`road-family line layers in style : ${roadFamily.length}`);
  console.log(`overridden by mapStyle.ts        : ${roadFamily.length - unstyled.length}`);
  console.log(`left at stock on purpose         : ${unstyled.length}`);

  let bad = false;
  if (phantom.length) {
    bad = true;
    console.error("\nFAIL — declared ids that match no layer (silent no-ops):");
    for (const id of phantom) console.error("  " + id);
  }
  if (unexpected.length) {
    bad = true;
    console.error("\nFAIL — road layers left unstyled that we did not expect:");
    for (const id of unexpected) console.error("  " + id);
  }
  if (bad) process.exit(1);

  console.log("\nOK — every declared id exists, and every road layer is either styled or knowingly skipped.");
}

main();
