import type { Route } from "@/types/db";

/**
 * Who may drive what, as pure functions.
 *
 * Kept out of the store and out of the screens for the reason `homeView` and
 * `routeSummary` are: these are the rules that decide whether somebody gets
 * what they paid for, and they should be provable without mounting a screen,
 * faking a purchase, or reaching a network.
 */

/** What the client believes, including not yet knowing. */
export type EntitlementStatus = "active" | "lapsed" | "unknown";

/** What a device can have written down. Never "unknown" — that is not a fact. */
export type StoredStatus = "active" | "lapsed";

/**
 * The status to act on, given what the network said and what this device
 * already knew.
 *
 * The fallback exists because a test centre car park is a plausible place to
 * have no signal, and a paying learner standing in one must not be locked out
 * of the route they came to drive.
 *
 * A device with no mirror at all resolves to `lapsed` rather than `active`.
 * That is the safe direction and it costs nothing: a device that has never
 * resolved an entitlement has never cached a locked route's steps either, so
 * opening the gate would reveal nothing.
 */
export function resolveStatus(live: EntitlementStatus, mirrored: StoredStatus | null): EntitlementStatus {
  if (live !== "unknown") return live;
  return mirrored ?? "lapsed";
}

export function isEntitled(status: EntitlementStatus): boolean {
  return status === "active";
}

/**
 * The one question every screen asks.
 *
 * Takes the route rather than a route id so it cannot be called without the
 * `is_free` flag in hand — the flag travels on every row `listRoutesByCentre`
 * returns, so there is never a reason to fetch it separately.
 */
export function canDrive(route: Pick<Route, "is_free">, status: EntitlementStatus): boolean {
  return route.is_free || isEntitled(status);
}

/** How many of a centre's routes this person cannot open. */
export function lockedCount(routes: Pick<Route, "is_free">[], status: EntitlementStatus): number {
  return routes.filter((r) => !canDrive(r, status)).length;
}

/**
 * The first route this person could actually drive.
 *
 * Nothing calls this yet, and that is not an oversight: no screen currently
 * names a particular route to drive next. Home's next step sends people to
 * the centres list, and the result screen sends them back to the route they
 * just drove — neither picks one out of a list, so neither can point at a
 * wall. `listRoutesByCentre` has a single caller, the centre screen, and that
 * one gates every card it draws.
 *
 * It is kept because the moment any screen does recommend a route — "drive
 * this one next", a shortcut on Home, a suggestion after a failed test — this
 * is the function it must go through, and the rule is easier to apply than to
 * remember. Generic in its element type so a caller keeps whatever else its
 * rows carry — an id, a name — rather than getting back a bare `{ is_free }`.
 */
export function firstDrivable<T extends Pick<Route, "is_free">>(
  routes: T[], status: EntitlementStatus,
): T | null {
  return routes.find((r) => canDrive(r, status)) ?? null;
}
