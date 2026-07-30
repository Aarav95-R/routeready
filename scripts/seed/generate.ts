import { writeFileSync } from "node:fs";
import centres from "./centres.json";
import { fetchRoute } from "./osrm";
import { derivePassHistory, deriveDifficulty, deriveHazards, deriveObservationZones, deriveSpeedProfile } from "./derive";
import { buildNavSteps } from "./navsteps";
import type { LatLng } from "../../src/lib/geo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/'/g, "''");
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

// 3 loops per centre: out-and-back triangles at different bearings/radii
function waypointSets(c: { lat: number; lng: number }): LatLng[][] {
  const ring = (bearing: number, km: number): LatLng => ({
    lat: c.lat + (km / 111) * Math.cos((bearing * Math.PI) / 180),
    lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((bearing * Math.PI) / 180),
  });
  return [
    [c, ring(30, 1.6), ring(120, 1.9), c],
    [c, ring(200, 2.2), ring(280, 1.7), c],
    [c, ring(330, 2.5), ring(60, 2.1), c],
  ];
}

const ROUTE_NAMES = ["Town loop", "Residential circuit", "Main-road run"];

// --- DVSA "show me, tell me" vehicle safety questions (gov.uk) ---
type SmtmRow = { category: "under_bonnet" | "inside_car" | "safety"; question: string; answer: string; is_show_me: boolean };

const SHOW_ME_TELL_ME: SmtmRow[] = [
  // Show me (7) — physically demonstrated while safe to do so
  {
    category: "safety",
    is_show_me: true,
    question: "Show me how you'd check that the tyres on this car have sufficient tread depth and are in a safe condition to drive.",
    answer:
      "I'd check the tread depth is at least 1.6mm across the central three-quarters of the tyre's width, look for cuts or bulges, and check the pressures with a gauge if one is available.",
  },
  {
    category: "inside_car",
    is_show_me: true,
    question: "Show me how you'd check that the horn is working (off road only).",
    answer: "I'd press the horn control, usually found on the steering wheel, to sound it briefly.",
  },
  {
    category: "inside_car",
    is_show_me: true,
    question: "Show me how you'd set the demister controls to clear all the windows effectively.",
    answer:
      "I'd switch on the fan and heater, select the windscreen setting, choose a warm airflow, and switch on the heated rear window and air conditioning if fitted.",
  },
  {
    category: "inside_car",
    is_show_me: true,
    question: "Show me how you'd switch your headlights from dipped to main beam and explain how you'd know the main beam is on.",
    answer:
      "I'd move the indicator stalk forward, or press the light switch, to select main beam, and a blue warning light on the dashboard confirms it's on.",
  },
  {
    category: "inside_car",
    is_show_me: true,
    question: "Show me how you'd check the footbrake is working effectively as you move away, without the car pulling to either side.",
    answer:
      "As I move off, I'd press the brake pedal firmly and check the car stops smoothly and promptly, travelling in a straight line without pulling to one side.",
  },
  {
    category: "inside_car",
    is_show_me: true,
    question: "Show me how you'd clean the windscreen using the windscreen washer and wiper.",
    answer: "I'd operate the washer stalk or button so washer fluid sprays the screen, then let the wipers clear it, repeating until the screen is clean.",
  },
  {
    category: "inside_car",
    is_show_me: true,
    question: "Show me how you'd switch on your rear fog light(s) and explain when you'd use it/them.",
    answer:
      "I'd pull out or press the switch marked with a light symbol crossed by three horizontal lines, and I'd only use it when visibility drops below 100 metres.",
  },
  // Tell me (11) — explained verbally, no need to touch the vehicle
  {
    category: "safety",
    is_show_me: false,
    question: "Tell me how you'd check that the brakes are working before starting a journey.",
    answer: "I'd press the brake pedal before moving off and check it feels firm, with no excessive travel and no sponginess.",
  },
  {
    category: "safety",
    is_show_me: false,
    question: "Tell me where you'd find the recommended tyre pressures for this car and how you'd check them.",
    answer:
      "The recommended pressures are usually shown in the handbook, on a sticker inside the driver's door sill, or on the fuel filler flap, and I'd check them with a pressure gauge when the tyres are cold.",
  },
  {
    category: "safety",
    is_show_me: false,
    question: "Tell me how you'd check the head restraint is correctly adjusted so it provides the best protection in the event of a crash.",
    answer:
      "The head restraint should be adjusted so the rigid part is level with the top of my head, and as close to the back of my head as is comfortable.",
  },
  {
    category: "safety",
    is_show_me: false,
    question: "Tell me how you'd check the tyres have sufficient tread depth and that their general condition is safe to use.",
    answer:
      "The legal minimum tread depth is 1.6mm across the central three-quarters of the tyre's width around its entire circumference, and I'd also check for cuts and bulges.",
  },
  {
    category: "inside_car",
    is_show_me: false,
    question: "Tell me how you'd check your headlights and sidelights are working, without getting out of the car.",
    answer:
      "I'd switch them on and check the dashboard light confirms they're lit, and I could check their reflection in a window or ask someone to confirm they're working.",
  },
  {
    category: "inside_car",
    is_show_me: false,
    question: "Tell me how you'd know if there was a problem with your anti-lock braking system.",
    answer: "A warning light on the instrument panel would illuminate and stay lit if there's a fault with the ABS.",
  },
  {
    category: "inside_car",
    is_show_me: false,
    question: "Tell me how you'd check the direction indicators are working.",
    answer:
      "I'd switch on the hazard warning lights, or each indicator in turn, and walk round the vehicle to check all the lights are flashing, or ask someone to confirm while I operate them.",
  },
  {
    category: "inside_car",
    is_show_me: false,
    question: "Tell me how you'd check the brake lights are working on this car.",
    answer:
      "With the ignition on, I'd operate the footbrake and use a reflection in a window or garage door, or ask someone to check the lights come on.",
  },
  {
    category: "inside_car",
    is_show_me: false,
    question: "Tell me how you'd check the power-assisted steering is working before starting a journey.",
    answer:
      "If the steering feels unusually heavy, or there's no resistance after gently turning the wheel and pulling away, it may indicate a fault, and a dashboard warning light would also alert me.",
  },
  {
    category: "inside_car",
    is_show_me: false,
    question: "Tell me when you'd use front or rear fog lights and how you'd know they're switched on.",
    answer:
      "I'd use them only when visibility is seriously reduced to less than 100 metres, and a warning light on the dashboard shows when they're switched on.",
  },
  {
    category: "under_bonnet",
    is_show_me: false,
    question: "Open the bonnet and tell me how you'd check the engine has sufficient oil, coolant and brake fluid.",
    answer:
      "I'd check the oil sits between the minimum and maximum marks on the dipstick, the coolant is between the markers on the header tank, and the brake fluid is between the min and max lines on its reservoir.",
  },
];

