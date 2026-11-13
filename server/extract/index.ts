import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ExtractResult, type ChatMessage, type LearningContext, type Scene } from "@site/contracts";
import { logLine } from "../log";
import { loadStartScene } from "../model/load";
import { dataPath } from "../paths";
import { groqFacts, groqModel } from "./llm";
import type { MessageFacts } from "./facts";
import { toResult } from "./result";

// Owner: B. Message -> operations + crew intents.
// The LLM extracts facts (llm.ts); rules turn them into operations (result.ts). Unsure -> "unconfirmed", never guessed.
// Learning is applied after this, by rule (server/learning/resolve.ts), so the cache never holds a learned answer.

const isLive = () => process.env.LIVE_LLM === "1";

export const llmProvenance = () => `llm: groq ${groqModel()}`;

/** Demo mode reads data/llm-cache/<messageId>.json only. A missing entry yields nothing, logged as not found. */
export async function extract(message: ChatMessage, ctx: LearningContext): Promise<ExtractResult> {
  if (isLive()) return extractLive(message, ctx);
  try {
    const raw = await readFile(dataPath("llm-cache", `${message.id}.json`), "utf8");
    return ExtractResult.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    logLine({ kind: "extract.cache_miss", messageId: message.id });
    return { messageId: message.id, operations: [], intents: [] };
  }
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
export async function writeCacheEntry(result: ExtractResult, provenance: string, facts?: MessageFacts): Promise<void> {
  await mkdir(dataPath("llm-cache"), { recursive: true });
  const entry = { provenance, ...result, ...(facts ? { facts } : {}) };
  await writeFile(dataPath("llm-cache", `${result.messageId}.json`), JSON.stringify(entry, null, 2) + "\n");
}

/** Facts -> results for messages in order, moves measured from `scene` (the floor as the batch starts). */
export async function extractBatch(messages: ChatMessage[], scene: Scene): Promise<Extracted[]> {
  const facts = await groqFacts(messages, scene);
  return messages.map((m, i) => ({ result: toResult(m, facts[i]!, scene), facts: facts[i]! }));
}

/** One live message: call Groq, validate, write the cache entry. Moves are measured from the start floor. */
async function extractLive(message: ChatMessage, _ctx: LearningContext): Promise<ExtractResult> {
  const [x] = await extractBatch([message], await loadStartScene());
  await writeCacheEntry(x!.result, llmProvenance(), x!.facts);
  logLine({ kind: "extract.live", messageId: message.id, operations: x!.result.operations.length, intents: x!.result.intents.length });
  return x!.result;
}
