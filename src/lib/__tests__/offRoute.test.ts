import {
  ENTER_FIXES,
  initialOffRoute,
  OFF_ROUTE_ENTER_M,
  stepOffRoute,
  type OffRouteInput,
  type OffRouteState,
} from "../offRoute";
import { chooseRejoin, departureLine, REJOINED_LINE, SKIP_WARN_M } from "../offRoute";
import type { LatLng } from "../geo";

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

test("three far fixes inside one second do not declare a departure", () => {
  let s = stepOffRoute(initialOffRoute, input({ routeDistM: 120, timestampMs: 0 })).state;
  s = stepOffRoute(s, input({ routeDistM: 120, timestampMs: 400 })).state;
  s = stepOffRoute(s, input({ routeDistM: 120, timestampMs: 800 })).state;

  expect(s.phase).toBe("straying");
  const confirmed = stepOffRoute(s, input({ routeDistM: 120, timestampMs: 3_000 }));
  expect(confirmed.state.phase).toBe("off-route");
  expect(confirmed.event).toBe("departed");
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

// ── chooseRejoin ────────────────────────────────────────────────────────────

// A straight eastbound line at 51.5N, one point roughly every 69 m.
const straight: LatLng[] = Array.from({ length: 21 }, (_, i) => ({ lat: 51.5, lng: -0.1 + i * 0.001 }));
const cumOf = (cs: LatLng[]) => {
  const out = [0];
  for (let i = 1; i < cs.length; i++) {
    const dx = (cs[i].lng - cs[i - 1].lng) * 111320 * Math.cos((51.5 * Math.PI) / 180);
    const dy = (cs[i].lat - cs[i - 1].lat) * 110540;
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
};
const cum = cumOf(straight);

test("a driver just north of the line rejoins at the nearest vertex ahead", () => {
  const pos = { lat: 51.5008, lng: -0.0945 }; // ~88 m north, just past vertex 5
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.idx).toBeGreaterThanOrEqual(5);
  expect(r.idx).toBeLessThanOrEqual(8);
  expect(r.skippedM).toBeGreaterThanOrEqual(0);
});

test("skipped distance is measured along the route, not as the crow flies", () => {
  const pos = { lat: 51.5008, lng: -0.0905 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.skippedM).toBe(Math.round(cum[r.idx] - cum[5]));
  // Crow distance from the driver to that vertex is nothing like the route
  // distance skipped, which is the whole point of measuring along `cum`.
  expect(r.skippedM).toBeGreaterThan(200);
});

test("a candidate behind the driver is rejected rather than asking for a U-turn", () => {
  // Level with vertex 15, still heading east; the departure was back at 5.
  const pos = { lat: 51.5008, lng: -0.085 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.idx).toBeGreaterThanOrEqual(15);
});

test("with no heading known, nothing is rejected for being behind", () => {
  const pos = { lat: 51.5008, lng: -0.085 };
  const r = chooseRejoin(straight, cum, pos, 5, null)!;
  // Free to pick the departure point itself, which is much the closest thing
  // to it in route terms — a stationary driver has no "behind".
  expect(r.idx).toBe(5);
});

test("the skip penalty stops a far rejoin winning on crow distance alone", () => {
  const pos = { lat: 51.5004, lng: -0.0941 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.idx).toBeLessThan(12);
});

test("a route with no vertices ahead of the departure returns null", () => {
  const r = chooseRejoin(straight, cum, { lat: 51.5008, lng: -0.08 }, straight.length - 1, 90);
  expect(r).toBeNull();
});

test("the returned point is the coordinate at the chosen index", () => {
  const pos = { lat: 51.5008, lng: -0.0945 };
  const r = chooseRejoin(straight, cum, pos, 5, 90)!;
  expect(r.point).toEqual(straight[r.idx]);
});

// ── the spoken lines ────────────────────────────────────────────────────────

test("a long skip is quantified out loud", () => {
  expect(departureLine(380)).toBe("You've left the route. Rejoining ahead — you'll miss about 380 m.");
});

test("a skip under the warning threshold is not mentioned", () => {
  expect(departureLine(SKIP_WARN_M - 1)).toBe("You've left the route. Getting you back on.");
});

test("rejoining says one short thing", () => {
  expect(REJOINED_LINE).toBe("Back on route.");
});
