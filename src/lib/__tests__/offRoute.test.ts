import {
  ENTER_FIXES,
  initialOffRoute,
  OFF_ROUTE_ENTER_M,
  stepOffRoute,
  type OffRouteInput,
  type OffRouteState,
} from "../offRoute";

const input = (over: Partial<OffRouteInput> = {}): OffRouteInput => ({
  routeDistM: 5,
  returnLegDistM: null,
  trailIdx: 40,
  returnLegReady: false,
  ...over,
});

/** Feed the machine `n` identical fixes and return the final step. */
function feed(state: OffRouteState, over: Partial<OffRouteInput>, n: number) {
  let s = state;
  let event: ReturnType<typeof stepOffRoute>["event"] = "none";
  for (let i = 0; i < n; i++) {
    const r = stepOffRoute(s, input(over));
    s = r.state;
    event = r.event;
  }
  return { state: s, event };
}

test("a fix on the line keeps it on-route and reports nothing", () => {
  const r = stepOffRoute(initialOffRoute, input());
  expect(r.state.phase).toBe("on-route");
  expect(r.event).toBe("none");
});

test("one fix past the entry threshold strays but stays silent", () => {
  const r = stepOffRoute(initialOffRoute, input({ routeDistM: OFF_ROUTE_ENTER_M + 10 }));
  expect(r.state.phase).toBe("straying");
  expect(r.event).toBe("none");
  expect(r.state.departedIdx).toBe(40);
});

test("a GPS spike that returns to the line never announces a departure", () => {
  // Two wild fixes, then back on the road — the classic urban-canyon bounce.
  const strayed = feed(initialOffRoute, { routeDistM: 300 }, ENTER_FIXES - 1);
  expect(strayed.event).toBe("none");
  const back = stepOffRoute(strayed.state, input({ routeDistM: 5 }));
  expect(back.state.phase).toBe("on-route");
  expect(back.state.departedIdx).toBeNull();
  expect(back.event).toBe("none");
});

test("three consecutive fixes past the threshold declare a departure once", () => {
  const gone = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES);
  expect(gone.state.phase).toBe("off-route");
  expect(gone.event).toBe("departed");
  // A fourth fix must not re-announce.
  const again = stepOffRoute(gone.state, input({ routeDistM: 130 }));
  expect(again.event).toBe("none");
});

test("the departure index is the trail index at the moment of leaving, not later", () => {
  let s = stepOffRoute(initialOffRoute, input({ routeDistM: 120, trailIdx: 40 })).state;
  s = stepOffRoute(s, input({ routeDistM: 200, trailIdx: 41 })).state;
  s = stepOffRoute(s, input({ routeDistM: 260, trailIdx: 42 })).state;
  expect(s.phase).toBe("off-route");
  expect(s.departedIdx).toBe(40);
});

test("the hysteresis gap holds: a fix between exit and entry changes nothing", () => {
  const strayed = stepOffRoute(initialOffRoute, input({ routeDistM: 120 })).state;
  const held = stepOffRoute(strayed, input({ routeDistM: 35 }));
  expect(held.state.phase).toBe("straying");
  expect(held.state.streak).toBe(strayed.streak);
});

test("a fetched return leg moves off-route to returning", () => {
  const gone = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  const r = stepOffRoute(gone, input({ routeDistM: 120, returnLegReady: true, returnLegDistM: 4 }));
  expect(r.state.phase).toBe("returning");
  expect(r.event).toBe("none");
});

test("two fixes back on the line rejoin and announce once", () => {
  let s = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  s = stepOffRoute(s, input({ routeDistM: 120, returnLegReady: true, returnLegDistM: 4 })).state;
  const first = stepOffRoute(s, input({ routeDistM: 8, returnLegReady: true, returnLegDistM: 6 }));
  expect(first.event).toBe("none");
  const second = stepOffRoute(first.state, input({ routeDistM: 6, returnLegReady: true, returnLegDistM: 6 }));
  expect(second.state.phase).toBe("on-route");
  expect(second.event).toBe("rejoined");
  expect(second.state.departedIdx).toBeNull();
});

test("leaving the return leg asks for a recompute without re-announcing a departure", () => {
  let s = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  s = stepOffRoute(s, input({ routeDistM: 120, returnLegReady: true, returnLegDistM: 4 })).state;
  const r = feed(s, { routeDistM: 300, returnLegReady: true, returnLegDistM: 200 }, ENTER_FIXES);
  expect(r.state.phase).toBe("off-route");
  expect(r.event).toBe("recompute");
});

test("coming back before the return leg arrives still counts as rejoined", () => {
  const gone = feed(initialOffRoute, { routeDistM: 120 }, ENTER_FIXES).state;
  const r = feed(gone, { routeDistM: 5 }, 2);
  expect(r.state.phase).toBe("on-route");
  expect(r.event).toBe("rejoined");
});
