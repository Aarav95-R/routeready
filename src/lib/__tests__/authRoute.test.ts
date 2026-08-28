import { nextAuthRoute } from "../authRoute";

/**
 * `update-password` is the one auth screen that is only ever valid while
 * `recovering` is true. Every other rule here treats "already somewhere
 * under (auth)" as a resting state to leave alone — correct for sign-in,
 * sign-up and reset, all of which are legitimately visited with no session.
 * It is not correct for update-password: signing out from it (or finishing
 * it) leaves session-less-and-inAuth too, and without a rule of its own it
 * reads as "already home", so nobody ever leaves the screen.
 */
test("recovering, not yet on update-password, is sent there", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, segments: ["(tabs)"] }))
    .toBe("/(auth)/update-password");
});

test("recovering, already on update-password, is left alone", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, segments: ["(auth)", "update-password"] }))
    .toBeNull();
});

test("finishing recovery with a session sends the tabs, not sign-in", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, segments: ["(auth)", "update-password"] }))
    .toBe("/(tabs)");
});

// The bug: signing out from update-password used to leave `recovering: false`
// and `session: null` on that same route, which the general "already inAuth"
// rule below reads as nothing to do — so the person stayed on a screen for an
// account they had just left.
test("signing out from update-password sends sign-in, not nowhere", () => {
  expect(nextAuthRoute({ session: null, recovering: false, segments: ["(auth)", "update-password"] }))
    .toBe("/(auth)/sign-in");
});

test.each([
  ["sign-in", ["(auth)", "sign-in"]],
  ["sign-up", ["(auth)", "sign-up"]],
  ["reset", ["(auth)", "reset"]],
])("with no session and no recovery, sitting on %s is left alone", (_name, segments) => {
  expect(nextAuthRoute({ session: null, recovering: false, segments })).toBeNull();
});

test("no session, outside auth entirely, is sent to sign-in", () => {
  expect(nextAuthRoute({ session: null, recovering: false, segments: ["(tabs)"] })).toBe("/(auth)/sign-in");
});

test("a session found while sitting in the auth group is sent to the tabs", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, segments: ["(auth)", "sign-in"] }))
    .toBe("/(tabs)");
});

test("a session outside the auth group, not recovering, is left alone", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, segments: ["(tabs)"] })).toBeNull();
});

/**
 * The landing pad is gone. No email carries a token any more, so a URL
 * claiming to be one is a stale link from an old build or somebody's guess,
 * and it gets the same answer as any other unknown route: go where the
 * session says.
 */
test("a stale auth-callback link is treated as an ordinary route", () => {
  expect(nextAuthRoute({ session: null, recovering: false, segments: ["auth-callback"] }))
    .toBe("/(auth)/sign-in");
  expect(nextAuthRoute({ session: {}, recovering: false, segments: ["auth-callback"] }))
    .toBeNull();
});

// The one thing that must survive the deletion: recovery still outranks
// everything, now set by a verified code rather than by a link's fragment.
test("recovery still wins wherever it is set from", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, segments: ["(tabs)"] }))
    .toBe("/(auth)/update-password");
});
