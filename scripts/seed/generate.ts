import { writeFileSync } from "node:fs";
import centres from "./centres.json";
import { fetchRoute } from "./osrm";
import { deriveDifficulty, deriveHazards, deriveObservationZones, deriveSpeedProfile } from "./derive";
import { buildNavSteps } from "./navsteps";
import { fetchFeatures } from "./overpass";
import { SHOW_ME_TELL_ME_SQL } from "./questions";
import { nameFromSteps, type Feature } from "./routePlan";
import { inferPhases, PACE } from "./testPhases";
import { searchRoute } from "./search";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/'/g, "''");
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/** How many practice routes every centre gets. */
const ROUTES_PER_CENTRE = 10;

/**
 * The fallback names, used only when a loop drove no named road at all —
 * an industrial estate or a new-build development where OSM has the geometry
 * but not the labels. Everywhere else the name comes from the roads OSRM
 * reports, via nameFromSteps.
 */
const FALLBACK_NAMES = ["Town loop", "Residential circuit", "Main-road run"];

// --- DVSA "show me, tell me" vehicle safety questions (gov.uk) ---
//
// The bank itself lives in ./questions, because this file calls main() at
// import and spends twenty minutes talking to OSRM and Overpass — which no
// test of the question content should have to sit through.

// --- Manoeuvres ---
type Step = { title: string; detail: string };
type ManoeuvreRow = { name: string; steps: Step[]; tips: string[] };

const MANOEUVRES: ManoeuvreRow[] = [
  {
    name: "Parallel park",
    steps: [
      { title: "Choose your space", detail: "Find a gap roughly two car lengths long, indicate, and pull up alongside the car in front of the gap, about a car's width away from it." },
      { title: "Get into position", detail: "Line up so your rear bumper is roughly level with the other car's rear bumper, select reverse, and check all around before moving." },
      { title: "Begin reversing", detail: "Reverse slowly, steering fully towards the kerb once the car reaches roughly a 45-degree angle to it." },
      { title: "Straighten up", detail: "As the car starts to come parallel to the kerb, steer smoothly the other way to bring the wheels straight." },
      { title: "Final adjustment", detail: "Continue reversing slowly until the car is close to and parallel with the kerb, then stop." },
      { title: "Check your position", detail: "Check you're within about a car's width of the kerb and not blocking a driveway, then apply the handbrake." },
    ],
    tips: [
      "Use reference points on your own car rather than fixed rules that apply to every road.",
      "Keep the manoeuvre slow — speed makes it much harder to correct if you drift off line.",
      "Pause for an all-round check at each stage rather than rushing through in one go.",
    ],
  },
  {
    name: "Bay park (reverse)",
    steps: [
      { title: "Select a bay", detail: "Drive past the bay you plan to use, positioning the car roughly two bays away and parallel to the row." },
      { title: "Prepare to reverse", detail: "Check all around, select reverse gear, and begin reversing slowly while checking mirrors and blind spots." },
      { title: "Turn towards the bay", detail: "As the bay lines appear in your mirrors, steer towards the bay while continuing to check around the car." },
      { title: "Straighten into the bay", detail: "Straighten the steering as the car lines up centrally between the bay markings." },
      { title: "Reverse in fully", detail: "Continue reversing slowly until the car is parked centrally and fully within the bay lines." },
      { title: "Secure the car", detail: "Apply the handbrake, select neutral or park, and check the car hasn't crossed any of the bay lines." },
    ],
    tips: [
      "Move at a very slow, controlled speed throughout the manoeuvre.",
      "Keep up continuous all-round observation, not just mirror checks.",
      "If you drift off line, pull forward and start the turn again rather than forcing it.",
    ],
  },
  {
    name: "Forward bay park",
    steps: [
      { title: "Approach the bay", detail: "Drive slowly through the car park and identify an empty bay ahead of you." },
      { title: "Signal and position", detail: "Indicate if appropriate and position the car so you have enough room to turn into the bay." },
      { title: "Turn in", detail: "Steer into the bay, checking mirrors and blind spots for pedestrians and other vehicles." },
      { title: "Straighten up", detail: "Straighten the steering as the car lines up centrally within the bay markings." },
      { title: "Drive in fully", detail: "Move forward until the car is parked centrally and square within the bay." },
      { title: "Secure the car", detail: "Apply the handbrake and select neutral or park, checking the car is within the lines." },
    ],
    tips: [
      "Take it slowly — pedestrians can step out suddenly between parked cars.",
      "Check the bay is wide enough and not reserved before you begin.",
      "Use the bay lines and your car's door pillars as reference points to stay central.",
    ],
  },
  {
    name: "Pull up on the right",
    steps: [
      { title: "Signal your intention", detail: "Check your mirrors and signal right in good time before pulling over." },
      { title: "Position the car", detail: "Move over to a safe position close to the offside kerb, keeping clear of junctions and obstructions." },
      { title: "Check before stopping", detail: "Check mirrors and blind spot again for traffic coming up behind or towards you before you stop." },
      { title: "Stop safely", detail: "Bring the car to a stop parallel and close to the kerb, then apply the handbrake and select neutral." },
      { title: "Prepare to move off", detail: "Signal right, then check mirrors and blind spot for oncoming and approaching traffic before moving away." },
      { title: "Rejoin the road", detail: "Move off smoothly when it's safe, crossing back to the correct side of the road promptly." },
    ],
    tips: [
      "Only use this manoeuvre where it's legal and safe — never near a bend, junction or brow of a hill.",
      "The blind-spot check matters more here since you're pulling out into oncoming traffic.",
      "Cancel your signal once you've safely moved off.",
    ],
  },
];

