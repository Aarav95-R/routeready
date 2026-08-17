import { haversineM, LatLng } from "@/lib/geo";
import type { Centre } from "@/types/db";

export type CentreSort = "nearest" | "pass";
export type CentreFilter = "all" | "manual" | "auto";

export type ViewCentre = {
  centre: Centre;
  /** Straight line, metres. Null until there is a fix — never a drive time. */
  distanceM: number | null;
  /** In the near set, so it has a pin on the map and moves the camera. */
  pinned: boolean;
};

export type CentreSection = { title: string; data: ViewCentre[] };

export const NEAR_RADIUS_M = 30 * 1609.34;
export const NEAR_MAX = 12;   // the identity palette is twelve, so a full near set never repeats a colour
export const NEAR_MIN = 8;    // a rural driver with nothing in range still gets a map worth looking at

/**
 * Nearest-first comparator, curried on the fix so `[...list].sort(byDistance(me))`
 * reads at the call site. The one definition, shared by this module's own
 * near-set/sort logic and by the screen's identity-assignment ordering, so
 * "nearest" cannot mean two slightly different things in two places.
 */
export const byDistance = (me: LatLng) => (a: Centre, b: Centre) =>
  haversineM(me, { lat: a.lat, lng: a.lng }) - haversineM(me, { lat: b.lat, lng: b.lng });

/**
 * The centres the map plots. Forty centres across fifteen regions cannot all be
 * pins: at a zoom that fits Newcastle and Kent the distance rings mean nothing
 * and every London centre is one dot.
 */
export function nearSet(centres: Centre[], me: LatLng | null): Centre[] {
  if (!me) return [];
  const sorted = [...centres].sort(byDistance(me));
  const within = sorted.filter((c) => haversineM(me, { lat: c.lat, lng: c.lng }) <= NEAR_RADIUS_M);
  const chosen = within.length > 0 ? within : sorted.slice(0, NEAR_MIN);
  return chosen.slice(0, NEAR_MAX);
}

/**
 * Everything the sheet renders, in the order it renders it.
 *
 * Sort and filter are separate axes on purpose. The screen this replaces put
 * "Nearest", "Pass rate", "Manual" and "Auto" in one segmented control, so
 * choosing a car type silently threw away the sort.
 */
export function buildSections(input: {
  centres: Centre[];
  me: LatLng | null;
  sort: CentreSort;
  filter: CentreFilter;
  query: string;
}): CentreSection[] {
  const { centres, me, sort, filter, query } = input;

  const near = new Set(nearSet(centres, me).map((c) => c.id));

  const q = query.trim().toLowerCase();
  let shown = centres;
  if (q) {
    shown = shown.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.region ?? "").toLowerCase().includes(q)
    );
  }
  if (filter !== "all") shown = shown.filter((c) => c.test_types.includes(filter));

  // Sorting by distance needs a fix; without one the control offering it is
  // disabled, and this stays a safe no-op if it is ever reached anyway.
  const ordered =
    sort === "nearest" && me
      ? [...shown].sort(byDistance(me))
      : [...shown].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0));

  const toView = (centre: Centre): ViewCentre => ({
    centre,
    distanceM: me ? haversineM(me, { lat: centre.lat, lng: centre.lng }) : null,
    pinned: near.has(centre.id),
  });

  if (!me) return [{ title: "All centres", data: ordered.map(toView) }];

  const sections: CentreSection[] = [];
  const pinned = ordered.filter((c) => near.has(c.id)).map(toView);
  const rest = ordered.filter((c) => !near.has(c.id)).map(toView);
  if (pinned.length) sections.push({ title: "Near you", data: pinned });
  if (rest.length) sections.push({ title: "Further afield", data: rest });
  return sections;
}

/**
 * What the user last pointed the sheet at.
 *
 * Three states, and the third is why this is not just `string | null`:
 * `undefined` means nothing has been chosen yet, `null` means nothing is
 * deliberately chosen — which is what scrolling onto "Further afield" means,
 * since those rows have no pin to fly to. Collapsing the two would make the
 * screen re-seize the camera back to the first pin the instant somebody
 * scrolled past the near set.
 */
export type ChosenCentre = string | null | undefined;

/**
 * Which centre the map points at: the choice, reconciled against what is
 * actually on screen.
 *
 * Derived rather than corrected after the fact. The screen used to hold this
 * as state and patch it from two effects — one seeding the first pin on open,
 * one repairing it when a filter or a search took the chosen centre away — and
 * both were writing state during a render they had just finished, so the map
 * drew one frame pointed at a centre that was no longer on it.
 *
 * Filtering a chosen centre away falls back to the first remaining pin rather
 * than to nothing, because the map wants somewhere to be; an empty list is the
 * only thing that genuinely has no answer.
 */
export function activeCentreId(chosen: ChosenCentre, pins: Centre[]): string | null {
  if (chosen === null) return null;
  if (chosen !== undefined && pins.some((p) => p.id === chosen)) return chosen;
  return pins[0]?.id ?? null;
}
