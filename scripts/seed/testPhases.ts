import { bearingDeg, haversineM, type LatLng } from "../../src/lib/geo";
import type { Feature, FeatureKind } from "./routePlan";

/**
 * A practice loop as the ordered sequence of things a driving test contains,
 * rather than as three waypoints picked off a compass.
 *
 * The old planner chose waypoints by bearing and radius, which controlled
 * where a route went and never how long it took: measured across the 400
 * seeded routes they ran from 7 to 72 minutes against a real test's 40, and
 * the longest was a 49 km drive. Worse, "a roundabout, an estate and a fast
 * road in rotation" is not what an examiner assembles. A test has a shape, and
 * it is this one.
 *
 * DVSA stopped publishing routes in 2010 and has published what the test
 * *contains* ever since. That is the licensable source, and this module is it
 * turned into geometry.
 *
 * Everything here is pure and deterministic in (centre, features, routeIndex,
 * scale) — which is what lets generate.ts bisect on `scale` until OSRM reports
 * a drive of the right length.
 */

export type PhaseName =
  | "settle-in"
  | "junction-work"
  | "faster-road"
  | "independent"
  | "manoeuvre"
  | "return";

type PhaseSpec = {
  name: PhaseName;
  /** Feature kinds that satisfy this phase, best first. */
  wants: FeatureKind[];
  /**
   * Optional phases are dropped when nothing nearby satisfies them; required
   * ones fall back to a synthetic compass point, so a centre OSM knows nothing
   * about still gets a drivable loop.
   */
  optional: boolean;
  /**
   * How far out this phase belongs, as a fraction of the route radius.
   *
   * Used both to score real features and to place the synthetic fallback
   * point. Scoring against the whole radius instead was a bug worth naming:
   * the return leg is supposed to hug the centre at 0.5, and without this it
   * was picking roads 3.2 km out, which on its own added six kilometres to
   * every loop.
   */
  reach: number;
  /**
   * Where this phase sits round the loop, in degrees from the route spine.
   *
   * Deliberately not an even 360/6 split. An even split makes the whole fan
   * rotationally symmetric at 60 degrees, and the golden angle that separates
   * successive routes is 17.5 degrees past two whole 60-degree steps — so
   * rotating the spine landed the phases back on the same features in a
   * different order, and a centre's ten routes collapsed into six distinct
   * loops. These offsets still run monotonically round the circle, so the
   * loop is still a circuit rather than a zigzag across the centre.
   */
  offset: number;
};

/**
 * The canonical order, and it does not shuffle. You are settled in before you
 * are tested, the manoeuvre comes late, and you finish where you started.
 */
export const PHASES: readonly PhaseSpec[] = [
  // Quiet streets straight out of the centre. Every examiner starts a
  // candidate somewhere undemanding.
  { name: "settle-in",     wants: ["estate", "parking"],                    optional: false, reach: 0.55, offset: 0 },
  // Roundabouts and signalled junctions: the densest source of faults, so it
  // comes early, while concentration is freshest.
  { name: "junction-work", wants: ["roundabout", "signals"],                optional: false, reach: 0.9, offset: 55 },
  // A dual carriageway if there is one, an A road otherwise, and nothing at
  // all for a rural centre that has neither.
  { name: "faster-road",   wants: ["dual", "fast"],                         optional: true,  reach: 1.0, offset: 118 },
  // The longest single stretch — about 20 minutes of a real test — following
  // signs rather than turn-by-turn.
  { name: "independent",   wants: ["fast", "dual", "roundabout", "estate"], optional: false, reach: 1.0, offset: 191 },
  // Somewhere a parallel park or a pull-up-on-the-right is actually possible.
  // A properly tagged parking street is the ideal and a quiet residential one
  // the fallback. Kerbside-parking tagging is patchy in the UK — Mill Hill, a
  // suburb built almost entirely of terraced streets, carries none at all —
  // and a phase that is absent everywhere is a phase that does not exist.
  { name: "manoeuvre",     wants: ["parking", "estate"],                    optional: true,  reach: 0.7, offset: 263 },
  // Back to the centre. This is the phase that absorbs whatever length the
  // rest of the loop did not account for.
  { name: "return",        wants: ["estate", "crossing"],                   optional: false, reach: 0.5, offset: 309 },
];

