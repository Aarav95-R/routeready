export type SpeedProfileSegment = { startIdx: number; endIdx: number; limitMph: 20 | 30 | 40 | 60 | 70 };
export type ObservationZone = { lat: number; lng: number; radiusM: number; kind: "roundabout" | "junction" | "pedestrian" };
export type GeoLineString = { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]
export type GeoPolygon = { type: "Polygon"; coordinates: [number, number][][] }; // [lng, lat]

// A single turn-by-turn navigation step (precomputed from OSRM at seed time).
export type NavStep = {
  lat: number; lng: number;   // where the maneuver happens
  instruction: string;         // e.g. "Turn right onto Watford Way"
  road: string;                // road name after the maneuver ("" if unknown)
  type: string;                // OSRM maneuver type (turn, roundabout, arrive, …)
  modifier: string;            // OSRM modifier (left, right, slight left, …; "" if none)
  distanceM: number;           // length of this step, maneuver → next maneuver
};

export type Centre = {
  id: string; name: string; address: string; lat: number; lng: number;
  pass_rate: number | null; pass_rate_history: number[]; test_types: string[]; region: string | null;
};
export type RoutePhaseName =
  | "settle-in" | "junction-work" | "faster-road" | "independent" | "manoeuvre" | "return";

/**
 * One leg of a practice loop, as a slice of the route's own coordinates.
 *
 * `faster-road` and `manoeuvre` are missing for a centre with no such road or
 * no street with room to stop, so this is the phases a route actually has —
 * never a fixed six.
 */
export type RoutePhase = {
  name: RoutePhaseName;
  /**
   * The OSM feature that anchored the phase, or "ring" for a synthetic compass
   * point. A plain string rather than the seed script's FeatureKind union: the
   * value is read back out of jsonb, so the app cannot vouch for it.
   */
  kind: string;
  startIdx: number;
  endIdx: number;
};

export type Route = {
  id: string; centre_id: string; name: string; geometry: GeoLineString;
  estimated_minutes: number | null; distance_km: number | null; difficulty: 1 | 2 | 3 | 4 | 5;
  speed_profile: SpeedProfileSegment[]; observation_zones: ObservationZone[]; steps: NavStep[];
  /** Empty for every route seeded before the phase planner existed. */
  phases?: RoutePhase[];
};
export type Hazard = {
  id: string; route_id: string; lat: number; lng: number;
  type: "roundabout" | "zebra" | "narrow" | "junction"; description: string;
  severity: "low" | "medium" | "high";
};
/** One numbered step of a manoeuvre, as the `steps` jsonb array holds it. */
export type ManoeuvreStep = { title: string; detail: string };
export type Manoeuvre = { id: string; name: string; steps: ManoeuvreStep[]; tips: string[] };
/**
 * One departure from the route during a drive.
 *
 * Not a DVSA fault — leaving the examiner's route is not on the marking sheet,
 * so this never reaches `mistakes` or `mock_test_score`. It is recorded
 * because a mock result that quietly hides a wandered drive is not worth
 * taking.
 */
export type Deviation = {
  /** The route vertex the driver left at, into `geometry.coordinates`. */
  atIdx: number;
  lat: number;
  lng: number;
  /** Metres of route skipped by the rejoin that followed. */
  skippedM: number;
  /** How long they were off the route. */
  seconds: number;
};

export type ProgressEntry = {
  id?: string; user_id: string; route_id: string; completed_at?: string;
  mock_test_score: number | null; mistakes: string[]; duration_seconds: number;
  /**
   * Optional rather than defaulted, because every row written before the
   * column existed genuinely has none — and to a reader "[]" and "never
   * recorded" say the same thing, so pretending otherwise would need a
   * backfill that changes nothing anyone can see.
   */
  deviations?: Deviation[];
};

/**
 * A progress row with its route and that route's centre joined on, which is
 * what the home screen's history rows are built from.
 *
 * Deliberately a separate type rather than optional fields on `ProgressEntry`:
 * `insertProgress` takes a `ProgressEntry` and must never be handed a row
 * carrying joined columns that do not exist on the table.
 *
 * `routes` is null for a row whose route has since been deleted.
 */
export type ProgressEntryWithRoute = ProgressEntry & {
  routes: { name: string; centre_id: string; centres: { name: string } | null } | null;
};

/**
 * One option under a quiz question. Exactly one per question is correct.
 *
 * These are not DVSA content. The agency publishes the questions and the model
 * answers, because the real test is verbal and has no options — the three
 * wrong ones per question are written for this app, each bending a single real
 * detail out of true so that picking it means missing the thing that actually
 * gets marked.
 */
export type QuizChoice = { text: string; correct: boolean };

export type QuizCategory = "safety" | "inside_car" | "under_bonnet";

export type QuizQuestion = {
  id: string;
  category: QuizCategory;
  /** "Tyre tread and condition" — the first line of the row. */
  topic: string;
  /** The DVSA wording, in full. Shown in a round, not in the list. */
  question: string;
  /** The DVSA model answer. What the learner says out loud. */
  answer: string;
  is_show_me: boolean;
  choices: QuizChoice[];
};
