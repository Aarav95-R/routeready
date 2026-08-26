import {
  createRouteLifecycle,
  qualifyLocationFix,
  routeLifecycleReducer,
  type RouteFix,
  type RouteLifecycleEvent,
  type RouteLifecycleState,
} from "../routeLifecycle";

const BASE = 1_700_000_000_000;

const fix = (offsetMs: number, overrides: Partial<RouteFix> = {}): RouteFix => ({
  lat: 51.75,
  lng: -0.34,
  timestamp: BASE + offsetMs,
  accuracyM: 5,
  speedMph: 0,
  routeDistanceM: 0,
  startDistanceM: 10,
  finishDistanceM: 10,
  routeProgress: 0,
  trailIdx: 0,
  ...overrides,
});

const send = (state: RouteLifecycleState, event: RouteLifecycleEvent) =>
  routeLifecycleReducer(state, event);

const receive = (state: RouteLifecycleState, value: RouteFix, receivedAt = value.timestamp) =>
  send(state, { type: "FIX_RECEIVED", fix: value, receivedAt });

const beginActive = () => {
  let state = createRouteLifecycle();
  state = receive(state, fix(0));
  state = receive(state, fix(1_500));
  state = receive(state, fix(3_000));
  state = send(state, { type: "BEGIN_REQUESTED", at: BASE + 3_100 });
  return state;
};

test("rejects stale, inaccurate, non-finite, and duplicate fixes", () => {
  const state = createRouteLifecycle();
  const accepted = fix(0);

  expect(qualifyLocationFix(state, accepted, BASE)).toBe(true);
  const withAccepted = receive(state, accepted);
  expect(qualifyLocationFix(withAccepted, accepted, BASE)).toBe(false);
  expect(qualifyLocationFix(state, fix(0, { accuracyM: 26 }), BASE)).toBe(false);
  expect(qualifyLocationFix(state, fix(0, { lat: Number.NaN }), BASE)).toBe(false);
  expect(qualifyLocationFix(state, fix(0), BASE + 5_001)).toBe(false);
});

test("three qualified start fixes spanning three seconds prompt without starting", () => {
  let state = createRouteLifecycle();
  state = receive(state, fix(0));
  state = receive(state, fix(1_500));
  state = receive(state, fix(3_000));

  expect(state.phase).toBe("start-prompt");
  expect(state.startedAt).toBeNull();
  expect(state.effects).toEqual([{ id: "start-ready:1", type: "start-ready" }]);
});

test("start fixes must be slow, close, and span three seconds", () => {
  let state = createRouteLifecycle();
  state = receive(state, fix(0));
  state = receive(state, fix(500));
  state = receive(state, fix(1_000));
  expect(state.phase).toBe("start-candidate");

  state = receive(state, fix(3_000, { speedMph: 6 }));
  expect(state.phase).toBe("preview");

  state = receive(state, fix(4_000, { startDistanceM: 31 }));
  expect(state.phase).toBe("preview");
});

test("begin validates the latest fix and emits started exactly once", () => {
  let state = createRouteLifecycle();
  state = receive(state, fix(0));
  state = receive(state, fix(1_500));
  state = receive(state, fix(3_000));
  state = send(state, { type: "BEGIN_REQUESTED", at: BASE + 3_100 });
  state = send(state, { type: "BEGIN_REQUESTED", at: BASE + 3_200 });

  expect(state.phase).toBe("active");
  expect(state.startedAt).toBe(BASE + 3_100);
  expect(state.effects.filter((effect) => effect.type === "started")).toHaveLength(1);
});

test("begin is refused when the last start fix is stale or outside validation radius", () => {
  let stale = createRouteLifecycle();
  stale = receive(stale, fix(0));
  stale = receive(stale, fix(1_500));
  stale = receive(stale, fix(3_000));
  stale = send(stale, { type: "BEGIN_REQUESTED", at: BASE + 8_001 });
  expect(stale.phase).toBe("start-prompt");

  let far = createRouteLifecycle();
  far = receive(far, fix(0));
  far = receive(far, fix(1_500));
  far = receive(far, fix(3_000));
  far = receive(far, fix(3_100, { startDistanceM: 46 }));
  far = send(far, { type: "BEGIN_REQUESTED", at: BASE + 3_200 });
  expect(far.phase).toBe("preview");
});

test("one or two far fixes never declare a departure", () => {
  let state = beginActive();
  state = receive(state, fix(4_000, { routeDistanceM: 60, trailIdx: 12 }));
  state = receive(state, fix(5_000, { routeDistanceM: 60, trailIdx: 13 }));

  expect(state.phase).toBe("active");
  expect(state.effects.some((effect) => effect.type === "departed")).toBe(false);
});

test("three far fixes must span three seconds and emit one departure and recovery request", () => {
  let state = beginActive();
  state = receive(state, fix(4_000, { routeDistanceM: 60, trailIdx: 12 }));
  state = receive(state, fix(4_500, { routeDistanceM: 60, trailIdx: 13 }));
  state = receive(state, fix(5_000, { routeDistanceM: 60, trailIdx: 14 }));
  expect(state.phase).toBe("active");

  state = receive(state, fix(7_000, { routeDistanceM: 60, trailIdx: 15 }));
  state = receive(state, fix(8_000, { routeDistanceM: 70, trailIdx: 16 }));

  expect(state.phase).toBe("off-route");
  expect(state.effects.filter((effect) => effect.type === "departed")).toHaveLength(1);
  expect(state.effects.filter((effect) => effect.type === "request-recovery")).toHaveLength(1);
});

