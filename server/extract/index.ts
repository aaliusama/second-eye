import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ExtractResult, type ChatMessage, type LearningContext, type Scene } from "@site/contracts";
import { logLine } from "../log";
import { loadStartScene } from "../model/load";
import { dataPath } from "../paths";
import { groqCall, groqModel, systemPrompt, userPrompt, type ChatTurn } from "./llm";
import { normalise } from "./validate";

// Owner: B. Message -> operations + crew intents.
// The LLM extracts facts; rules decide. Unsure -> set_status "unconfirmed" with the confidence.

const isLive = () => process.env.LIVE_LLM === "1";

export const cachePath = (messageId: string) => dataPath("llm-cache", `${messageId}.json`);
const empty = (messageId: string): ExtractResult => ({ messageId, operations: [], intents: [] });

/** The cache entry for a message, or undefined when there is none. A broken entry throws. */
export async function readCached(messageId: string): Promise<ExtractResult | undefined> {
  try {
    return ExtractResult.parse(JSON.parse(await readFile(cachePath(messageId), "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function writeCached(result: ExtractResult): Promise<void> {
  const path = cachePath(result.messageId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(ExtractResult.parse(result), null, 2) + "\n", "utf8");
}

/**
 * Demo mode reads data/llm-cache/<messageId>.json only; a missing entry yields nothing, logged as not found.
 * LIVE_LLM=1: a cache entry still wins; otherwise Groq extracts and the result is written to the cache.
 * `scene` is the scene the message lands on (element ids for the prompt); defaults to the starting floor.
 */
export async function extract(message: ChatMessage, ctx: LearningContext, scene?: Scene): Promise<ExtractResult> {
  const cached = await readCached(message.id);
  if (cached) return cached;
  if (!isLive()) {
    logLine({ kind: "extract.cache_miss", messageId: message.id });
    return empty(message.id);
  }
  const live = await extractLive(message, ctx, scene ?? (await loadStartScene()));
  if (!live.error) {
    try {
      await writeCached(live.result);
    } catch (err) {
      logLine({ kind: "extract.cache_write_failed", messageId: message.id, error: String(err) });
    }
  }
  return live.result;
}

/**
 * One Groq call, one retry when the reply is not valid JSON or breaks the schema.
 * Never throws: on any failure the result is empty and `error` says why (also logged).
 */
export async function extractLive(
  message: ChatMessage,
  ctx: LearningContext,
  scene: Scene,
): Promise<{ result: ExtractResult; error?: string }> {
  const fail = (error: string) => {
    logLine({ kind: "extract.error", messageId: message.id, model: groqModel(), error });
    return { result: empty(message.id), error };
  };
  const turns: ChatTurn[] = [
    { role: "system", content: systemPrompt(scene, ctx) },
    { role: "user", content: userPrompt(message, scene) },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let content: string;
    try {
      content = await groqCall(
        attempt === 0 ? turns : [...turns, { role: "user", content: `Your last reply was invalid: ${lastError}. Reply with valid JSON only, in the schema above.` }],
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      lastError = "not JSON";
      continue;
    }
    const n = normalise(raw, message, scene);
    if ("error" in n) {
      lastError = n.error;
      continue;
    }
    if (n.schemaErrors.length && attempt === 0) {
      lastError = n.schemaErrors.slice(0, 3).join(" | ");
      continue;
    }
    for (const r of n.rejections) logLine({ kind: "extract.rejected", messageId: message.id, ...r });
    return { result: n.result };
  }
  return fail(`reply invalid twice: ${lastError}`);
}
