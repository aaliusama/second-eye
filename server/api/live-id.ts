import { createHash } from "node:crypto";

// Owner: A. Deterministic ids for messages posted live from the crew phone.
// The id comes from the words, not from a counter, so B can pre-cache extraction for
// scripted phone messages in data/llm-cache/<id>.json and the demo stays offline.

/** Lower case, trimmed, whitespace collapsed, trailing punctuation dropped. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\p{P}\s]+$/u, "");
}

/** Cache key for a live message: live-<first 10 hex of sha256(normalised text + "\n" + crewId)>. */
export function liveCacheId(text: string, crewId?: string): string {
  const hash = createHash("sha256")
    .update(`${normaliseText(text)}\n${crewId ?? ""}`)
    .digest("hex");
  return `live-${hash.slice(0, 10)}`;
}
