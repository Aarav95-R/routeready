import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join("scripts", "seed", ".cache");

/**
 * On-disk memo for the generator's network calls, keyed by request.
 *
 * A full run is ~40 Overpass calls and ~400 OSRM calls with politeness sleeps
 * between them — roughly ten minutes. Without this, every retry after a single
 * failure pays that again, which in practice means nobody re-runs the
 * generator and the seed rots.
 *
 * Gitignored, and safe to delete: the next run just refetches. Delete it when
 * you want fresh OSM data rather than whatever was true last time.
 */
export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex").slice(0, 16)}.json`);
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, "utf8")) as T);
  return fetcher().then((value) => {
    writeFileSync(file, JSON.stringify(value));
    return value;
  });
}
