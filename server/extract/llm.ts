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

/**
 * The dates of the next seven days, named, computed here rather than by the model.
 * The model resolves "wed arvo" or "saturday" by looking it up, not by counting weekdays.
 */
export function calendar(t: string): string {
  const days: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(`${i === 1 ? "tomorrow = " : ""}${WEEKDAYS[d.getUTCDay()]} ${d.toISOString().slice(0, 10)}`);
  }
  return `(calendar: ${days.join(", ")})`;
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

plans: work the SENDER'S crew says it will do on a future day ("tomorrow", "fri arvo", "saturday morning", "wednesday 10am").
  day: take the date from the calendar line given with the message ("tomorrow", "wed", "saturday" are looked up there). Never count weekdays yourself.
  {"day":"YYYY-MM-DD","slot":"morning"|"afternoon"|"full_day","taskType":T,"placeId":id|null,"placeSaid":string|null,"elementIds":[ids],"description":string,"status":"planned"|"cancelled","confidence":0..1}
  - status "cancelled": the crew drops a plan it stated before, or moves it ("we're off that job tomorrow", "push it to the afternoon", "shift it to friday"). Give the dropped plan with status "cancelled", copying day, slot, taskType and placeId from the crew's recorded plans listed with the message; then give the new plan, if any, with status "planned" and the same taskType unless the words change it.
  T is one of: layout, rough_in_plumbing, rough_in_electrical, inspection, close_wall, finish_drywall, paint, tile, install_fixtures, other.
  - placeId: the room or zone the work is in. "204", "unit 204", "the 204 bath" mean room-204. If the place is a nickname or unclear, placeId is null and placeSaid holds the words. Never guess a place.
  - elementIds: walls or fixtures the work is on, along or set out from, only when the words name them and the list above has a matching element (a unit's bathroom wall by its side, a unit's corridor wall, a fixture or finish named for that unit and room). "Partition" and "stud wall" mean a wall. A side named inside a unit's room ("the north wall" of a unit's bath) is that unit's element with that room and side in its name. The unit number in the element's name must be a unit the message names; never take a neighbouring unit's element.
  - slot: "morning", "afternoon"/"arvo", a time after 12:00 is afternoon; "full day" or no time said for a whole day of work is full_day.
  - Reports of work done today, questions, and other crews' plans are not plans. A plan stated in the same message as a question is still a plan: "we lay the 205 bath tile saturday, approved right?" gives the Saturday tile plan; the question itself is not a plan and not a change. An inspection the sender's crew says is booked for a future day is a plan with taskType inspection.
  - A crew lead assigning work to a member of their own crew is the sender crew's plan, even when the lead says a person's name instead of "we". A leading "and" does not make it a non-plan. Do not assume a named person belongs to another crew.
  - Painting, priming, cutting in, first or second coat = paint. Closing up / boarding a wall = close_wall. Tape and mud, boarding a room = finish_drywall. Setting out, marking out, snapping lines = layout. Supply lines, first-fix plumbing = rough_in_plumbing. Pulling cable, first-fix electrics = rough_in_electrical. Hanging lights, setting a vanity = install_fixtures. Staging material, measuring up = other.
  - An inspection booked or confirmed for the sender's crew is that crew's plan with taskType inspection on that day and in that place.

changes: what the message says changed in the design or the decisions, from anyone.
  {"kind":"move","elementId":id,"direction":"north"|"south"|"east"|"west"|null,"metres":number|null,"confidence":0..1}  a wall or fixture moves. 40 cm = 0.4. If the direction or distance is not said, use null. Never guess a direction.
  {"kind":"status","elementId":id,"state":"proposed"|"approved"|"built"|"unconfirmed","confidence":0..1}  "proposing", "suggesting", "not approved yet", "owner choosing" = proposed; "owner confirmed", "signed off", "approved", "go ahead" = approved.
  - A change counts however it is phrased and wherever it is said: "shifts", "moves", "goes", "moved this morning", a numbered item, bulletin or instruction, or a heads-up passed on to a crew. "25cm" = 0.25. "Partition" means a wall; "bath" means bathroom.
  - Fixtures go by their trade names: pendants, downlights and spots are light fixtures; a vanity, basin or tray is a bathroom fixture. Use the listed element for that unit and room.
  - A specific material or fixture suggestion that is waiting on owner sign-off is a proposed decision, even if no physical change has happened. Record that proposal on the matching listed fixture; waiting for approval never means approved.

