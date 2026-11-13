import type { ChatMessage, Scene } from "@site/contracts";
import { BatchReply, type MessageFacts } from "./facts";

// Owner: B. Messages -> facts with Groq (OpenAI-compatible chat completions, plain fetch).
// The model says what was said. It never decides what is wrong: server/checks does.
// It is not given nicknames on purpose: a nickname comes out as placeId null, and
// server/learning resolves it by rule, so a cached reply stays right after the superintendent maps it.

const URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const groqModel = () => process.env.GROQ_MODEL || DEFAULT_MODEL;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "2026-11-12T16:10:00" -> "Thursday 2026-11-12 16:10". Calendar math on the replay time only. */
function when(t: string): string {
  const day = WEEKDAYS[new Date(`${t.slice(0, 10)}T00:00:00Z`).getUTCDay()];
  return `${day} ${t.slice(0, 10)} ${t.slice(11, 16)}`;
}

export function systemPrompt(scene: Scene): string {
  const elements = scene.elements.map((e) => `- ${e.id} (${e.type}) "${e.name}"`).join("\n");
  const crews = scene.crews.map((c) => `- ${c.id}: ${c.name} (${c.trade})`).join("\n");
  return `You read messages from a construction site's group chats and write down the facts in them. You never judge whether anything is wrong.

Elements on the floor (use these ids only):
${elements}
Crews:
${crews}

For EACH message, give {"id": <message id>, "plans": [...], "changes": [...]}. Reply with JSON only: {"results": [ ...one entry per message, same order... ]}.

plans: work the SENDER'S crew says it will do on a future day ("tomorrow", "fri arvo", "saturday morning").
  {"day":"YYYY-MM-DD","slot":"morning"|"afternoon"|"full_day","taskType":T,"placeId":id|null,"placeSaid":string|null,"elementIds":[ids],"description":string,"confidence":0..1}
  T is one of: layout, rough_in_plumbing, rough_in_electrical, inspection, close_wall, finish_drywall, paint, tile, install_fixtures, other.
  - placeId: the room or zone the work is in. "204", "unit 204", "the 204 bath" mean room-204. If the place is a nickname or unclear, placeId is null and placeSaid holds the words. Never guess a place.
  - elementIds: walls or fixtures the work is on or along, only when the words name them and the list above has a matching element (a unit's bathroom wall by its side, a unit's corridor wall, a fixture or finish named for that unit and room).
  - slot: "morning", "afternoon"/"arvo", a time after 12:00 is afternoon; "full day" or no time said for a whole day of work is full_day.
  - Reports of work done today, questions, and other crews' plans are not plans. An inspection the sender's crew says is booked for a future day is a plan with taskType inspection.
  - A crew lead assigning work to a member of their own crew is the sender crew's plan, even when the lead says a person's name instead of "we". A leading "and" does not make it a non-plan. Do not assume a named person belongs to another crew.
  - Painting, priming = paint. Closing up / boarding a wall = close_wall. Tape and mud, boarding a room = finish_drywall. Hanging lights, setting a vanity = install_fixtures. Staging material, measuring up = other.

changes: what the message says changed in the design or the decisions, from anyone.
  {"kind":"move","elementId":id,"direction":"north"|"south"|"east"|"west"|null,"metres":number|null,"confidence":0..1}  a wall or fixture moves. 40 cm = 0.4. If the direction or distance is not said, use null. Never guess a direction.
  {"kind":"status","elementId":id,"state":"proposed"|"approved"|"built"|"unconfirmed","confidence":0..1}  "proposing", "suggesting", "not approved yet", "owner choosing" = proposed; "owner confirmed", "approved" = approved.
  - A specific material or fixture suggestion that is waiting on owner sign-off is a proposed decision, even if no physical change has happened. Record that proposal on the matching listed fixture; waiting for approval never means approved.

Most messages have no plans and no changes: give empty lists. Confidence: how sure you are the fact was said, not whether it is right.`;
}

export function userPrompt(messages: ChatMessage[], scene: Scene): string {
  const crewName = (id?: string) => scene.crews.find((c) => c.id === id)?.name;
  return messages
    .map((m) => {
      const from = m.crewId ? `${m.senderName}, crew ${m.crewId} (${crewName(m.crewId) ?? "?"})` : `${m.senderName} (${m.senderRole})`;
      return `[${m.id}] sent ${when(m.time)} in ${m.thread} by ${from}${m.kind === "voice" ? " (voice note)" : ""}:\n${m.text}`;
    })
    .join("\n\n");
}

function retryAfter(res: Response, body: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const m = /try again in ([\d.]+)s/i.exec(body);
  return m ? Number(m[1]) : 5;
}

async function call(messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set; live extraction needs it (see .env.example)");
  let res: Response | undefined;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: groqModel(), temperature: 0, reasoning_effort: "low", response_format: { type: "json_object" }, messages }),
    });
    if (res.status !== 429 || attempt >= 8) break;
    const wait = retryAfter(res, await res.text()) + 1;
    console.error(`Groq rate limit, waiting ${wait.toFixed(1)} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!res.ok) throw new Error(`Groq answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq reply had no content");
  return content;
}

/** Facts for each message, in the same order. One retry with the validation error. */
export async function groqFacts(messages: ChatMessage[], scene: Scene): Promise<MessageFacts[]> {
  const prompt = [
    { role: "system", content: systemPrompt(scene) },
    { role: "user", content: userPrompt(messages, scene) },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await call(attempt === 0 ? prompt : [...prompt, { role: "user", content: `Your last reply was invalid: ${lastError}. Reply with valid JSON only, one result per message id.` }]);
    try {
      const r = BatchReply.safeParse(JSON.parse(content));
      if (r.success) {
        const byId = new Map(r.data.results.map((x) => [x.id, x]));
        const missing = messages.filter((m) => !byId.has(m.id)).map((m) => m.id);
        if (missing.length === 0) return messages.map((m) => byId.get(m.id)!);
        lastError = `no result for ${missing.join(", ")}`;
      } else {
        lastError = r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      }
    } catch {
      lastError = "not JSON";
    }
  }
  throw new Error(`Groq reply failed validation twice: ${lastError}`);
}