export const SHOW_ME_TELL_ME_SQL = SHOW_ME_TELL_ME.map(
  (q) =>
    `insert into show_me_tell_me (id, category, question, answer, is_show_me) values ` +
    `(gen_random_uuid(), '${esc(q.category)}', '${esc(q.question)}', '${esc(q.answer)}', ${q.is_show_me});`
).join("\n");

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
  ];
  for (let ci = 0; ci < centres.length; ci++) {
    const c = centres[ci];
    lines.push(
      `insert into test_centres (id, name, address, lat, lng, pass_rate, pass_rate_history, test_types, region) values ` +
      `(gen_random_uuid(), '${esc(c.name)}', '${esc(c.address)}', ${c.lat}, ${c.lng}, ${c.pass_rate}, ` +
      `${j(derivePassHistory(c.pass_rate, ci))}, '{${c.test_types.join(",")}}', '${esc(c.region)}');`
    );
    for (let ri = 0; ri < 3; ri++) {
      try {
        const r = await fetchRoute(waypointSets(c)[ri]);
        const geometry = { type: "LineString", coordinates: r.coords.map((p) => [p.lng, p.lat]) };
        const hazards = deriveHazards(r.coords);
        lines.push(
          `insert into routes (id, centre_id, name, geometry, estimated_minutes, distance_km, difficulty, speed_profile, observation_zones, steps) ` +
          `select gen_random_uuid(), id, '${esc(`Route ${ri + 1} · ${ROUTE_NAMES[ri]}`)}', ${j(geometry)}, ` +
          `${Math.round((r.durationS / 60) * 1.15)}, ${(r.distanceM / 1000).toFixed(2)}, ` +
          `${deriveDifficulty(r.distanceM / 1000, hazards.length * 2)}, ${j(deriveSpeedProfile(r.speedsMps))}, ` +
          `${j(deriveObservationZones(r.coords))}, ${j(buildNavSteps(r.steps))} from test_centres where name = '${esc(c.name)}';`
        );
        for (const h of hazards) {
          lines.push(
            `insert into hazards (id, route_id, lat, lng, type, description, severity) ` +
            `select gen_random_uuid(), id, ${h.lat}, ${h.lng}, '${h.type}', '${esc(h.description)}', '${h.severity}' ` +
            `from routes where name = '${esc(`Route ${ri + 1} · ${ROUTE_NAMES[ri]}`)}' and centre_id = (select id from test_centres where name = '${esc(c.name)}');`
          );
        }
        console.log(`ok: ${c.name} route ${ri + 1} (${(r.distanceM / 1000).toFixed(1)} km)`);
      } catch (e) {
        console.warn(`SKIP ${c.name} route ${ri + 1}: ${(e as Error).message}`);
      }
      await sleep(700); // be polite to the public OSRM server
    }
  }
  lines.push(SHOW_ME_TELL_ME_SQL, MANOEUVRES_SQL, "commit;");
  writeFileSync("supabase/seed.sql", lines.join("\n"));
  console.log("wrote supabase/seed.sql");
}
main();