Most messages have no plans and no changes: give empty lists. Confidence: how sure you are the fact was said, not whether it is right.`;
}

export function userPrompt(messages: ChatMessage[], scene: Scene): string {
  const crewName = (id?: string) => scene.crews.find((c) => c.id === id)?.name;
  return messages
    .map((m) => {
      const from = m.crewId ? `${m.senderName}, crew ${m.crewId} (${crewName(m.crewId) ?? "?"})` : `${m.senderName} (${m.senderRole})`;
      return `[${m.id}] sent ${when(m.time)} in ${m.thread} by ${from}${m.kind === "voice" ? " (voice note)" : ""}\n${calendar(m.time)}\n${recordedPlans(m, scene)}${m.text}`;
    })
    .join("\n\n");
}

/** The sender crew's plans still on record from today on, so "move it to wednesday instead" can name what moves. */
export function recordedPlans(m: ChatMessage, scene: Scene): string {
  if (!m.crewId) return "";
  const today = m.time.slice(0, 10);
  const plans = scene.tasks.filter((t) => t.crewId === m.crewId && t.status === "planned" && t.day >= today);
  if (plans.length === 0) return "";
  return `(recorded plans of this crew: ${plans.map((t) => `${t.day} ${t.slot} ${t.taskType} ${t.placeId}`).join("; ")})\n`;
}

function retryAfter(res: Response, body: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const m = /try again in ([\d.]+)s/i.exec(body);
  return m ? Number(m[1]) : 5;
}

/**
 * patient (cache builders, evaluation): wait out rate limits, up to 8 tries.
 * interactive (a live demo message): at most 2 tries and short waits, so a phone never hangs.
 */
export type CallMode = "patient" | "interactive";
const LIMITS = {
  patient: { tries: 8, timeoutMs: 60_000, maxWaitS: 60 },
  interactive: { tries: 2, timeoutMs: 15_000, maxWaitS: 3 },
} as const;

async function call(messages: { role: string; content: string }[], mode: CallMode): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set; live extraction needs it (see .env.example)");
  const limit = LIMITS[mode];
  let res: Response | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: groqModel(), temperature: 0, reasoning_effort: "low", response_format: { type: "json_object" }, messages }),
        signal: AbortSignal.timeout(limit.timeoutMs),
      });
    } catch (err) {
      // Timeout or network error: retry once within the limit, then give up honestly.
      if (attempt >= limit.tries) throw new Error(`Groq request failed: ${(err as Error).name === "TimeoutError" ? `no answer within ${limit.timeoutMs / 1000} s` : String(err)}`);
      continue;
    }
    if ((res.status !== 429 && res.status < 500) || attempt >= limit.tries) break;
    const wait = Math.min(retryAfter(res, await res.text()) + 1, limit.maxWaitS);
    console.error(`Groq answered ${res.status}, waiting ${wait.toFixed(1)} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!res.ok) throw new Error(`Groq answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq reply had no content");
  return content;
}

/**
 * Second look. Rules audit what the model returned: a message whose words carry a clear cue
 * (a distance and a direction; a decision word) but whose reply has no fact of that kind is read
 * again on its own, with the cue named. The model may still answer nothing; nothing is ever filled in by rule.
 */
const MOVE_CUE = /\b\d+(?:[.,]\d+)?\s?(?:cm|mm|m)\b[\s\S]*\b(?:north|south|east|west)\b|\b(?:north|south|east|west)\b[\s\S]*\b\d+(?:[.,]\d+)?\s?(?:cm|mm|m)\b/i;
const DECISION_CUE = /\b(?:approved|signed off|sign[- ]off|go ahead|green light|waiting on the owner|owner (?:to )?(?:choose|decide|pick)|suggest(?:ed|s|ing)?|propos(?:ed|es|ing))\b/i;

export function missedCues(m: ChatMessage, f: MessageFacts): string[] {
  const out: string[] = [];
  if (MOVE_CUE.test(m.text) && !f.changes.some((c) => c.kind === "move")) out.push("it gives a distance and a direction, so it may state that a wall or fixture moves");
  if (DECISION_CUE.test(m.text) && !f.changes.some((c) => c.kind === "status")) out.push("it uses a decision word, so it may state that a design choice is proposed or approved");
  return out;
}

/** Facts for each message, in the same order, with a second look at messages whose cues were not answered. */
export async function groqFacts(messages: ChatMessage[], scene: Scene, mode: CallMode = "patient"): Promise<MessageFacts[]> {
  const first = await groqFactsOnce(messages, scene, mode);
  return Promise.all(
    first.map(async (f, i) => {
      const m = messages[i]!;
      const cues = missedCues(m, f);
      if (cues.length === 0) return f;
      try {
        const [again] = await groqFactsOnce([m], scene, mode, `Read message ${m.id} again carefully: ${cues.join("; and ")}. If it really states such a fact, give it. If it does not, give empty lists. Never guess an element, a direction or a distance.`);
        // Keep the first reading's plans; take the second look's changes only if it found some.
        return again && again.changes.length > 0 ? { ...f, changes: again.changes } : f;
      } catch {
        return f;
      }
    }),
  );
}

async function groqFactsOnce(messages: ChatMessage[], scene: Scene, mode: CallMode, focus?: string): Promise<MessageFacts[]> {
  const prompt = [
    { role: "system", content: systemPrompt(scene) },
    { role: "user", content: userPrompt(messages, scene) + (focus ? `\n\n${focus}` : "") },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await call(attempt === 0 ? prompt : [...prompt, { role: "user", content: `Your last reply was invalid: ${lastError}. Reply with valid JSON only, one result per message id.` }], mode);
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
