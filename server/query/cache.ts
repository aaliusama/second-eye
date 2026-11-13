import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryCacheEntry } from "./schema";

// Owner: E. server/query/cache/<key>.json. The demo reads only this; live calls fill it.

export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "cache");

export async function readCache(key: string): Promise<QueryCacheEntry | undefined> {
  try {
    return QueryCacheEntry.parse(JSON.parse(await readFile(join(CACHE_DIR, `${key}.json`), "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function writeCache(entry: QueryCacheEntry): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, `${entry.key}.json`), JSON.stringify(QueryCacheEntry.parse(entry), null, 2) + "\n");
}
