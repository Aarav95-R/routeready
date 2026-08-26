export const MAX_FIX_AGE_MS = 5_000;
export const MAX_ACCURACY_M = 25;
export const MAX_STOPPED_SPEED_MPH = 5;
export const START_RADIUS_M = 30;
export const START_CONFIRM_RADIUS_M = 45;
export const FINISH_RADIUS_M = 30;
export const OFF_ROUTE_ENTER_M = 45;
export const OFF_ROUTE_EXIT_M = 25;
export const CANDIDATE_SPAN_MS = 3_000;

export type RouteLifecyclePhase =
  | "preview"
  | "start-candidate"
  | "start-prompt"
  | "active"
  | "off-route"
  | "returning"
  | "finish-candidate"
  | "finish-prompt"
  | "complete"
  | "location-unavailable"
  | "abandoned";

export type RouteFix = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracyM: number;
  speedMph: number;
  routeDistanceM: number;
  startDistanceM: number;
  finishDistanceM: number;
  routeProgress: number;
  trailIdx: number;
};

export type RouteLifecycleEffect =
  | { id: string; type: "start-ready" }
  | { id: string; type: "started"; at: number }
  | { id: string; type: "departed"; departedIdx: number }
  | { id: string; type: "request-recovery"; requestId: string }
  | { id: string; type: "rejoined"; rejoinIdx: number }
  | { id: string; type: "finish-ready"; at: number }
  | { id: string; type: "completed"; at: number }
  | { id: string; type: "location-unavailable"; reason: string };

type Candidate = { firstAt: number; lastAt: number; count: number };

export type RouteLifecycleState = {
  phase: RouteLifecyclePhase;
  lastAcceptedFix: RouteFix | null;
  startedAt: number | null;
  finishCandidateAt: number | null;
  completedAt: number | null;
  progressFloorIdx: number;
  startCandidate: Candidate | null;
  departureCandidate: Candidate | null;
  departedIdx: number | null;
  rejoinCandidate: Candidate | null;
  finishCandidate: Candidate | null;
  finishSuppressed: boolean;
  recoveryRequestId: string | null;
  recoverySequence: number;
  rejoinIdx: number | null;
  effects: RouteLifecycleEffect[];
  effectSequence: number;
};

export type RouteLifecycleEvent =
  | { type: "FIX_RECEIVED"; fix: RouteFix; receivedAt: number }
  | { type: "BEGIN_REQUESTED"; at: number }
  | { type: "RECOVERY_READY"; requestId: string; rejoinIdx: number }
  | { type: "RECOVERY_FAILED"; requestId: string }
  | { type: "KEEP_DRIVING" }
  | { type: "END_REQUESTED"; at: number }
  | { type: "LOCATION_FAILED"; reason: string }
  | { type: "RETRY_LOCATION" }
  | { type: "ABANDON" }
  | { type: "EFFECT_HANDLED"; id: string };

export function createRouteLifecycle(): RouteLifecycleState {
  return {
    phase: "preview",
    lastAcceptedFix: null,
    startedAt: null,
    finishCandidateAt: null,
    completedAt: null,
    progressFloorIdx: 0,
    startCandidate: null,
    departureCandidate: null,
    departedIdx: null,
    rejoinCandidate: null,
    finishCandidate: null,
    finishSuppressed: false,
    recoveryRequestId: null,
    recoverySequence: 0,
    rejoinIdx: null,
    effects: [],
    effectSequence: 0,
  };
}

const finite = (...values: number[]) => values.every(Number.isFinite);

export function qualifyLocationFix(
  state: RouteLifecycleState,
  fix: RouteFix,
  receivedAt: number,
): boolean {
  if (!finite(
    fix.lat,
    fix.lng,
    fix.timestamp,
    fix.accuracyM,
    fix.speedMph,
    fix.routeDistanceM,
    fix.startDistanceM,
    fix.finishDistanceM,
    fix.routeProgress,
    fix.trailIdx,
    receivedAt,
  )) return false;
  const age = receivedAt - fix.timestamp;
  if (age < 0 || age > MAX_FIX_AGE_MS || fix.accuracyM > MAX_ACCURACY_M) return false;
  const previous = state.lastAcceptedFix;
  return !previous || previous.timestamp !== fix.timestamp || previous.lat !== fix.lat || previous.lng !== fix.lng;
}

