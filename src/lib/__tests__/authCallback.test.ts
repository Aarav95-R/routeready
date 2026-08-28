import { parseAuthCallback } from "../authCallback";

// The deep link is routeready://auth-callback#access_token=…&refresh_token=…&type=…
// for every one of signup, magic link and recovery — Supabase does not vary the
// shape, only the `type`. Recovery is the one that has to be told apart from the
// others, so callers can hold off the normal "session exists, go to the tabs"
// redirect and send the person to set a new password instead.
test("reads the tokens and type out of the URL fragment", () => {
  const url = "routeready://auth-callback#access_token=at1&refresh_token=rt1&type=recovery";
  expect(parseAuthCallback(url)).toEqual({ access_token: "at1", refresh_token: "rt1", type: "recovery" });
});

test("type is null rather than missing when Supabase omits it", () => {
  const url = "routeready://auth-callback#access_token=at1&refresh_token=rt1";
  expect(parseAuthCallback(url)).toEqual({ access_token: "at1", refresh_token: "rt1", type: null });
});

test.each([
  ["no fragment at all", "routeready://auth-callback"],
  ["a fragment with no tokens in it", "routeready://auth-callback#error=access_denied"],
  ["only one of the two tokens", "routeready://auth-callback#access_token=at1&type=recovery"],
])("%s parses as null, not a partial result", (_label, url) => {
  expect(parseAuthCallback(url)).toBeNull();
});

test("a link to some other screen entirely is not mistaken for a callback", () => {
  expect(parseAuthCallback("routeready://route/abc-123")).toBeNull();
});