export type PlannedPhase = { name: PhaseName; kind: FeatureKind | "ring"; at: LatLng };
export type TestRoutePlan = { waypoints: LatLng[]; phases: PlannedPhase[] };

/**
 * The radius the phases are laid out on before scaling. Deliberately smaller
 * than the drive it produces: a loop through five waypoints on a 2.4 km ring
 * is far longer than 2.4 km, and the bisection moves this per route anyway.
 */
export const BASE_RADIUS_KM = 2.4;

// Successive routes are pushed round by the golden angle rather than by an
// even split. An even split with ten routes puts routes 1 and 6 on the same
// line through the centre; 137.5° never repeats a direction.
const GOLDEN_ANGLE = 137.5;

/**
 * Alternate routes run the circuit the other way round.
 *
 * Needed because the spine rotation alone is not enough. The phases fan at
 * 360/6 = 60°, and the golden angle is 137.5° — which is 17.5° past two whole
 * fan steps. So rotating the spine lands the phases back on the same ring of
 * features in a different order, and a centre's ten routes collapsed into six
 * distinct loops with four exact duplicates.
 *
 * Reversing every other one is the fix, and it is a real difference rather
 * than a trick to satisfy a uniqueness check: the same circuit driven the
 * other way is different turns, different roundabout exits, and different
 * junctions to emerge from.
 */
const direction = (routeIndex: number) => (routeIndex % 2 === 0 ? 1 : -1);

const wantKmOf = (spec: PhaseSpec, radiusKm: number) => radiusKm * spec.reach;

const ringPoint = (c: LatLng, bearing: number, km: number): LatLng => ({
  lat: c.lat + (km / 111) * Math.cos((bearing * Math.PI) / 180),
  lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin((bearing * Math.PI) / 180),
});

/** Smallest absolute difference between two bearings, in degrees. */
function bearingGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The best unused feature for a phase: right kind, near the target bearing,
 * inside the band.
 *
 * The kind list is ordered and an earlier kind wins outright — a dual
 * carriageway is a better "faster road" than an A road, and no amount of
 * bearing advantage should change that.
 */
