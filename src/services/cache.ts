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
