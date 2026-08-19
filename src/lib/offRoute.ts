/**
 * Whether the driver is still on the route, and what to do about it.
 *
 * `navSnap` in ./navmap has reported an `onRoute` flag since the nav map was
 * built, and nothing consumed it. The reason it could not simply be shown is
 * that a single fix beyond the snap radius means nothing: urban canyons,
 * multi-storey car parks and tunnel mouths throw fixes hundreds of metres
 * wide, and a banner driven straight off that flag strobes at every red light
 * beside a tall building.
 *
 * So this is a machine, not an `if`. Two things stop it flapping: entry and
 * exit use different distances, and both directions need consecutive fixes.
 * Noise that crosses one threshold cannot cross the other.
 *
 * Pure — no React, no network. The screens own the fetching and the speaking.
 */

import { bearingDeg, haversineM, turnAngleDeg, type LatLng } from "./geo";
import { formatDistance } from "./navigation";

/** Past this distance from the line the driver is a candidate for "left the route". */
export const OFF_ROUTE_ENTER_M = 45;
/**
 * Back inside this and they are on it again. Twenty metres below entry: the
 * gap is the hysteresis, and it is what a fix sitting exactly on the boundary
 * cannot oscillate across.
 */
export const OFF_ROUTE_EXIT_M = 25;
/** At roughly 1 Hz, three seconds of genuinely being somewhere else. */
export const ENTER_FIXES = 3;
/** Faster to forgive than to accuse. */
export const EXIT_FIXES = 2;
/**
 * Below this, a rejoin is not worth mentioning. Telling a driver they missed
 * 40 m is noise, and noise is what makes people mute an app mid-drive.
 */
export const SKIP_WARN_M = 250;

export type OffRoutePhase = "on-route" | "straying" | "off-route" | "returning";

export type OffRouteState = {
  phase: OffRoutePhase;
  /** Consecutive fixes supporting the transition currently being considered. */
  streak: number;
  /**
   * The route vertex the driver was last on before leaving, or null while on
   * the route. Captured at the *first* straying fix rather than when the
   * departure is declared, because by the third fix the trail index has
   * already crept along the nearest bit of line the driver is no longer on.
   */
  departedIdx: number | null;
};

export const initialOffRoute: OffRouteState = { phase: "on-route", streak: 0, departedIdx: null };

export type OffRouteInput = {
  /** Distance from this fix to the nearest point on the active route polyline. */
  routeDistM: number;
  /** Distance to the return leg, or null when there is no return leg yet. */
  returnLegDistM: number | null;
  /** The trail index at this fix. */
  trailIdx: number;
  /** True once a return leg has been fetched and is being navigated. */
  returnLegReady: boolean;
};

/**
 * What the screen has to act on. Every event fires exactly once per
 * occurrence — the screens speak and vibrate on these, so a repeat is a
 * driver being told the same thing twice.
 */
export type OffRouteEvent = "none" | "departed" | "rejoined" | "recompute";

export type OffRouteStep = { state: OffRouteState; event: OffRouteEvent };

const on = (): OffRouteState => ({ phase: "on-route", streak: 0, departedIdx: null });

export function stepOffRoute(prev: OffRouteState, input: OffRouteInput): OffRouteStep {
  const { routeDistM, returnLegDistM, trailIdx, returnLegReady } = input;
  const near = routeDistM <= OFF_ROUTE_EXIT_M;
  const far = routeDistM > OFF_ROUTE_ENTER_M;

  switch (prev.phase) {
    case "on-route":
      if (!far) return { state: prev, event: "none" };
      return { state: { phase: "straying", streak: 1, departedIdx: trailIdx }, event: "none" };

    case "straying": {
      if (near) return { state: on(), event: "none" };
      // Between the two thresholds: hold everything, including the streak.
      if (!far) return { state: prev, event: "none" };
      const streak = prev.streak + 1;
      if (streak < ENTER_FIXES) return { state: { ...prev, streak }, event: "none" };
      return { state: { ...prev, phase: "off-route", streak: 0 }, event: "departed" };
    }

    case "off-route": {
      // They may find their own way back before the directions call resolves.
      if (near) {
        const streak = prev.streak + 1;
        if (streak < EXIT_FIXES) return { state: { ...prev, streak }, event: "none" };
        return { state: on(), event: "rejoined" };
      }
      if (returnLegReady) return { state: { ...prev, phase: "returning", streak: 0 }, event: "none" };
      return { state: { ...prev, streak: 0 }, event: "none" };
    }

    case "returning": {
      if (near) {
        const streak = prev.streak + 1;
        if (streak < EXIT_FIXES) return { state: { ...prev, streak }, event: "none" };
        return { state: on(), event: "rejoined" };
      }
      // Off the return leg too — the rejoin we picked is no longer reachable
      // the way we planned, so ask for a new one. Measured against the return
      // leg, not the route: the driver is *supposed* to be far from the route
      // here, and scoring that as a second departure would loop forever.
      if (returnLegDistM !== null && returnLegDistM > OFF_ROUTE_ENTER_M) {
        const streak = prev.streak + 1;
        if (streak < ENTER_FIXES) return { state: { ...prev, streak }, event: "none" };
        return { state: { ...prev, phase: "off-route", streak: 0 }, event: "recompute" };
      }
      return { state: { ...prev, streak: 0 }, event: "none" };
    }
  }
}

