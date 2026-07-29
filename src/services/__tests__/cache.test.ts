import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachedFetch, drainQueue, enqueue } from "../cache";

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

test("outbox enqueues and drains FIFO, keeping failures", async () => {
  await enqueue("progress_outbox", { a: 1 });
  await enqueue("progress_outbox", { a: 2 });
  const sent: unknown[] = [];
  const flushed = await drainQueue("progress_outbox", async (item) => { sent.push(item); });
  expect(flushed).toBe(2);
  expect(sent).toEqual([{ a: 1 }, { a: 2 }]);
  expect(await drainQueue("progress_outbox", async () => {})).toBe(0);
});
