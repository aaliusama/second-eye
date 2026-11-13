import { readFile } from "node:fs/promises";
import { ExtractResult, type ChatMessage, type LearningContext } from "@site/contracts";
import { logLine } from "../log";
import { dataPath } from "../paths";

// Owner: B. Message -> operations + crew intents.
// The LLM extracts facts; rules decide. Unsure -> set_status "unconfirmed" with the confidence.

const isLive = () => process.env.LIVE_LLM === "1";

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

/** STUB: call the LLM, validate with ExtractResult, write the cache entry. */
async function extractLive(message: ChatMessage, _ctx: LearningContext): Promise<ExtractResult> {
  throw new Error(`LIVE_LLM=1 but live extraction is not built yet (message ${message.id})`);
}