function appendEffect<T extends Omit<RouteLifecycleEffect, "id">>(
  state: RouteLifecycleState,
  effect: T,
): RouteLifecycleState {
  const effectSequence = state.effectSequence + 1;
  const next = { ...effect, id: `${effect.type}:${effectSequence}` } as RouteLifecycleEffect;
  return { ...state, effectSequence, effects: [...state.effects, next] };
}

const candidateStep = (candidate: Candidate | null, timestamp: number): Candidate => ({
  firstAt: candidate?.firstAt ?? timestamp,
  lastAt: timestamp,
  count: (candidate?.count ?? 0) + 1,
});

const candidateConfirmed = (candidate: Candidate, count: number, spanMs: number) =>
  candidate.count >= count && candidate.lastAt - candidate.firstAt >= spanMs;

function startFix(state: RouteLifecycleState, fix: RouteFix): RouteLifecycleState {
  const eligible = fix.startDistanceM <= START_RADIUS_M && fix.speedMph <= MAX_STOPPED_SPEED_MPH;
  if (!eligible) return {
    ...state,
    phase: "preview",
    startCandidate: null,
    lastAcceptedFix: fix,
  };
  const candidate = candidateStep(state.startCandidate, fix.timestamp);
  if (!candidateConfirmed(candidate, 3, CANDIDATE_SPAN_MS)) return {
    ...state,
    phase: "start-candidate",
    startCandidate: candidate,
    lastAcceptedFix: fix,
  };
  return appendEffect({
    ...state,
    phase: "start-prompt",
    startCandidate: candidate,
    lastAcceptedFix: fix,
  }, { type: "start-ready" });
}

function finishEligible(fix: RouteFix): boolean {
  return fix.routeProgress >= 0.9
    && fix.finishDistanceM <= FINISH_RADIUS_M
    && fix.speedMph <= MAX_STOPPED_SPEED_MPH;
}

function activeFix(state: RouteLifecycleState, fix: RouteFix): RouteLifecycleState {
  const nearRoute = fix.routeDistanceM <= OFF_ROUTE_EXIT_M;
  const farRoute = fix.routeDistanceM > OFF_ROUTE_ENTER_M;
  let next: RouteLifecycleState = {
    ...state,
    lastAcceptedFix: fix,
    progressFloorIdx: farRoute ? state.progressFloorIdx : Math.max(state.progressFloorIdx, fix.trailIdx),
  };

  if (state.finishSuppressed) {
    if (fix.finishDistanceM > FINISH_RADIUS_M) next.finishSuppressed = false;
    else return { ...next, departureCandidate: null, finishCandidate: null };
  }

  if (farRoute) {
    const candidate = candidateStep(state.departureCandidate, fix.timestamp);
    next = { ...next, departureCandidate: candidate, finishCandidate: null };
    if (!candidateConfirmed(candidate, 3, CANDIDATE_SPAN_MS)) return next;

    const recoverySequence = state.recoverySequence + 1;
    const requestId = `recovery:${recoverySequence}`;
    next = {
      ...next,
      phase: "off-route",
      departureCandidate: null,
      departedIdx: state.departedIdx ?? state.progressFloorIdx,
      recoveryRequestId: requestId,
      recoverySequence,
      rejoinCandidate: null,
    };
    next = appendEffect(next, { type: "departed", departedIdx: next.departedIdx! });
    return appendEffect(next, { type: "request-recovery", requestId });
  }

  next.departureCandidate = nearRoute ? null : state.departureCandidate;
  if (!finishEligible(fix)) return { ...next, phase: "active", finishCandidate: null, finishCandidateAt: null };

  const candidate = candidateStep(state.finishCandidate, fix.timestamp);
  if (!candidateConfirmed(candidate, 2, CANDIDATE_SPAN_MS)) return {
    ...next,
    phase: "finish-candidate",
    finishCandidate: candidate,
    finishCandidateAt: candidate.firstAt,
  };
  return appendEffect({
    ...next,
    phase: "finish-prompt",
    finishCandidate: candidate,
    finishCandidateAt: candidate.firstAt,
  }, { type: "finish-ready", at: candidate.firstAt });
}

