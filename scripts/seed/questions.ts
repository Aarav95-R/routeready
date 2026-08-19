/**
 * The DVSA "show me, tell me" vehicle safety questions, and the multiple
 * choice built on top of them.
 *
 * Lives in its own module rather than inside `generate.ts` because that file
 * calls `main()` at import and spends twenty minutes talking to OSRM and
 * Overpass. The bank is content, it has invariants worth testing, and a test
 * should not have to seed four hundred routes to check them.
 *
 * **Two kinds of writing are mixed in here, and the difference matters.** The
 * `question` and `answer` fields are the agency's, reproduced from gov.uk —
 * the answer is what a learner says out loud to an examiner, so it is quoted,
 * not paraphrased. The `choices` are not the agency's and cannot be: the real
 * test is verbal and offers nobody four options. Each wrong option is written
 * here, and each is built the same way — by bending exactly one real detail
 * out of true. A threshold (1mm instead of 1.6), a condition (warm tyres
 * instead of cold), a symbol (three sloping lines instead of three
 * horizontal). That way picking it means missing the specific thing an
 * examiner marks, rather than failing to spot a silly answer.
 *
 * Two rules the suite enforces, both of which make an option set answerable
 * without reading the question if they slip: the right answer must not
 * reliably be the longest, and it must not always be written first.
 */

export type QuizChoiceRow = { text: string; correct: boolean };

export type SmtmRow = {
  category: "under_bonnet" | "inside_car" | "safety";
  /** The first line of the row in the app. Not derived — see quizView. */
  topic: string;
  question: string;
  answer: string;
  is_show_me: boolean;
  choices: QuizChoiceRow[];
};