/**
 * What a metre of skipped route costs, against a metre of driving to reach the
 * rejoin. Above 1 so that skipping is never free — at 1.0 the scorer would
 * happily throw away half the loop to save a single metre of detour — and not
 * far above it, because a driver who has genuinely overshot should not be sent
 * backwards down the road to save route they can no longer reach.
 */
export const SKIP_PENALTY = 1.5;

/**
 * A rejoin more than this far off the driver's heading is behind them, and
 * reaching it means a U-turn. 120° rather than 90°: at exactly abeam, a point
 * across a dual carriageway is usually still reachable at the next junction,
 * and rejecting it would push the rejoin needlessly far down the route.
 */
export const BEHIND_DEG = 120;

export type Rejoin = {
  /** Index into the route polyline to rejoin at. */
  idx: number;
  point: LatLng;
  /** Metres of route between where they left and where they rejoin. */
  skippedM: number;
};

/**
 * The cheapest point on the route ahead that does not require a U-turn.
 *
 * Candidates start at `departedIdx` and run to the end of the line. Rejoining
 * *behind* the departure is deliberately not offered: that is the "drive back
 * to where you went wrong" option, and on a missed roundabout exit it means
 * instructing a learner to turn around, which this app should not do.
 *
 * `headingDeg` is the driver's course, or null when they are too slow for one
 * to be meaningful (see travelBearing). Null disables the behind-you filter
 * rather than rejecting everything: a stationary driver has no "behind".
 */
export function chooseRejoin(
  coords: LatLng[],
  cum: number[],
  pos: LatLng,
  departedIdx: number,
  headingDeg: number | null,
): Rejoin | null {
  const from = Math.min(Math.max(departedIdx, 0), coords.length - 1);
  if (from >= coords.length - 1) return null;

  let best: Rejoin | null = null;
  let bestScore = Infinity;

  for (let i = from; i < coords.length; i++) {
    const c = coords[i];
    const reach = haversineM(pos, c);
    // Below a metre there is no meaningful bearing to the candidate, and the
    // driver is already on it.
    if (headingDeg !== null && reach > 1) {
      const off = Math.abs(turnAngleDeg(headingDeg, bearingDeg(pos, c)));
      if (off > BEHIND_DEG) continue;
    }
    const skippedM = Math.max(0, (cum[i] ?? 0) - (cum[from] ?? 0));
    const score = reach + skippedM * SKIP_PENALTY;
    if (score < bestScore) {
      bestScore = score;
      best = { idx: i, point: c, skippedM: Math.round(skippedM) };
    }
  }

  return best;
}

export const REJOINED_LINE = "Back on route.";

/**
 * What the app says when the driver has left the route.
 *
 * The distance is dropped below SKIP_WARN_M rather than rounded down to zero:
 * a sentence ending "you'll miss about 0 m" is worse than one that does not
 * mention it at all, and the number is only there to tell the learner they
 * have some route left worth re-driving.
 */
export function departureLine(skippedM: number): string {
  if (skippedM < SKIP_WARN_M) return "You've left the route. Getting you back on.";
  return `You've left the route. Rejoining ahead — you'll miss about ${formatDistance(skippedM)}.`;
}
