import { DELETE_FALLBACK, deleteAccountError } from "../deleteError";

// The one case worth its own sentence. A deletion that failed because the
// phone is on a train is not the same as one that failed on the server, and
// telling somebody to "try again" while they have no signal is useless.
test("no connection says so, and says when to come back", () => {
  expect(deleteAccountError("Failed to send a request to the Edge Function"))
    .toMatch(/connection/i);
  expect(deleteAccountError("Network request failed")).toMatch(/connection/i);
});

test("a server failure does not blame the connection", () => {
  expect(deleteAccountError("The account could not be deleted."))
    .not.toMatch(/connection/i);
});

// Same contract authError holds to, and for the same reason: the strings on
// the other side of this are written for logs, not for a learner.
test("an unrecognised message never reaches the person", () => {
  expect(deleteAccountError("FunctionsHttpError: 500 boom")).toBe(DELETE_FALLBACK);
  expect(deleteAccountError("")).toBe(DELETE_FALLBACK);
  expect(deleteAccountError(null)).toBe(DELETE_FALLBACK);
  expect(deleteAccountError(undefined)).toBe(DELETE_FALLBACK);
});

test("every sentence tells the person the account is still there", () => {
  for (const m of ["Failed to send a request to the Edge Function", "boom", ""]) {
    expect(deleteAccountError(m).length).toBeGreaterThan(20);
  }
});
