import { TIMED_OUT, withTimeout } from "../withTimeout";

/**
 * The guard between "the server is slow" and "the person is stuck".
 *
 * Every auth call in this app goes over the network to a service that can be
 * unreachable, and React Native's fetch waits a full minute before giving up.
 * A minute is not a wait, it is a broken button — which is exactly how a dead
 * Auth service presented itself: sign-out appeared to do nothing at all.
 */

test("a promise that settles in time passes its value straight through", async () => {
  await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
});

test("a promise that never settles resolves as TIMED_OUT instead of hanging", async () => {
  await expect(withTimeout(new Promise(() => {}), 10)).resolves.toBe(TIMED_OUT);
});

// A rejection is not a timeout, and collapsing the two would turn a server's
// real complaint ("invalid credentials") into "couldn't reach the server".
test("a rejection is passed on as a rejection, not disguised as a timeout", async () => {
  await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
});

test("a value arriving before the deadline wins the race", async () => {
  const slowish = new Promise((resolve) => setTimeout(() => resolve("won"), 5));
  await expect(withTimeout(slowish, 200)).resolves.toBe("won");
});

// The timer has to be cleared on the happy path. A pending setTimeout keeps
// Jest's process alive and, on device, holds a reference to the whole closure.
test("settling early leaves no timer behind", async () => {
  jest.useFakeTimers();
  try {
    const done = withTimeout(Promise.resolve("ok"), 10_000);
    await Promise.resolve();
    await expect(done).resolves.toBe("ok");
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
