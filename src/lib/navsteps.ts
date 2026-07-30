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

export function buildNavSteps(steps: OsrmStep[]): NavStep[] {
  return steps.map((s) => ({
    lat: s.maneuver.location[1],
    lng: s.maneuver.location[0],
    instruction: formatInstruction(s),
    road: (s.name ?? "").trim(),
    type: s.maneuver.type,
    modifier: s.maneuver.modifier ?? "",
    distanceM: Math.round(s.distance ?? 0),
  }));
}