function recoveryFix(state: RouteLifecycleState, fix: RouteFix): RouteLifecycleState {
  const near = fix.routeDistanceM <= OFF_ROUTE_EXIT_M;
  let next = { ...state, lastAcceptedFix: fix };
  if (!near) return { ...next, rejoinCandidate: null };

  const candidate = candidateStep(state.rejoinCandidate, fix.timestamp);
  if (candidate.count < 2) return { ...next, rejoinCandidate: candidate };

  const rejoinIdx = Math.max(state.progressFloorIdx, state.rejoinIdx ?? 0, fix.trailIdx);
  next = {
    ...next,
    phase: "active",
    progressFloorIdx: rejoinIdx,
    rejoinIdx: null,
    rejoinCandidate: null,
    departedIdx: null,
    recoveryRequestId: null,
  };
  return appendEffect(next, { type: "rejoined", rejoinIdx });
}

function acceptedFix(state: RouteLifecycleState, fix: RouteFix): RouteLifecycleState {
  switch (state.phase) {
    case "preview":
    case "start-candidate":
    case "start-prompt":
      return startFix(state, fix);
    case "active":
    case "finish-candidate":
      return activeFix(state, fix);
    case "off-route":
    case "returning":
      return recoveryFix(state, fix);
    default:
      return { ...state, lastAcceptedFix: fix };
  }
}

export function routeLifecycleReducer(
  state: RouteLifecycleState,
  event: RouteLifecycleEvent,
): RouteLifecycleState {
  switch (event.type) {
    case "FIX_RECEIVED":
      return qualifyLocationFix(state, event.fix, event.receivedAt)
        ? acceptedFix(state, event.fix)
        : state;

    case "BEGIN_REQUESTED": {
      if (state.phase !== "start-prompt" || !state.lastAcceptedFix) return state;
      const fix = state.lastAcceptedFix;
      const fresh = event.at - fix.timestamp >= 0 && event.at - fix.timestamp <= MAX_FIX_AGE_MS;
      if (!fresh || fix.startDistanceM > START_CONFIRM_RADIUS_M) return state;
      return appendEffect({
        ...state,
        phase: "active",
        startedAt: event.at,
        startCandidate: null,
        finishCandidate: null,
      }, { type: "started", at: event.at });
    }

    case "RECOVERY_READY":
      if (state.phase !== "off-route" || state.recoveryRequestId !== event.requestId) return state;
      return {
        ...state,
        phase: "returning",
        rejoinIdx: Math.max(state.progressFloorIdx, event.rejoinIdx),
      };

    case "RECOVERY_FAILED":
      return state.recoveryRequestId === event.requestId ? { ...state, phase: "off-route" } : state;

    case "KEEP_DRIVING":
      if (state.phase !== "finish-prompt") return state;
      return {
        ...state,
        phase: "active",
        finishCandidate: null,
        finishCandidateAt: null,
        finishSuppressed: true,
      };

    case "END_REQUESTED": {
      if (state.phase !== "finish-prompt" || state.finishCandidateAt === null) return state;
      const at = state.finishCandidateAt;
      return appendEffect({ ...state, phase: "complete", completedAt: at }, { type: "completed", at });
    }

    case "LOCATION_FAILED":
      if (state.phase === "complete" || state.phase === "abandoned") return state;
      return appendEffect({ ...state, phase: "location-unavailable" }, {
        type: "location-unavailable",
        reason: event.reason,
      });

    case "RETRY_LOCATION":
      return state.phase === "location-unavailable" ? { ...state, phase: "preview" } : state;

    case "ABANDON":
      return state.phase === "complete" ? state : { ...state, phase: "abandoned" };

    case "EFFECT_HANDLED":
      return { ...state, effects: state.effects.filter((effect) => effect.id !== event.id) };
  }
}
