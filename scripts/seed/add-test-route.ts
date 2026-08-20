// One-off: add (or remove) a walkable TEST route in Hemel Hempstead (HP1 1TS)
// so live navigation can be tried on foot. Tagged "(TEST)" for easy removal.
//
//   Add:    npx tsx scripts/seed/add-test-route.ts        (needs PG* env vars)
//   Remove: npx tsx scripts/seed/add-test-route.ts remove
import { Client } from "pg";
import { fetchRoute } from "./osrm";
import { buildNavSteps } from "./navsteps";
import { deriveDifficulty, deriveHazards, deriveObservationZones, deriveSpeedProfile } from "./derive";
import type { LatLng } from "../../src/lib/geo";

const CENTRE = {
  name: "Hemel Hempstead (TEST)",
  address: "Marlowes, Hemel Hempstead HP1 1TS",
  lat: 51.7521,
  lng: -0.4712,
  region: "Hertfordshire",
};

const ring = (c: LatLng, bearing: number, km: number): LatLng => ({
  lat: c.lat + (km / 111) * Math.cos((bearing * Math.PI) / 180),
  lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((bearing * Math.PI) / 180),
});

const esc = (s: string) => s.replace(/'/g, "''");
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

async function run(sql: string, report?: string) {
  const client = new Client({ ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  if (report) console.log((await client.query(report)).rows);
  await client.end();
}

async function main() {
  if (process.argv[2] === "remove") {
    await run(`delete from test_centres where name = '${esc(CENTRE.name)}';`);
    console.log(`Removed "${CENTRE.name}".`);
    return;
  }

  const c = { lat: CENTRE.lat, lng: CENTRE.lng };
  // ~1.5 km walkable loop through nearby streets, back to the start.
  const waypoints = [c, ring(c, 40, 0.5), ring(c, 150, 0.55), ring(c, 260, 0.5), c];
  const r = await fetchRoute(waypoints);
  const geometry = { type: "LineString", coordinates: r.coords.map((p) => [p.lng, p.lat]) };
  const hazards = deriveHazards(r.coords);
  const steps = buildNavSteps(r.steps);

  const sql = [
    "begin;",
    "alter table routes add column if not exists steps jsonb default '[]';",
    `delete from test_centres where name = '${esc(CENTRE.name)}';`,
    `insert into test_centres (name, address, lat, lng, pass_rate, test_types, region) values ` +
      `('${esc(CENTRE.name)}', '${esc(CENTRE.address)}', ${CENTRE.lat}, ${CENTRE.lng}, 50, '{manual,auto}', '${esc(CENTRE.region)}');`,
    `insert into routes (centre_id, name, geometry, estimated_minutes, distance_km, difficulty, speed_profile, observation_zones, steps) ` +
      `select id, 'Hemel test loop', ${j(geometry)}, ${Math.round(r.durationS / 60)}, ${(r.distanceM / 1000).toFixed(2)}, ` +
      `${deriveDifficulty(r.distanceM / 1000, hazards.length * 2)}, ${j(deriveSpeedProfile(r.speedsMps))}, ` +
      `${j(deriveObservationZones(r.coords))}, ${j(steps)} from test_centres where name = '${esc(CENTRE.name)}';`,
    ...hazards.map(
      (h) =>
        `insert into hazards (route_id, lat, lng, type, description, severity) ` +
        `select id, ${h.lat}, ${h.lng}, '${h.type}', '${esc(h.description)}', '${h.severity}' ` +
        `from routes where name = 'Hemel test loop' and centre_id = (select id from test_centres where name = '${esc(CENTRE.name)}');`
    ),
    "commit;",
  ].join("\n");

  console.log(`Fetched loop: ${(r.distanceM / 1000).toFixed(2)} km, ${steps.length} steps, ${hazards.length} hazards. Inserting…`);
  await run(
    sql,
    `select r.name, r.distance_km, jsonb_array_length(r.steps) as steps from routes r
       join test_centres c on c.id = r.centre_id where c.name = '${esc(CENTRE.name)}';`
  );
  console.log(`Added "${CENTRE.name}". Look for it in the Centres list.`);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});
