import { nextAuthRoute } from "../authRoute";

/**
 * Every case in this file predates the interview gate and every one of them
 * means "the interview is done" — so `needsInterview: false` is threaded
 * through them rather than defaulted in the type. A default would let a new
 * call site forget the field and silently never gate anybody, which is the
 * failure this gate exists to prevent.
 */

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
  expect(nextAuthRoute({ session: {}, recovering: true, needsInterview: false, segments: ["(tabs)"] }))
    .toBe("/(auth)/update-password");
});

test("recovering, already on update-password, is left alone", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, needsInterview: false, segments: ["(auth)", "update-password"] }))
    .toBeNull();
});

test("finishing recovery with a session sends the tabs, not sign-in", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: false, segments: ["(auth)", "update-password"] }))
    .toBe("/(tabs)");
});

// The bug: signing out from update-password used to leave `recovering: false`
// and `session: null` on that same route, which the general "already inAuth"
// rule below reads as nothing to do — so the person stayed on a screen for an
// account they had just left.
test("signing out from update-password sends sign-in, not nowhere", () => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: false, segments: ["(auth)", "update-password"] }))
    .toBe("/(auth)/sign-in");
});

test.each([
  ["sign-in", ["(auth)", "sign-in"]],
  ["sign-up", ["(auth)", "sign-up"]],
  ["reset", ["(auth)", "reset"]],
])("with no session and no recovery, sitting on %s is left alone", (_name, segments) => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: false, segments })).toBeNull();
});

test("no session, outside auth entirely, is sent to sign-in", () => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: false, segments: ["(tabs)"] })).toBe("/(auth)/sign-in");
});

test("a session found while sitting in the auth group is sent to the tabs", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: false, segments: ["(auth)", "sign-in"] }))
    .toBe("/(tabs)");
});

test("a session outside the auth group, not recovering, is left alone", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: false, segments: ["(tabs)"] })).toBeNull();
});

/**
 * The landing pad is gone. No email carries a token any more, so a URL
 * claiming to be one is a stale link from an old build or somebody's guess,
 * and it gets the same answer as any other unknown route: go where the
 * session says.
 */
test("a stale auth-callback link is treated as an ordinary route", () => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: false, segments: ["auth-callback"] }))
    .toBe("/(auth)/sign-in");
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: false, segments: ["auth-callback"] }))
    .toBeNull();
});

// The one thing that must survive the deletion: recovery still outranks
// everything, now set by a verified code rather than by a link's fragment.
test("recovery still wins wherever it is set from", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, needsInterview: false, segments: ["(tabs)"] }))
    .toBe("/(auth)/update-password");
});

/**
 * ── The interview gate ────────────────────────────────────────────────────
 *
 * Signing in with Apple or Google from the *sign-in* screen makes an account
 * without ever asking the four questions — there is no card 5 on that path.
 * The gate is what stops those accounts reaching the app unasked, and it is
 * keyed on the answers being absent rather than on how the account was made,
 * so an account predating the interview is caught by the same rule.
 */
test("a session with no answers is sent to the interview", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: true, segments: ["(tabs)"] }))
    .toBe("/(auth)/interview");
});

test("already on the interview, with answers still outstanding, is left alone", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: true, segments: ["(auth)", "interview"] }))
    .toBeNull();
});

// The same trap update-password sets, and it has to be sprung the same way:
// the interview lives under (auth), so once the answers land, the general
// "already inAuth" rule below would read the screen as a resting place and
// nobody would ever leave it.
test("finishing the interview sends the tabs, not nowhere", () => {
  expect(nextAuthRoute({ session: {}, recovering: false, needsInterview: false, segments: ["(auth)", "interview"] }))
    .toBe("/(tabs)");
});

// The escape hatch on the screen. Somebody who cannot find their centre can
// sign out, and that must land them on sign-in rather than stranding them on
// an interview for an account they have just left.
test("signing out from the interview sends sign-in", () => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: true, segments: ["(auth)", "interview"] }))
    .toBe("/(auth)/sign-in");
});

/**
 * Ordering, and it matters. Recovery is a person locked out of their own
 * account; the interview is four questions. Gating the reset behind them would
 * mean somebody who has forgotten their password has to describe their driving
 * test before they can set a new one — and `recovering` is only ever true with
 * a session, so the two genuinely can overlap.
 */
test("recovery outranks the interview", () => {
  expect(nextAuthRoute({ session: {}, recovering: true, needsInterview: true, segments: ["(tabs)"] }))
    .toBe("/(auth)/update-password");
});

// No session means there is nobody to write answers for. The gate must never
// fire ahead of signing in, or sign-in becomes unreachable.
test("no session is sent to sign-in, interview or not", () => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: true, segments: ["(tabs)"] }))
    .toBe("/(auth)/sign-in");
});

// Sign-up already asks the four questions on its own cards, so a half-finished
// sign-up must not be yanked out of the flow it is already in.
test("the gate does not interrupt a sign-up in progress", () => {
  expect(nextAuthRoute({ session: null, recovering: false, needsInterview: true, segments: ["(auth)", "sign-up"] }))
    .toBeNull();
});
