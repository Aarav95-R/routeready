import AsyncStorage from "@react-native-async-storage/async-storage";

export type Cached<T> = { data: T; stale: boolean };

export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
  try {
    const data = await fetcher();
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify(data));
    return { data, stale: false };
  } catch (e) {
    const raw = await AsyncStorage.getItem(`cache:${key}`);
    if (raw === null) throw e;
    return { data: JSON.parse(raw) as T, stale: true };
  }
}

/**
 * Everything cached under `cache:` that belongs to a person rather than to the
 * country. Centres and routes are the same whoever is signed in and stay put;
 * `progress:<centreId>` holds that user's own mock-test rows, scoped by RLS on
 * the way in and by nothing at all once written to disk.
 */
const USER_CACHE_PREFIX = "cache:progress:";

/**
 * Take the signed-in user's cached rows off the device. Called on sign-out, so
 * the next person to use this phone cannot read the last one's scores.
 *
 * The outbox is left alone on purpose: a queued entry carries its own user_id
 * and is the only copy of a test that has not reached Supabase yet.
 */
export async function clearUserCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.startsWith(USER_CACHE_PREFIX));
  if (mine.length > 0) await AsyncStorage.multiRemove([...mine]);
}

/**
 * Drop the unsent work, without trying to send it.
 *
 * The counterpart to `clearUserCache` leaving the outbox alone, and called
 * only from account deletion. Once the auth.users row is gone a queued entry
 * can never be inserted — progress rows are keyed to a user that no longer
 * exists — so the only thing keeping it would achieve is leaving a deleted
 * person's mock test on the phone, retried on every reconnect.
 *
 * Separate from `clearUserCache` rather than folded into it: sign-out wants
 * one of these and deletion wants both, and a flag argument would put that
 * decision at the call site of a function whose whole job is to not need one.
 */
export async function clearOutbox(): Promise<void> {
  await AsyncStorage.removeItem("queue:progress_outbox");
}

export async function enqueue(key: "progress_outbox", item: unknown): Promise<void> {
  const raw = await AsyncStorage.getItem(`queue:${key}`);
  const q: unknown[] = raw ? JSON.parse(raw) : [];
  q.push(item);
  await AsyncStorage.setItem(`queue:${key}`, JSON.stringify(q));
}

export async function drainQueue<T>(key: "progress_outbox", send: (item: T) => Promise<void>): Promise<number> {
  const raw = await AsyncStorage.getItem(`queue:${key}`);
  const q: T[] = raw ? JSON.parse(raw) : [];
  const remaining: T[] = [];
  let flushed = 0;
  for (const item of q) {
    try { await send(item); flushed++; }
    catch { remaining.push(item); }
  }
  await AsyncStorage.setItem(`queue:${key}`, JSON.stringify(remaining));
  return flushed;
}
