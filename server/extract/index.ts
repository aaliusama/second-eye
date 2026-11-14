import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ExtractResult, type ChatMessage, type LearningContext, type Scene } from "@site/contracts";
import { logLine } from "../log";
import { loadStartScene } from "../model/load";
import { dataPath } from "../paths";
import { groqFacts, groqModel, type CallMode } from "./llm";
import type { MessageFacts } from "./facts";
import { toResult } from "./result";

// Owner: B. Message -> operations + crew intents.
// The LLM extracts facts (llm.ts); rules turn them into operations (result.ts). Unsure -> "unconfirmed", never guessed.
// Learning is applied after this, by rule (server/learning/resolve.ts), so the cache never holds a learned answer.

const isLive = () => process.env.LIVE_LLM === "1";

export const llmProvenance = () => `llm: groq ${groqModel()}`;

/**
 * Where cached extractions are read, in order, and where a live extraction is written.
 * Default: the golden cache data/llm-cache/ (read only at run time), then data/llm-cache-live/
 * (gitignored) for messages extracted live in a demo session, so live text never lands in the golden cache.
 * The challenge evaluation points both at data/challenge/llm-cache/.
 */
let cacheConfig: { read: string[][]; write: string[] } = {
  read: [["llm-cache"], ["llm-cache-live"]],
  write: ["llm-cache-live"],
};
export function useCache(read: string[][], write: string[]): void {
  cacheConfig = { read, write };
}

/** Why a message produced nothing, for the API and the phone. Undefined when extraction ran. */
export type ExtractStatus = "cached" | "live" | "cache_miss_offline" | "live_failed";
const lastStatus = new Map<string, ExtractStatus>();
export const extractStatus = (messageId: string): ExtractStatus | undefined => lastStatus.get(messageId);

async function readCached(messageId: string): Promise<ExtractResult | undefined> {
  // Offline, the demo reads only committed caches: what a judge typed in an earlier live session does not leak in.
  const dirs = isLive() ? cacheConfig.read : cacheConfig.read.filter((d) => d.join("/") !== "llm-cache-live");
  for (const dir of dirs) {
    try {
      const raw = await readFile(dataPath(...dir, `${messageId}.json`), "utf8");
      return ExtractResult.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return undefined;
}

/** Demo mode reads the caches only. A missing entry yields nothing, logged as not found. */
export async function extract(message: ChatMessage, ctx: LearningContext, scene?: Scene): Promise<ExtractResult> {
  const cached = await readCached(message.id);
  if (cached) {
    lastStatus.set(message.id, "cached");
    return cached;
  }
  if (!isLive()) {
    logLine({ kind: "extract.cache_miss", messageId: message.id });
    lastStatus.set(message.id, "cache_miss_offline");
    return { messageId: message.id, operations: [], intents: [] };
  }
  return extractLive(message, ctx, scene ?? (await loadStartScene()));
}

export interface Extracted {
  result: ExtractResult;
  /** The LLM's raw facts, kept in the cache so the rules (result.ts) can be re-applied without a new call. */
  facts: MessageFacts;
}

/**
 * Writes one cache entry. provenance says where it came from; facts are the raw LLM reply.
 * ExtractResult.parse drops both on read, so the rest of the system sees the contract shape only.
 */
export async function writeCacheEntry(
  result: ExtractResult,
  provenance: string,
  facts?: MessageFacts,
  dir: string[] = ["llm-cache"],
): Promise<void> {
  await mkdir(dataPath(...dir), { recursive: true });
  const entry = { provenance, ...result, ...(facts ? { facts } : {}) };
  await writeFile(dataPath(...dir, `${result.messageId}.json`), JSON.stringify(entry, null, 2) + "\n");
}

/** Facts -> results for messages in order, moves measured from `scene` (the floor as the batch starts). */
export async function extractBatch(messages: ChatMessage[], scene: Scene, mode: CallMode = "patient"): Promise<Extracted[]> {
  const facts = await groqFacts(messages, scene, mode);
  return messages.map((m, i) => ({ result: toResult(m, facts[i]!, scene), facts: facts[i]! }));
}

/** One live message: measure moves from the current scene; failures are logged, never thrown. */
async function extractLive(message: ChatMessage, _ctx: LearningContext, scene: Scene): Promise<ExtractResult> {
  let x: Extracted;
  try {
    [x] = await extractBatch([message], scene, "interactive") as [Extracted];
  } catch (err) {
    logLine({ kind: "extract.error", messageId: message.id, error: String(err) });
    lastStatus.set(message.id, "live_failed");
    return { messageId: message.id, operations: [], intents: [] };
  }
  lastStatus.set(message.id, "live");
  try {
    await writeCacheEntry(x.result, llmProvenance(), x.facts, cacheConfig.write);
  } catch (err) {
    logLine({ kind: "extract.cache_write_failed", messageId: message.id, error: String(err) });
  }
  logLine({ kind: "extract.live", messageId: message.id, operations: x!.result.operations.length, intents: x!.result.intents.length });
  return x!.result;
}