function pick(
  centre: LatLng, features: Feature[], spec: PhaseSpec,
  bearing: number, radiusKm: number, used: Set<Feature>,
): Feature | null {
  // Each phase has its own distance from the centre, not the route's outer
  // radius — see PhaseSpec.reach.
  const wantKm = radiusKm * spec.reach;
  for (const kind of spec.wants) {
    const candidates = features.filter((f) => f.kind === kind && !used.has(f));
    if (!candidates.length) continue;
    const scored = candidates.map((f) => {
      const km = haversineM(centre, f) / 1000;
      const gap = bearingGap(bearingDeg(centre, f), bearing);
      // The overshoot penalty is what keeps a loop the length of a lesson. At
      // a low rate a distant feature on a perfect bearing still won and loops
      // came back over 20 km; at 120 per km a kilometre of overshoot costs
      // more than any bearing error can, so the band holds.
      // Distance error is two-sided now. Penalising only overshoot let a phase
      // that wanted to be 1 km out sit on top of the centre for free, which is
      // how loops ended up as a wide ring with one waypoint in the middle.
      return { f, score: gap + Math.abs(km - wantKm) * 120 };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0].f;
  }
  return null;
}

/**
 * One loop out of a centre, at a given size.
 *
 * `routeIndex` spreads a centre's ten routes round the compass; `scale`
 * multiplies the radius and is what generate.ts searches over to hit the
 * target drive time.
 */
/**
 * The three phases a loop is routed *through*, and where round the centre
 * each one sits.
 *
 * These three because they are the ones a drive would otherwise miss by
 * chance, and because they sit at reach 0.9-1.0 and so set the loop's size.
 * `settle-in` and `return` live at 0.5-0.55 - on the way out of the centre and
 * on the way back into it - so anchoring them would spend two of the four legs
 * going nowhere. `manoeuvre` is optional and often absent entirely.
 *
 * **The offsets are the anchors' own, not the phases'.** Reusing
 * PhaseSpec.offset put all three inside a 136-degree arc, because those
 * offsets were drawn to fan six phases round a circle and these are three of
 * the middle four. Three points in a 136-degree arc is a wedge, not a
 * circuit: the drive goes out, crosses a short arc and comes back. Tottenham
 * came in at a 10.6 km median against a 13-19 km target with the bisection
 * exhausting its tries trying to grow the loop, while Hendon passed - there
 * the severance detours inflated the same wedge back into the band by luck.
 *
 * Spread across the circle, and deliberately *not* evenly. Successive routes
 * are pushed round by the golden angle, 137.5 degrees; three even anchors fan
 * at 120, and 137.5 is 17.5 past one whole step - so an even split lands them
 * back on the same ring of features in a different order and a centre's ten
 * routes collapse into a handful. Same argument as PhaseSpec.offset's, one
 * fan smaller. Monotonic, so the loop is a circuit and not a zigzag.
 */
export const ANCHORS: readonly { phase: PhaseName; offset: number }[] = [
  { phase: "junction-work", offset: 40 },
  { phase: "faster-road", offset: 145 },
  { phase: "independent", offset: 255 },
];

/** The anchored phases, in order. */
export const ANCHOR_PHASES: readonly PhaseName[] = ANCHORS.map((a) => a.phase);

/**
 * How far an anchor may be dragged off its ring point to land on a real
 * feature, as a fraction of the route radius.
 *
 * A tolerance rather than "nearest of the right kind at any distance": an
 * unbounded snap is what used to pull a phase kilometres off its bearing, which
 * adds back exactly the overshoot `pick`'s distance penalty exists to prevent.
 */
const SNAP_FRACTION = 0.35;

/**
 * One loop out of a centre, at a given size.
 *
 * Routed through three anchors with the centre at each end - five waypoints,
 * four legs. It used to be one waypoint per phase, which is up to eight
 * waypoints and seven legs, and that is the whole of the Hendon problem: where
 * the network is severed, each hop between two nearby waypoints costs
 * kilometres of detour to the next legal crossing, so seven legs came back as a
 * 22 km drive however small the radius got. The search sat pinned at the bottom
 * of the bracket for all ten routes and never converged. Severance cost is per
 * hop, so fewer hops is the only lever that moves it.
 *
 * What the six phases were for has not gone away - it moved to `inferPhases`,
 * which reads them off the line that comes back rather than asserting them
 * beforehand. That is closer to how an examiner works anyway: the phases are
 * what the drive contains, not a set of pins it teleports between.
 *
 * `routeIndex` spreads a centre's ten routes round the compass; `scale`
 * multiplies the radius and is what generate.ts searches over for length.
 */
export function planTestRoute(
  centre: LatLng, features: Feature[], routeIndex: number, scale: number,
): TestRoutePlan {
  const spine = (routeIndex * GOLDEN_ANGLE) % 360;
  const dir = direction(routeIndex);
  const radiusKm = BASE_RADIUS_KM * scale;
  const used = new Set<Feature>();

  const phases: PlannedPhase[] = [];
  const waypoints: LatLng[] = [centre];

  for (const anchor of ANCHORS) {
    const spec = PHASES.find((x) => x.name === anchor.phase)!;
    // The anchor's own offset, which spans the circle - see ANCHORS.
    const bearing = (((spine + dir * anchor.offset) % 360) + 360) % 360;
    const ring = ringPoint(centre, bearing, wantKmOf(spec, radiusKm));

    // A real feature when one is close to where the anchor wanted to be, and
    // the ring point otherwise. Unlike the old planner an absent feature never
    // drops the waypoint: four legs is the shape the length search is
    // calibrated against, and a route with three would be a different animal.
    const found = pick(centre, features, spec, bearing, radiusKm, used);
    const close = found !== null && haversineM(ring, found) <= radiusKm * SNAP_FRACTION * 1000;

    if (found && close) {
      used.add(found);
      const at = { lat: found.lat, lng: found.lng };
      phases.push({ name: spec.name, kind: found.kind, at });
      waypoints.push(at);
    } else {
      phases.push({ name: spec.name, kind: "ring", at: ring });
      waypoints.push(ring);
    }
  }

  waypoints.push(centre);
  return { waypoints, phases };
}

/**
 * What OSRM's answer has to be multiplied by to become a real drive.
 *
 * Was 1.15, on the theory that a learner is a little slower than a driver who
 * knows the road. That is true and it is not the main thing: OSRM routes at
 * free-flow speed and knows nothing about traffic, queues at lights, or the
 * pauses a candidate takes. Measured against the seeded loops it implied about
 * 37 km/h through Mill Hill, where a driving test averages nearer 25.
 *
 * 1.5 puts a 16 km loop at about forty minutes, which is what DVSA says a
 * practical test takes. It is a calibration, not a measurement — but it is
 * much closer than 1.15, and the number is shown to learners planning their
 * time.
 */
export const PACE = 1.5;

/**
 * The band a loop has to land in, in OSRM seconds — that is, before the pace
 * multiplier, because that is what the router reports.
 *
 * 36 to 42 real minutes at the wheel, which is what a DVSA practical takes. A
 * band rather than a target, because bisecting onto a single number would
 * spend fetches chasing a precision the road network does not have.
 *
 * Distance is the primary constraint and this is the secondary one — see
 * TARGET_MIN_M. Time depends on the traffic on the day; the length of the
 * drive does not.
 */
export const TARGET_MIN_S = (36 * 60) / PACE;
export const TARGET_MAX_S = (42 * 60) / PACE;


/**
 * The bracket the radius search runs inside.
 *
 * The floor is far below 1 on purpose. Around Hendon the road network is dual
 * carriageways and severed side streets, so even a one-kilometre ring of
 * waypoints routes into a 21 km drive — the search sat pinned at the old 0.4
 * floor for all ten routes and never reached the band. At 0.12 the waypoints
 * can be pulled in to a few hundred metres, which is what it takes there.
 */
export const SCALE_LO = 0.12;
export const SCALE_HI = 2.5;

/**
 * How long a practice loop should be, in metres.
 *
 * A DVSA practical covers roughly eight to twelve miles, and this is that band.
 * Distance leads and duration follows, because distance is a property of the
 * route while duration is a guess about the traffic on the day — and targeting
 * duration alone against a free-flow router produced 26 km loops it called 37
 * minutes, which is a drive no learner finishes in forty minutes near Mill
 * Hill.
 */
export const TARGET_MIN_M = 13_000; //  8.1 miles
export const TARGET_MAX_M = 19_000; // 11.8 miles

/**
 * The rungs the search tries, smallest first.
 *
 * This replaced a bisection, which was not mistuned so much as the wrong
 * shape of search entirely. Measured across the centres that would not
 * converge, distance is neither a continuous nor a monotonic function of
 * scale:
 *
 *   Erith route 1     0.25 -> 4.1 km    0.5 -> 54.8 km
 *   Loughton route 2  0.5  -> 27.6 km   0.75 -> 16.2 km
 *
 * Crossing a river or a motorway is binary. A loop either stays this side of
 * it or pays the entire detour to the bridge, and there is nothing in
 * between. At Erith the 13-19 km band lies wholly inside that jump, so no
 * scale answers at all and halving forever will not find one. At Loughton a
 * perfectly good 16.2 km sits at 0.75 and the bisection walked away from it,
 * reporting 6.5 km, because it assumed a monotonic curve it did not have.
 *
 * A fixed ladder cannot walk away from a rung it has already stood on, and
 * cannot converge into a gap. Eight rungs, each within a factor of two of the
 * last so a smoothly growing loop cannot step over the band, spanning the
 * bracket that used to be bisected. The search stops at the first rung that
 * qualifies, so a typical route still costs two or three fetches.
 */
export const SCALE_LADDER: readonly number[] = [0.15, 0.25, 0.4, 0.6, 0.85, 1.2, 1.7, 2.4];

/**
 * The longest a practice loop may be, in OSRM seconds.
 *
 * Distance decides what a route *is* - that argument was settled when
 * Tottenham deadlocked between the two bands. This is a ceiling on top of it
 * rather than a second target: nothing is ever resized to hit a duration.
 *
 * 55 real minutes. The first full run put the ninetieth percentile at 53 and
 * the longest at 72, and a 72-minute drive is an honest number that no
 * learner picks off a list of practice routes. A slow centre can still offer
 * one at 50; what it cannot do is offer an hour and a quarter.
 */
export const MAX_ACCEPTED_S = (55 * 60) / PACE;

/**
 * Is this a route worth putting in front of a learner?
 *
 * The whole acceptance rule, in one place, so that the generator and
 * scripts/check-planner.ts cannot drift into two different answers about what
 * counts as a good route.
 */
export function acceptable(distanceM: number, durationS: number): boolean {
  return distanceM >= TARGET_MIN_M
    && distanceM <= TARGET_MAX_M
    && durationS <= MAX_ACCEPTED_S;
}

/**
 * How close a feature has to run to the line to count as being on the drive.
 *
 * Overpass gives a feature one coordinate - the centre of a roundabout, a node
 * on a residential way - and the driven line passes round it or along it rather
 * than through it. 120 m is wide enough to catch a roundabout the route
 * genuinely goes round, and tight enough that a parallel road one street over
 * is not claimed as part of this drive.
 */
const NEAR_M = 120;

/**
 * The first vertex at or after `from` that runs close to something this phase
 * wants, or null.
 *
 * Kind order from `wants` is kept - a dual carriageway is a better
 * "faster road" than an A road - but only as a tie-break at the same vertex,
 * because along a line the thing that comes first is what the driver meets
 * first, and no preference should reorder the drive.
 */
function firstOnLine(
  coords: LatLng[], features: Feature[], spec: PhaseSpec, from: number,
): { idx: number; kind: FeatureKind } | null {
  let best: { idx: number; kind: FeatureKind; rank: number } | null = null;

  for (const f of features) {
    const rank = spec.wants.indexOf(f.kind);
    if (rank === -1) continue;
    for (let i = from; i < coords.length; i++) {
      if (haversineM(coords[i], f) > NEAR_M) continue;
      if (best === null || i < best.idx || (i === best.idx && rank < best.rank)) {
        best = { idx: i, kind: f.kind, rank };
      }
      break; // the first approach to this feature is the one that counts
    }
  }
  return best === null ? null : { idx: best.idx, kind: best.kind };
}

/**
 * Which phases the finished drive actually contains, and where.
 *
 * This replaces slicing the line by leg length. That answered "where did we
 * ask the route to go", which stopped being answerable the moment a route
 * stopped having one leg per phase - and was never quite the right question:
 * a phase is a thing the road does, so it should be read off the road.
 *
 * The walk is forward-only and in canonical order, which is what makes the
 * spans ordered and non-overlapping without having to sort anything: a phase
 * may only claim a vertex at or after the one the previous phase ended on. A
 * test does not do its junction work before it has settled in.
 *
 * An optional phase with nothing near the line is simply not part of this
 * drive. A required one falls back to a proportional slice of what is left,
 * because a route reporting fewer required phases than a driving test has is
 * describing something that is not a driving test.
 */
export function inferPhases(
  coords: LatLng[], features: Feature[],
): { name: PhaseName; kind: string; startIdx: number; endIdx: number }[] {
  const out: { name: PhaseName; kind: string; startIdx: number; endIdx: number }[] = [];
  if (coords.length === 0) return out;
  const last = coords.length - 1;

  let cursor = 0;
  let requiredLeft = PHASES.filter((x) => !x.optional).length;

  for (const spec of PHASES) {
    const hit = firstOnLine(coords, features, spec, cursor);

    if (hit === null) {
      if (spec.optional) continue;
      // Share what is left of the line between the required phases still to
      // be reported, so a featureless route is divided rather than collapsing
      // onto its own final vertex.
      const span = Math.max(1, Math.round((last - cursor) / Math.max(1, requiredLeft)));
      const endIdx = Math.min(last, cursor + span);
      out.push({ name: spec.name, kind: "ring", startIdx: cursor, endIdx });
      cursor = endIdx;
      requiredLeft--;
      continue;
    }

    out.push({ name: spec.name, kind: hit.kind, startIdx: cursor, endIdx: hit.idx });
    cursor = hit.idx;
    if (!spec.optional) requiredLeft--;
  }

  // However the walk went, the drive ends where the line ends.
  if (out.length > 0) out[out.length - 1].endIdx = last;
  return out;
}
