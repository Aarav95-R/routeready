/**
 * A deadline for work that goes over the network.
 *
 * React Native's fetch gives up after about a minute, and `supabase-js` adds
 * no deadline of its own, so any auth call against an unreachable service
 * leaves the UI waiting that long. That is not a slow button, it is a dead
 * one — and it is precisely how an unresponsive Auth service presented
 * itself here: "Sign out" appeared to do nothing at all, because the store
 * was still awaiting a POST to `/auth/v1/logout` that never answered.
 *
 * Timeouts are reported as a resolved `TIMED_OUT` rather than a thrown error
 * so that callers must handle the case to get at the value. A rejection is
 * passed straight through, because a server that answered with a complaint
 * is a different thing from a server that never answered, and the two want
 * different words in front of a person.
 */

/** What a call that outlived its deadline resolves to. */
export const TIMED_OUT = Symbol("timed-out");

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
