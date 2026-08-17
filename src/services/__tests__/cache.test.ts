import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachedFetch, clearUserCache, drainQueue, enqueue } from "../cache";

beforeEach(() => AsyncStorage.clear());

test("success path returns fresh data and caches it", async () => {
  const r = await cachedFetch("k", async () => [1, 2]);
  expect(r).toEqual({ data: [1, 2], stale: false });
  expect(JSON.parse((await AsyncStorage.getItem("cache:k"))!)).toEqual([1, 2]);
});

test("failure path serves cached copy as stale", async () => {
  await cachedFetch("k", async () => ["cached"]);
  const r = await cachedFetch("k", async () => { throw new Error("net down"); });
  expect(r).toEqual({ data: ["cached"], stale: true });
});

test("failure with empty cache rethrows", async () => {
  await expect(cachedFetch("nope", async () => { throw new Error("net down"); })).rejects.toThrow("net down");
});

// Progress rows are the one cached thing that belongs to a person rather than
// to the country: centres and routes are the same for everyone, so signing out
// on a shared phone must take the scores with it and leave the rest warm.
test("signing out drops cached progress and keeps the public reference data", async () => {
  await cachedFetch("progress:c1", async () => ({ r1: [{ score: 82 }] }));
  await cachedFetch("progress:c2", async () => ({ r2: [{ score: 51 }] }));
  await cachedFetch("centres", async () => [{ id: "c1" }]);

  await clearUserCache();

  expect(await AsyncStorage.getItem("cache:progress:c1")).toBeNull();
  expect(await AsyncStorage.getItem("cache:progress:c2")).toBeNull();
  expect(await AsyncStorage.getItem("cache:centres")).not.toBeNull();
});

// A mock test taken on the train has not reached Supabase yet. It carries its
// own user_id, so it is still that user's to send — dropping it here would
// throw away the only copy.
test("work waiting to be sent survives a sign-out", async () => {
  await enqueue("progress_outbox", { route_id: "r1", user_id: "u1" });
  await clearUserCache();
  expect(await drainQueue("progress_outbox", async () => {})).toBe(1);
});

test("outbox enqueues and drains FIFO, keeping failures", async () => {
  await enqueue("progress_outbox", { a: 1 });
  await enqueue("progress_outbox", { a: 2 });
  const sent: unknown[] = [];
  const flushed = await drainQueue("progress_outbox", async (item) => { sent.push(item); });
  expect(flushed).toBe(2);
  expect(sent).toEqual([{ a: 1 }, { a: 2 }]);
  expect(await drainQueue("progress_outbox", async () => {})).toBe(0);
});