export const MANOEUVRES_SQL = MANOEUVRES.map(
  (m) =>
    `insert into manoeuvres (id, name, steps, tips) values ` +
    `(gen_random_uuid(), '${esc(m.name)}', ${j(m.steps)}, '{${m.tips.map((t) => `"${esc(t).replace(/"/g, '\\"')}"`).join(",")}}');`
).join("\n");

async function main() {
  const lines: string[] = [
    "-- Generated by scripts/seed/generate.ts — do not edit by hand",
    "begin;",
    "alter table routes add column if not exists steps jsonb default '[]';",
    "alter table routes add column if not exists phases jsonb default '[]';",
  ];
  // Two different things, deliberately kept apart. `failures` stops the run;
  // `skipped` is a centre being smaller than ten routes because of where it
  // is, which is a fact worth reporting and not a reason to write nothing.
  const failures: string[] = [];
  const skipped: string[] = [];
  for (let ci = 0; ci < centres.length; ci++) {
    const c = centres[ci];
    lines.push(
      // No pass_rate_history. It used to be eight quarters generated from a sine
      // wave around pass_rate — invented numbers, written to a shipping database
      // and never rendered. Real DVSA quarterly data can fill the column later;
      // until it does, the honest value is nothing at all.
      `insert into test_centres (id, name, address, lat, lng, pass_rate, test_types, region) values ` +
      `(gen_random_uuid(), '${esc(c.name)}', '${esc(c.address)}', ${c.lat}, ${c.lng}, ${c.pass_rate}, ` +
      `'{${c.test_types.join(",")}}', '${esc(c.region)}');`
    );
    // One Overpass call per centre, cached. A centre OSM knows nothing about
    // still gets its ten routes: planTestRoute falls back to compass points for
    // the required phases and simply drops the two optional ones.
    let features: Feature[] = [];
    try {
      features = await fetchFeatures(c);
    } catch (e) {
      console.log(`Overpass failed for ${c.name}, falling back to rings: ${(e as Error).message}`);
    }
    const counts = features.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
    console.log(`${c.name}: ${features.length} features ${JSON.stringify(counts)}`);
    await sleep(3000); // Overpass rate-limits per IP; 1.2s earned a run of 429s

    const usedNames = new Set<string>();

    for (let ri = 0; ri < ROUTES_PER_CENTRE; ri++) {
      try {
        // The ladder, the retry on a different bearing, and the honest answer
        // when neither works, all live in ./search - so that check-planner.ts
        // measures the search that actually ships. Every fetch is cached on
        // disk, so a re-run after a failure part way through costs one call
        // rather than the whole search again.
        const found = await searchRoute(
          { lat: c.lat, lng: c.lng }, features, ri, fetchRoute, sleep,
        );

        // Nothing was measured at all, which is the router rather than the
        // road network. Carrying on would write a seed with holes in it and
        // call that done - so the run stops and says why.
        if (found.failure === "router-unreachable") {
          failures.push(`${c.name} route ${ri + 1}: the router answered nothing`);
          continue;
        }

        const r = found.route;

        // No radius answers on this bearing, and none on the retry either.
        // At Erith that is the Thames: four of its ten bearings cross water,
        // and a loop either stays on one bank at 4 km or pays 50 km for the
        // bridge. The centre gets fewer routes, which is the truth about it -
        // a 30 km drive labelled forty minutes would not be.
        if (!found.converged) {
          skipped.push(
            `${c.name} route ${ri + 1}: no loop in band ` +
            `(closest ${(r.distanceM / 1000).toFixed(1)} km, ${found.fetches} fetches)`,
          );
          continue;
        }
        const geometry = { type: "LineString", coordinates: r.coords.map((p) => [p.lng, p.lat]) };
        const hazards = deriveHazards(r.coords);
        // Read off the line that came back rather than sliced from the legs we
        // asked for: with three anchors there is no leg per phase to slice by,
        // and what the drive contains is the honest question anyway.
        const phases = inferPhases(r.coords, features);
        // Named after the fact, from the roads it drove — see nameFromSteps.
        const derived = nameFromSteps(r.steps, usedNames);
        for (const road of (derived ?? "").split(" and ")) if (road) usedNames.add(road);
        const route = { name: `Route ${ri + 1} · ${derived ?? FALLBACK_NAMES[ri % FALLBACK_NAMES.length]}` };
        const minutes = Math.round((r.durationS / 60) * PACE);
        lines.push(
          `insert into routes (id, centre_id, name, geometry, estimated_minutes, distance_km, difficulty, speed_profile, observation_zones, steps, phases) ` +
          `select gen_random_uuid(), id, '${esc(route.name)}', ${j(geometry)}, ` +
          `${minutes}, ${(r.distanceM / 1000).toFixed(2)}, ` +
          `${deriveDifficulty(r.distanceM / 1000, hazards.length * 2)}, ${j(deriveSpeedProfile(r.speedsMps))}, ` +
          `${j(deriveObservationZones(r.coords))}, ${j(buildNavSteps(r.steps))}, ${j(phases)} from test_centres where name = '${esc(c.name)}';`
        );
        for (const h of hazards) {
          lines.push(
            `insert into hazards (id, route_id, lat, lng, type, description, severity) ` +
            `select gen_random_uuid(), id, ${h.lat}, ${h.lng}, '${h.type}', '${esc(h.description)}', '${h.severity}' ` +
            `from routes where name = '${esc(route.name)}' and centre_id = (select id from test_centres where name = '${esc(c.name)}');`
          );
        }
        console.log(
          `  ok: ${route.name} (${minutes} min, ${(r.distanceM / 1000).toFixed(1)} km, ` +
          `scale ${found.scale.toFixed(2)}${found.retried ? ", retried" : ""}, ` +
          `${phases.map((x) => x.name).join("/")})`
        );
      } catch (e) {
        // Not a warning. This file is truncate-and-reload, so a route that is
        // skipped here is a route that disappears from the app on the next
        // push — and the run still ends with "wrote supabase/seed.sql".
        failures.push(`${c.name} route ${ri + 1}: ${(e as Error).message}`);
        console.error(`FAILED ${c.name} route ${ri + 1}: ${(e as Error).message}`);
      }
      await sleep(700); // be polite to the public OSRM server
    }
  }

  if (failures.length) {
    console.error(
      `\n${failures.length} route(s) could not be fetched at all. supabase/seed.sql was NOT\n` +
      `written, because a router that stops answering halfway through forty centres\n` +
      `looks exactly like a seed with holes in it:\n  ${failures.join("\n  ")}`
    );
    process.exit(1);
  }

  // Not a failure, and not silent either. A centre that offers six routes
  // instead of ten is the honest shape of where it sits, and the number is
  // worth seeing every run rather than discovering in the app.
  if (skipped.length) {
    console.warn(
      `\n${skipped.length} route(s) had no loop in the band on any bearing, so their\n` +
      `centres are written with fewer than ten:\n  ${skipped.join("\n  ")}`
    );
  }

  lines.push(SHOW_ME_TELL_ME_SQL, MANOEUVRES_SQL, "commit;");
  writeFileSync("supabase/seed.sql", lines.join("\n"));
  console.log("wrote supabase/seed.sql");
}
main();