export const SHOW_ME_TELL_ME: SmtmRow[] = [
  // ── Show me (7): demonstrated, most of them while the car is moving ──────
  {
    category: "safety",
    topic: "Tyre tread and condition",
    is_show_me: true,
    question: "Show me how you'd check that the tyres on this car have sufficient tread depth and are in a safe condition to drive.",
    answer: "I'd check the tread depth is at least 1.6mm across the central three-quarters of the tyre's width, look for cuts or bulges, and check the pressures with a gauge if one is available.",
    choices: [
      { text: "Check at least 1mm of tread across the full width, and that all four tyres are the same brand", correct: false },
      { text: "Check at least 1.6mm across the central three-quarters, plus cuts and bulges", correct: true },
      { text: "Check at least 2.5mm of tread at the outer edges, measuring while the tyres are still warm", correct: false },
      { text: "Press each tyre by hand for firmness — there is no legal minimum tread depth", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "The horn",
    is_show_me: true,
    question: "Show me how you'd check that the horn is working (off road only).",
    answer: "I'd press the horn control, usually found on the steering wheel, to sound it briefly.",
    choices: [
      { text: "Press the horn control on the steering wheel and sound it briefly", correct: true },
      { text: "Hold the horn down for several seconds so the tone can be judged properly", correct: false },
      { text: "Switch the ignition off first, then press the horn control on the steering wheel", correct: false },
      { text: "Pull the indicator stalk towards me, which sounds the horn on most cars", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Demisting the windows",
    is_show_me: true,
    question: "Show me how you'd set the demister controls to clear all the windows effectively.",
    answer: "I'd switch on the fan and heater, select the windscreen setting, choose a warm airflow, and switch on the heated rear window and air conditioning if fitted.",
    choices: [
      { text: "Set the fan to recirculate with a cool airflow, aimed at the side windows", correct: false },
      { text: "Fan and heater on, windscreen setting selected, warm airflow, plus the heated rear window", correct: true },
      { text: "Fan on full with a cold airflow and both front windows open, which clears it fastest", correct: false },
      { text: "Wait for the engine to warm through, then direct the fan at the footwells", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Main beam",
    is_show_me: true,
    question: "Show me how you'd switch your headlights from dipped to main beam and explain how you'd know the main beam is on.",
    answer: "I'd move the indicator stalk forward, or press the light switch, to select main beam, and a blue warning light on the dashboard confirms it's on.",
    choices: [
      { text: "Push the stalk forward for main beam — a green warning light on the dashboard confirms it", correct: false },
      { text: "Pull the stalk towards me and hold it — main beam stays on only while it is held", correct: false },
      { text: "Push the stalk forward for main beam — a blue warning light on the dashboard confirms it", correct: true },
      { text: "Turn the light switch to its third position — an amber warning light confirms it", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Brake test on the move",
    is_show_me: true,
    question: "Show me how you'd check the footbrake is working effectively as you move away, without the car pulling to either side.",
    answer: "As I move off, I'd press the brake pedal firmly and check the car stops smoothly and promptly, travelling in a straight line without pulling to one side.",
    choices: [
      { text: "Press the brake firmly just after moving off and check it slows promptly and straight", correct: true },
      { text: "Brake hard from about 30mph and check the anti-lock system engages properly", correct: false },
      { text: "Press the brake while stationary and check the pedal does not sink to the floor", correct: false },
      { text: "Coast in neutral and check the car slows evenly without touching the brake", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Washer and wipers",
    is_show_me: true,
    question: "Show me how you'd clean the windscreen using the windscreen washer and wiper.",
    answer: "I'd operate the washer stalk or button so washer fluid sprays the screen, then let the wipers clear it, repeating until the screen is clean.",
    choices: [
      { text: "Run the wipers on the dry screen first, then add fluid once the dust is swept off", correct: false },
      { text: "Operate the washer so fluid sprays the screen, let the wipers clear it, and repeat", correct: true },
      { text: "Spray the washers with the ignition off, so no fluid is wasted while the engine runs", correct: false },
      { text: "Use the rear washer control, which operates both screens together on most cars", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Rear fog lights",
    is_show_me: true,
    question: "Show me how you'd switch on your rear fog light(s) and explain when you'd use it/them.",
    answer: "I'd pull out or press the switch marked with a light symbol crossed by three horizontal lines, and I'd only use it when visibility drops below 100 metres.",
    choices: [
      { text: "The switch marked with a lamp crossed by three sloping lines, used in heavy rain", correct: false },
      { text: "The switch marked with a lamp and a wavy line, used in any fog however light", correct: false },
      { text: "The lamp crossed by three level lines — used below 100 metres visibility", correct: true },
      { text: "The main beam stalk pushed forward, used at night on unlit roads", correct: false },
    ],
  },

  // ── Tell me (13): answered at the kerb, before the drive starts ──────────
  {
    category: "safety",
    topic: "Brakes before a journey",
    is_show_me: false,
    question: "Tell me how you'd check that the brakes are working before starting a journey.",
    answer: "I'd press the brake pedal before moving off and check it feels firm, with no excessive travel and no sponginess.",
    choices: [
      { text: "Pull away and brake hard from 30mph to check it stops within the legal distance", correct: false },
      { text: "Press the brake pedal before moving off and check it feels firm, not spongy", correct: true },
      { text: "Check the brake fluid reservoir is filled to the top of its neck", correct: false },
      { text: "Listen for the brakes squealing on the first few stops, the usual sign of a fault", correct: false },
    ],
  },
  {
    category: "safety",
    topic: "Tyre pressures",
    is_show_me: false,
    question: "Tell me where you'd find the recommended tyre pressures for this car and how you'd check them.",
    answer: "The recommended pressures are usually shown in the handbook, on a sticker inside the driver's door sill, or on the fuel filler flap, and I'd check them with a pressure gauge when the tyres are cold.",
    choices: [
      { text: "On the sidewall of each tyre, checked with a gauge once the tyres have warmed up", correct: false },
      { text: "In the handbook, the door sill or the filler flap — checked with a gauge, tyres cold", correct: true },
      { text: "Under the bonnet by the oil filler cap, checked by pressing each tyre firmly by hand", correct: false },
      { text: "On a plate beside the engine number, checked at a garage once a year at service time", correct: false },
    ],
  },
  {
    category: "safety",
    topic: "Head restraint",
    is_show_me: false,
    question: "Tell me how you'd check the head restraint is correctly adjusted so it provides the best protection in the event of a crash.",
    answer: "The head restraint should be adjusted so the rigid part is level with the top of my head, and as close to the back of my head as is comfortable.",
    choices: [
      { text: "The rigid part level with the top of my shoulders, a hand's width behind my head", correct: false },
      { text: "Set as low as it will go, so it does not block my view through the rear window", correct: false },
      { text: "The rigid part level with the top of my head, and as close behind it as is comfortable", correct: true },
      { text: "The soft part against the back of my neck, with the rigid part above the roof line", correct: false },
    ],
  },
  {
    category: "safety",
    topic: "Tyre tread, the legal minimum",
    is_show_me: false,
    question: "Tell me how you'd check the tyres have sufficient tread depth and that their general condition is safe to use.",
    answer: "The legal minimum tread depth is 1.6mm across the central three-quarters of the tyre's width around its entire circumference, and I'd also check for cuts and bulges.",
    choices: [
      { text: "1.6mm across the central three-quarters, right round the tyre, plus cuts and bulges", correct: true },
      { text: "1.6mm anywhere on the tyre, so long as one part of the tread still meets the depth", correct: false },
      { text: "1mm across the central three-quarters, right round the tyre, plus uneven wear", correct: false },
      { text: "3mm across the full width, which is the depth a tyre must be replaced at", correct: false },
    ],
  },
  {
    category: "safety",
    topic: "Direction indicators",
    is_show_me: false,
    question: "Tell me how you'd check the direction indicators are working.",
    answer: "I'd switch on the hazard warning lights, or each indicator in turn, and walk round the vehicle to check all the lights are flashing, or ask someone to confirm while I operate them.",
    choices: [
      { text: "Switch on the hazards, or each indicator in turn, and walk round checking every lamp", correct: true },
      { text: "Switch on the hazards and check the dashboard tell-tale flashes, covering all four", correct: false },
      { text: "Operate each indicator with the ignition off and listen for the relay ticking", correct: false },
      { text: "Switch on the sidelights first, then the indicators, so the difference can be seen", correct: false },
    ],
  },
  {
    category: "safety",
    topic: "Brake lights",
    is_show_me: false,
    question: "Tell me how you'd check the brake lights are working on this car.",
    answer: "With the ignition on, I'd operate the footbrake and use a reflection in a window or garage door, or ask someone to check the lights come on.",
    choices: [
      { text: "With the ignition off, press the footbrake and check the lights in a reflection", correct: false },
      { text: "Pull the handbrake fully on and check the brake lights come on at the back", correct: false },
      { text: "With the ignition on, press the footbrake and use a reflection, or ask someone", correct: true },
      { text: "Press the footbrake and check the red warning light on the dashboard comes on", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Headlights and sidelights",
    is_show_me: false,
    question: "Tell me how you'd check your headlights and sidelights are working, without getting out of the car.",
    answer: "I'd switch them on and check the dashboard light confirms they're lit, and I could check their reflection in a window or ask someone to confirm they're working.",
    choices: [
      { text: "Switch them on and walk round the car with the engine running to see each one lit", correct: false },
      { text: "Switch them on, check the dashboard tell-tale, and use a reflection or ask someone", correct: true },
      { text: "Switch them on and check the fuse box under the bonnet for a blown fuse", correct: false },
      { text: "Flash them twice and listen for the relay clicking behind the dashboard", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Anti-lock brakes",
    is_show_me: false,
    question: "Tell me how you'd know if there was a problem with your anti-lock braking system.",
    answer: "A warning light on the instrument panel would illuminate and stay lit if there's a fault with the ABS.",
    choices: [
      { text: "The brake pedal would feel spongy and travel much further than usual", correct: false },
      { text: "A warning light on the instrument panel would come on and stay lit", correct: true },
      { text: "The car would pull noticeably to one side under firm braking", correct: false },
      { text: "The ABS pump would run noisily whenever the ignition is switched on", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "Power-assisted steering",
    is_show_me: false,
    question: "Tell me how you'd check the power-assisted steering is working before starting a journey.",
    answer: "If the steering feels unusually heavy, or there's no resistance after gently turning the wheel and pulling away, it may indicate a fault, and a dashboard warning light would also alert me.",
    choices: [
      { text: "Turn the wheel fully lock to lock while parked and listen for the pump straining", correct: false },
      { text: "Check the wheel has no more than two inches of free play before the wheels move", correct: false },
      { text: "Gently turn the wheel as I pull away — steering that feels heavy suggests a fault", correct: true },
      { text: "Check the power steering fluid sits above the maximum mark on its reservoir", correct: false },
    ],
  },
  {
    category: "inside_car",
    topic: "When to use fog lights",
    is_show_me: false,
    question: "Tell me when you'd use front or rear fog lights and how you'd know they're switched on.",
    answer: "I'd use them only when visibility is seriously reduced to less than 100 metres, and a warning light on the dashboard shows when they're switched on.",
    choices: [
      { text: "Whenever it is raining hard enough for the wipers to be running continuously", correct: false },
      { text: "Only below 100 metres visibility — a dashboard warning light shows they are on", correct: true },
      { text: "At any time after dark on an unlit road, in place of main beam", correct: false },
      { text: "Only below 100 metres visibility — no dashboard light is fitted for them", correct: false },
    ],
  },
  {
    category: "under_bonnet",
    topic: "Engine oil",
    is_show_me: false,
    question: "Open the bonnet and tell me how you'd check that the engine has sufficient oil.",
    answer: "I'd pull the dipstick out, wipe it clean, put it back in fully, then pull it out again and check the level sits between the minimum and maximum marks.",
    choices: [
      { text: "Read the dipstick the moment it is pulled out, unwiped, with the engine running", correct: false },
      { text: "Pull the dipstick out, wipe it, refit it fully, then check the level between the marks", correct: true },
      { text: "Look through the oil filler cap and check oil can be seen moving over the camshaft", correct: false },
      { text: "Read the level off the dashboard oil pressure gauge with the engine idling", correct: false },
    ],
  },
  {
    category: "under_bonnet",
    topic: "Coolant",
    is_show_me: false,
    question: "Open the bonnet and tell me how you'd check that the engine has sufficient coolant.",
    answer: "I'd check the coolant level in the header tank sits between the minimum and maximum markers, and I'd only top it up when the engine is cold.",
    choices: [
      { text: "Check the header tank level is between the two markers, topping up only when cold", correct: true },
      { text: "Remove the radiator cap while the engine is warm and check it reaches the neck", correct: false },
      { text: "Check the level in the washer bottle, which feeds the cooling system", correct: false },
      { text: "Check the temperature gauge reads mid-way once the engine has warmed through", correct: false },
    ],
  },
  {
    category: "under_bonnet",
    topic: "Brake fluid",
    is_show_me: false,
    question: "Open the bonnet and tell me how you'd check that you have a safe level of hydraulic brake fluid.",
    answer: "I'd check the brake fluid reservoir and make sure the level sits between the minimum and maximum markings on the side of it.",
    choices: [
      { text: "Check the brake fluid reservoir is filled right up to the top of its filler neck", correct: false },
      { text: "Check the reservoir level sits between the minimum and maximum markings on its side", correct: true },
      { text: "Press the brake pedal and check it does not sink, which shows the fluid is full", correct: false },
      { text: "Check the fluid is clear rather than dark, the only level indicator fitted", correct: false },
    ],
  },
];

const esc = (s: string) => s.replace(/'/g, "''");
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

export const SHOW_ME_TELL_ME_SQL = SHOW_ME_TELL_ME.map(
  (q) =>
    `insert into show_me_tell_me (id, category, topic, question, answer, is_show_me, choices) values ` +
    `(gen_random_uuid(), '${esc(q.category)}', '${esc(q.topic)}', '${esc(q.question)}', ` +
    `'${esc(q.answer)}', ${q.is_show_me}, ${j(q.choices)});`
).join("\n");
