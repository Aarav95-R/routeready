import type { NavStep } from "@/types/db";

export type OsrmManeuver = { type: string; modifier?: string; location: [number, number]; exit?: number };
export type OsrmStep = { name: string; distance: number; maneuver: OsrmManeuver };

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

// Turn word for a modifier; "" means "no explicit turn" (straight / none).
function turnWord(modifier?: string): string {
  switch (modifier) {
    case "sharp right": return "sharp right";
    case "slight right": return "slight right";
    case "right": return "right";
    case "sharp left": return "sharp left";
    case "slight left": return "slight left";
    case "left": return "left";
    case "uturn": return "around";
    default: return "";
  }
}

export function formatInstruction(s: OsrmStep): string {
  const road = (s.name ?? "").trim();
  const onto = road ? ` onto ${road}` : "";
  const on = road ? ` on ${road}` : "";
  const m = s.maneuver;
  const dir = turnWord(m.modifier);

  switch (m.type) {
    case "depart":
      return road ? `Head off on ${road}` : "Head off";
    case "arrive":
      return "You have reached the end of the route";
    case "turn":
      return dir ? `Turn ${dir}${onto}` : `Continue${onto}`;
    case "end of road":
      return `At the end of the road, turn ${dir || "ahead"}${onto}`;
    case "roundabout":
    case "rotary":
      return m.exit
        ? `At the roundabout, take the ${ordinal(m.exit)} exit${onto}`
        : `At the roundabout, continue${onto}`;
    case "roundabout turn":
      return `At the roundabout, turn ${dir || "ahead"}${onto}`;
    case "merge":
      return `Merge${onto}`;
    case "on ramp":
      return `Take the slip road${onto}`;
    case "off ramp":
      return `Take the exit${onto}`;
    case "fork":
      return dir ? `Keep ${dir}${onto}` : `Continue${onto}`;
    case "new name":
    case "continue":
      return `Continue${on}`;
    default:
      return dir ? `Turn ${dir}${onto}` : `Continue${on}`;
  }
}

// Stitched on the way out: an OSRM response with intermediate waypoints
// arrives as several legs, and what the driver is taking is one drive. See
// stitchLegs below.
export function buildNavSteps(steps: OsrmStep[]): NavStep[] {
  return stitchLegs(steps.map((s) => ({
    lat: s.maneuver.location[1],
    lng: s.maneuver.location[0],
    instruction: formatInstruction(s),
    road: (s.name ?? "").trim(),
    type: s.maneuver.type,
    modifier: s.maneuver.modifier ?? "",
    distanceM: Math.round(s.distance ?? 0),
  })));
}

/**
 * One drive out of OSRM's several legs.
 *
 * A route is fetched in a single call with intermediate waypoints — the
 * seeded loops pass through three OSM features between leaving the test
 * centre and returning to it — and OSRM answers with one leg per waypoint
 * pair. Flattening those legs concatenates their steps, so every leg boundary
 * lands an `arrive` and a `depart` in the middle of the drive: the driver is
 * told "You have reached the end of the route" twice before they have, and
 * then to "Head off" again from a road they are already on.
 *
 * The two are treated differently because they carry different things:
 *
 *   - A mid-route `arrive` is dropped. Measured across the 400 seeded routes
 *     it carries 0 m (max 1 m), and it sits within 1.9 m of the `depart` that
 *     follows it, so nothing geometric goes with it.
 *   - A mid-route `depart` is *retyped*, never dropped. It carries the real
 *     length of the road it starts — a median of 67 m and up to 3.1 km — and
 *     remainingM() sums step.distanceM, so dropping it would count the drive
 *     down to zero kilometres before the car got home.
 *
 * Idempotent, which is what lets it run in two places at once: inside
 * buildNavSteps, so every future seed and every approach fetch is clean at
 * source, and again at read time in the app, so the rows already in Supabase
 * are fixed without a re-push.
 */
export function stitchLegs(steps: NavStep[]): NavStep[] {
  const last = steps.length - 1;
  const out: NavStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === "arrive" && i !== last) continue;
    if (s.type === "depart" && i !== 0) {
      // Phrased exactly as formatInstruction's "continue" case, because that
      // is what this step now is.
      out.push({ ...s, type: "continue", instruction: s.road ? `Continue on ${s.road}` : "Continue" });
      continue;
    }
    out.push(s);
  }
  return out;
}
