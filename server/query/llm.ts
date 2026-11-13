import type { LearningContext, Scene } from "@site/contracts";
import { StructuredQuery, type Question } from "./schema";
import { z } from "zod";

// Owner: E. Question -> StructuredQuery with Groq (OpenAI-compatible chat completions, plain fetch).
// The model only says WHAT is asked. It never answers: the rules in answer.ts do.

const URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const groqModel = () => process.env.GROQ_MODEL || DEFAULT_MODEL;

const Reply = z.object({ query: StructuredQuery.nullable() });

function systemPrompt(scene: Scene, ctx: LearningContext | undefined): string {
  const elements = scene.elements
    .map((e) => `- ${e.id} (${e.type}) "${e.name}"${e.aliases.length ? ` aka ${e.aliases.map((a) => `"${a}"`).join(", ")}` : ""}`)
    .join("\n");
  const learned = Object.entries(ctx?.locationAliases ?? {})
    .map(([alias, id]) => `- "${alias}" = ${id}`)
    .join("\n");
  const crews = scene.crews.map((c) => `- ${c.id}: ${c.name} (${c.trade})`).join("\n");
  return `You turn a construction crew's text message into ONE structured query about the site record. You never answer the question.

Elements on the floor (use these ids only):
${elements}
${learned ? `Nicknames learned from the superintendent:\n${learned}\n` : ""}Crews:
${crews}

Reply with JSON only: {"query": Q} or {"query": null}. Q is exactly one of:
{"kind":"whats_planned","placeId"?:id,"day"?:"YYYY-MM-DD","crewId"?:id}
{"kind":"where_is","elementId":id}
{"kind":"what_changed","elementId"?:id,"placeId"?:id,"since"?:"YYYY-MM-DDTHH:MM:SS"}   (at least one of elementId/placeId)
{"kind":"who_is_in","placeId":id,"day":"YYYY-MM-DD","slot"?:"morning"|"afternoon"|"full_day"}
{"kind":"can_i_start","crewId":id,"taskType":T,"placeId":id,"day":"YYYY-MM-DD","slot":"morning"|"afternoon"|"full_day"}
{"kind":"decision_needed","topic":string}
T is one of: layout, rough_in_plumbing, rough_in_electrical, inspection, close_wall, finish_drywall, paint, tile, install_fixtures, other.

Rules:
- Use only ids from the lists above. Unit numbers like "204" mean the room whose name has that number.
- Resolve "today", "tomorrow", weekday names relative to the time the message was sent.
- can_i_start: crewId is the sender's crew; if no slot is said use "full_day"; the task comes from the words or the crew's trade.
- Asking to change the design, choose a material, approve or decide anything -> decision_needed.
- If the place, element, or day the query needs is not clear, reply {"query": null}. Never guess a location, a direction or a day.`;
}

function userPrompt(q: Question, scene: Scene): string {
  const crew = scene.crews.find((c) => c.id === q.crewId);
  return `Sent: ${q.time}\nFrom: ${crew ? `${crew.id} (${crew.name}, ${crew.trade})` : "unknown sender"}\nMessage: ${q.text}`;
}

/** Seconds Groq asks us to wait on a 429: retry-after header, else "try again in 1.68s" in the body, else 5. */
function retryAfter(res: Response, body: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const m = /try again in ([\d.]+)s/i.exec(body);
  return m ? Number(m[1]) : 5;
}

const RATE_LIMIT_TRIES = 6;

async function call(messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set; live question parsing needs it (see .env.example)");
  let res: Response | undefined;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: groqModel(), temperature: 0, response_format: { type: "json_object" }, messages }),
    });
    if (res.status !== 429 || attempt >= RATE_LIMIT_TRIES) break;
    // Free tier: tokens-per-minute limit. Wait what Groq asks (plus a margin) and try again.
    const wait = retryAfter(res, await res.text()) + 1;
    console.error(`Groq rate limit, waiting ${wait.toFixed(1)} s (try ${attempt}/${RATE_LIMIT_TRIES})`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!res.ok) throw new Error(`Groq answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq reply had no content");
  return content;
}

/** One call, one retry with the validation error. Returns null when the model says it cannot tell. */
export async function groqParse(q: Question, scene: Scene, ctx?: LearningContext): Promise<StructuredQuery | null> {
  const messages = [
    { role: "system", content: systemPrompt(scene, ctx) },
    { role: "user", content: userPrompt(q, scene) },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await call(attempt === 0 ? messages : [...messages, { role: "user", content: `Your last reply was invalid: ${lastError}. Reply with valid JSON only.` }]);
    try {
      const r = Reply.safeParse(JSON.parse(content));
      if (r.success) return r.data.query;
      lastError = r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastError = "not JSON";
    }
  }
  throw new Error(`Groq reply failed validation twice: ${lastError}`);
}
