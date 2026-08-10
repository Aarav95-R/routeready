import type { ObservationZone, ProgressEntry, Route } from "@/types/db";

// The words a learner uses for a route, derived from columns the routes table
// already carries. Nothing here fetches: `observation_zones` and
// `speed_profile` ride along with every row `listRoutesByCentre` returns, so a
// card can describe its route offline and without a second round trip.

const DIFFICULTY = ["Very gentle", "Gentle", "Steady", "Testing", "Demanding"] as const;

export function difficultyWord(level: 1 | 2 | 3 | 4 | 5): string {
  return DIFFICULTY[level - 1] ?? "Steady";
}

const NUMBERS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

// "a roundabout" reads better than "one roundabout"; past nine, words read
// worse than the numeral does.
function count(n: number, singular: string, plural: string): string {
  if (n === 1) return `a ${singular}`;
  return `${n < 10 ? NUMBERS[n] : n} ${plural}`;
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// The lead clause is set by the fastest stretch, because that is what makes a
// route feel different to drive. A learner's worry is the 60 mph section, not
// the twelve residential streets around it.
function leadClause(topLimit: number | null): string {
  if (topLimit === null) return "";
  if (topLimit <= 20) return "Slow, narrow streets";
  if (topLimit <= 30) return "Quiet streets";
  if (topLimit <= 40) return "Town roads and a 40 mph stretch";
  if (topLimit <= 60) return "Open 60 mph road";
  return "Dual carriageway at 70";
}

const ZONE_WORDS: Record<ObservationZone["kind"], [string, string]> = {
  roundabout: ["roundabout", "roundabouts"],
  junction: ["junction", "junctions"],
  pedestrian: ["crossing", "crossings"],
};
const ZONE_ORDER: ObservationZone["kind"][] = ["roundabout", "junction", "pedestrian"];

/** One plain-English line describing what the drive is like. */
export function plainSummary(route: Route): string {
  const limits = (route.speed_profile ?? []).map((s) => s.limitMph);
  const lead = leadClause(limits.length ? Math.max(...limits) : null);

  const tally = new Map<ObservationZone["kind"], number>();
  for (const z of route.observation_zones ?? []) tally.set(z.kind, (tally.get(z.kind) ?? 0) + 1);

  const features = joinClauses(
    ZONE_ORDER.filter((k) => tally.has(k)).map((k) => count(tally.get(k)!, ...ZONE_WORDS[k]))
  );

  if (!lead && !features) return "A steady drive around the area.";
  if (!features) return `${lead}.`;
  if (!lead) return `${features.charAt(0).toUpperCase()}${features.slice(1)} to watch.`;
  return `${lead}, with ${features}.`;
}

// `user_progress` is written in one place only — after a mock test finishes
// (app/route/[id]/result.tsx). Practice drives record nothing, so this speaks
// of mock tests rather than claiming the route has been "driven".
function scores(rows: ProgressEntry[]): number[] {
  return rows.map((r) => r.mock_test_score).filter((s): s is number => typeof s === "number");
}

/** The history line under a route's name, or null when there is no history. */
export function progressLine(rows: ProgressEntry[]): string | null {
  if (rows.length === 0) return null;
  const tests = `${rows.length} mock test${rows.length === 1 ? "" : "s"}`;
  const best = scores(rows);
  return best.length ? `${tests} · best score ${Math.max(...best)}` : tests;
}

/** The badge over the route's map. */
export function progressBadge(rows: ProgressEntry[]): string {
  if (rows.length === 0) return "New";
  const best = scores(rows);
  return best.length ? `Best ${Math.max(...best)}` : "Attempted";
}

// Seeded names read "Route 1 · Town loop". The card's position in the list
// already says which number it is, so the prefix is noise.
export function shortRouteName(name: string): string {
  return name.replace(/^Route\s+\d+\s*·\s*/u, "");
}