test("a qualified self-rejoin emits one monotonic rejoin index", () => {
  let state = beginActive();
  state = receive(state, fix(4_000, { routeDistanceM: 60, trailIdx: 12 }));
  state = receive(state, fix(5_500, { routeDistanceM: 60, trailIdx: 13 }));
  state = receive(state, fix(7_000, { routeDistanceM: 60, trailIdx: 14 }));
  state = receive(state, fix(8_000, { routeDistanceM: 20, trailIdx: 80 }));
  state = receive(state, fix(9_000, { routeDistanceM: 20, trailIdx: 82 }));
  state = receive(state, fix(10_000, { routeDistanceM: 10, trailIdx: 83 }));

  expect(state.phase).toBe("active");
  expect(state.progressFloorIdx).toBe(83);
  expect(state.effects.filter((effect) => effect.type === "rejoined")).toEqual([
    expect.objectContaining({ type: "rejoined", rejoinIdx: 82 }),
  ]);
});

test("recovery readiness enters returning and never lowers the selected rejoin", () => {
  let state = beginActive();
  state = receive(state, fix(4_000, { routeDistanceM: 60, trailIdx: 20 }));
  state = receive(state, fix(5_500, { routeDistanceM: 60, trailIdx: 21 }));
  state = receive(state, fix(7_000, { routeDistanceM: 60, trailIdx: 22 }));
  state = send(state, { type: "RECOVERY_READY", requestId: state.recoveryRequestId!, rejoinIdx: 180 });

  expect(state.phase).toBe("returning");
  expect(state.rejoinIdx).toBe(180);
});

test("finish ignores the closed-loop start until route progress reaches ninety percent", () => {
  let state = beginActive();
  state = receive(state, fix(7_000, { routeProgress: 0.89, finishDistanceM: 0, trailIdx: 90 }));
  state = receive(state, fix(10_000, { routeProgress: 0.89, finishDistanceM: 0, trailIdx: 91 }));

  expect(state.phase).toBe("active");
  expect(state.finishCandidateAt).toBeNull();
});

test("two qualified finish fixes spanning three seconds latch a prompt without completing", () => {
  let state = beginActive();
  state = receive(state, fix(7_000, { routeProgress: 0.91, finishDistanceM: 20, trailIdx: 100 }));
  state = receive(state, fix(10_000, { routeProgress: 0.92, finishDistanceM: 15, trailIdx: 101 }));

  expect(state.phase).toBe("finish-prompt");
  expect(state.finishCandidateAt).toBe(BASE + 7_000);
  expect(state.effects.some((effect) => effect.type === "completed")).toBe(false);
});

test("end completes exactly once using the latched candidate time", () => {
  let state = beginActive();
  state = receive(state, fix(7_000, { routeProgress: 0.91, finishDistanceM: 20 }));
  state = receive(state, fix(10_000, { routeProgress: 0.92, finishDistanceM: 15 }));
  state = send(state, { type: "END_REQUESTED", at: BASE + 20_000 });
  state = send(state, { type: "END_REQUESTED", at: BASE + 21_000 });

  expect(state.phase).toBe("complete");
  expect(state.completedAt).toBe(BASE + 7_000);
  expect(state.effects.filter((effect) => effect.type === "completed")).toHaveLength(1);
});

test("keep driving suppresses finish until zone exit and re-entry", () => {
  let state = beginActive();
  state = receive(state, fix(7_000, { routeProgress: 0.91, finishDistanceM: 20 }));
  state = receive(state, fix(10_000, { routeProgress: 0.92, finishDistanceM: 15 }));
  state = send(state, { type: "KEEP_DRIVING" });
  state = receive(state, fix(14_000, { routeProgress: 0.93, finishDistanceM: 10 }));
  state = receive(state, fix(17_000, { routeProgress: 0.94, finishDistanceM: 10 }));
  expect(state.phase).toBe("active");

  state = receive(state, fix(18_000, { routeProgress: 0.95, finishDistanceM: 40 }));
  state = receive(state, fix(19_000, { routeProgress: 0.95, finishDistanceM: 20 }));
  state = receive(state, fix(22_000, { routeProgress: 0.96, finishDistanceM: 10 }));
  expect(state.phase).toBe("finish-prompt");
});

test("watch failures become recoverable without completing", () => {
  let state = beginActive();
  state = send(state, { type: "LOCATION_FAILED", reason: "watch-failed" });

  expect(state.phase).toBe("location-unavailable");
  expect(state.effects.at(-1)).toEqual({
    id: "location-unavailable:3",
    type: "location-unavailable",
    reason: "watch-failed",
  });
});

test("acknowledging an effect removes only that effect", () => {
  let state = beginActive();
  const started = state.effects.find((effect) => effect.type === "started")!;
  state = send(state, { type: "EFFECT_HANDLED", id: started.id });

  expect(state.effects.some((effect) => effect.id === started.id)).toBe(false);
  expect(state.effects.some((effect) => effect.type === "start-ready")).toBe(true);
});
