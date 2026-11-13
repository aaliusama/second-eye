import { readFileSync } from "node:fs";
import type { ChatMessage, Geometry, LearningContext, Scene } from "@site/contracts";

// Owner: B. Message -> raw JSON reply with Groq (OpenAI-compatible chat completions, plain fetch).
// Same provider and env vars as server/query/llm.ts. Validation lives in validate.ts.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const groqModel = () => process.env.GROQ_MODEL || DEFAULT_MODEL;

export const MISSING_KEY = "GROQ_API_KEY is not set; live extraction needs it (copy .env.example to .env and paste the key)";

const TEMPLATE = readFileSync(new URL("./prompts/extract.md", import.meta.url), "utf8");

const round = (n: number) => Math.round(n * 1000) / 1000;
const pt = (p: readonly number[]) => `[${p.map(round).join(",")}]`;

function geometryText(g: Geometry): string {
  if (g.kind === "segment") return `segment from ${pt(g.from)} to ${pt(g.to)}, thickness ${g.thickness}`;
  if (g.kind === "point") return `point at ${pt(g.at)}`;
  return `polygon ${g.points.map(pt).join(" ")}`;
}

export function systemPrompt(scene: Scene, ctx: LearningContext | undefined): string {
  const elements = scene.elements
    .map((e) => {
      const aka = e.aliases.length ? `, aka ${e.aliases.map((a) => `"${a}"`).join(", ")}` : "";
      return `- ${e.id} (${e.type}, ${e.state}) "${e.name}"${aka}; ${geometryText(e.geometry)}`;
    })
    .join("\n");
  const aliases = Object.entries(ctx?.locationAliases ?? {})
    .map(([alias, id]) => `- "${alias}" = ${id}`)
    .join("\n");
  const crews = scene.crews.map((c) => `- ${c.id}: ${c.name} (${c.trade})`).join("\n");
  return TEMPLATE.replace("{{ELEMENTS}}", elements || "(none)")
    .replace("{{ALIASES}}", aliases || "(none yet)")
    .replace("{{CREWS}}", crews || "(none)");
}

export function userPrompt(m: ChatMessage, scene: Scene): string {
  const crew = scene.crews.find((c) => c.id === m.crewId);
  const weekday = new Date(`${m.time}Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return [
    `Sent: ${m.time} (${weekday})`,
    `Thread: ${m.thread}`,
    `From: ${m.senderName}, ${m.senderRole}`,
    `Crew: ${crew ? `${crew.id} (${crew.name}, ${crew.trade})` : m.crewId ?? "none"}`,
    `Kind: ${m.kind}`,
    `Message: ${m.text}`,
  ].join("\n");
}

/** Seconds Groq asks us to wait on a 429: retry-after header, else "try again in 1.68s" in the body, else 5. */
function retryAfter(res: Response, body: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const m = /try again in ([\d.]+)s/i.exec(body);
  return m ? Number(m[1]) : 5;
}

const RATE_LIMIT_TRIES = 6;

export type ChatTurn = { role: string; content: string };

/** One chat completion in JSON mode, temperature 0. Waits and retries on 429. Throws on anything else. */
export async function groqCall(messages: ChatTurn[], sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error(MISSING_KEY);
  let res: Response | undefined;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: groqModel(), temperature: 0, response_format: { type: "json_object" }, messages }),
    });
    if (res.status !== 429 || attempt >= RATE_LIMIT_TRIES) break;
    // Free tier: tokens-per-minute limit. Wait what Groq asks (plus a margin) and try again.
    const wait = retryAfter(res, await res.text()) + 1;
    console.error(`Groq rate limit, waiting ${wait.toFixed(1)} s (try ${attempt}/${RATE_LIMIT_TRIES})`);
    await sleep(wait * 1000);
  }
  if (!res.ok) throw new Error(`Groq answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq reply had no content");
  return content;
}
