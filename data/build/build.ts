import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChatMessage,
  CrewIntent,
  ExtractResult,
  GoldenReplay,
  LabelSet,
  Operation,
  Scene,
  type Element,
  type PlanTask,
  type ReplayEvent,
} from "@site/contracts";
import { liveCacheId } from "../../server/api/live-id";
import { CASES, CREWS, DAYS, ELEMENTS, MESSAGES, PEOPLE, PHONE, PROVENANCE, REHEARSALS, START_TIME, type DayName, type X } from "./source";

// Owner: B. npx tsx data/build/build.ts
// Writes data/floor.json, chat.json, replay.golden.json, labels.json and llm-cache/*.json from source.ts.
// Same source, same files: ids come from time order, nothing random, no wall clock.

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = (rel: string, value: unknown) => writeFileSync(join(DATA, rel), JSON.stringify(value, null, 2) + "\n");

/** "Thu 14:02" -> "2026-11-12T14:02:00" */
function time(at: string): string {
  const [day, hm] = at.split(" ");
  const date = DAYS[day as DayName];
  if (!date || !/^\d{2}:\d{2}$/.test(hm ?? "")) throw new Error(`bad time "${at}"`);
  return `${date}T${hm}:00`;
}

// ---------- Floor ----------

const elements: Element[] = ELEMENTS.map((e) => ({
  id: e.id,
  type: e.type,
  name: e.name,
  aliases: e.aliases ?? [],
  geometry: e.geometry,
  ...(e.height !== undefined ? { height: e.height } : {}),
  state: e.state,
  version: 1,
  history: [
    { version: 1, time: START_TIME, sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add", geometry: e.geometry, state: e.state, confidence: 1 },
  ],
}));
const floor = Scene.parse({
  floorId: "level-2",
  name: "Level 2, units 201-206",
  time: START_TIME,
  elements,
  crews: CREWS,
  tasks: [],
});
const elementIds = new Set(elements.map((e) => e.id));

// ---------- Message ids ----------

for (let i = 1; i < MESSAGES.length; i++) {
  if (time(MESSAGES[i]!.at) < time(MESSAGES[i - 1]!.at)) throw new Error(`messages out of time order at ${MESSAGES[i]!.at}`);
}
const FIXED = new Set(["m-001", "m-002"]);
const idOf = new Map<string, string>();
let next = 3;
for (const m of MESSAGES) {
  const id = m.key && FIXED.has(m.key) ? m.key : `m-${String(next++).padStart(3, "0")}`;
  if (m.key) {
    if (idOf.has(m.key)) throw new Error(`duplicate key ${m.key}`);
    idOf.set(m.key, id);
  }
  (m as { id?: string }).id = id;
}
const msgId = (key: string) => {
  const id = idOf.get(key);
  if (!id) throw new Error(`unknown message key ${key}`);
  return id;
};

// ---------- Extraction ----------

const tasksByKey = new Map<string, PlanTask>();

function extractionFor(messageId: string, at: string, thread: string, crewId: string | undefined, xs: X[], key?: string): ExtractResult {
  const t = at;
  const operations: Operation[] = [];
  const intents: CrewIntent[] = [];
  xs.forEach((x, n) => {
    const suffix = `${messageId}-${n + 1}`;
    const confidence = x.conf ?? 0.9;
    const base = { id: `op-${suffix}`, time: t, sourceMessageId: messageId, thread, confidence };
    const known = (id: string) => {
      if (!elementIds.has(id)) throw new Error(`${messageId}: unknown element ${id}`);
    };
    if ("plan" in x) {
      if (!crewId) throw new Error(`${messageId}: a plan needs a crew sender`);
      const p = x.plan;
      const els = p.els ?? [];
      els.forEach(known);
      if (p.place) known(p.place);
      const shared = { crewId, day: DAYS[p.day], slot: p.slot, taskType: p.task, description: p.desc, elementIds: els, confidence };
      if (p.place) {
        const task: PlanTask = { id: `task-${suffix}`, ...shared, order: p.order ?? 0, placeId: p.place, status: "planned", sourceMessageId: messageId };
        operations.push({ ...base, type: "plan_task", task });
        if (key) tasksByKey.set(key, task);
      }
      // No place on record: intent only, without placeId. Learning (server/learning) may resolve it by nickname.
      intents.push({ id: `intent-${suffix}`, time: t, sourceMessageId: messageId, ...shared, ...(p.place ? { placeId: p.place } : {}) });
    } else if ("move" in x) {
      known(x.move);
      operations.push({ ...base, type: "move", elementId: x.move, to: x.to, note: x.note });
    } else if ("status" in x) {
      known(x.status);
      operations.push({ ...base, type: "set_status", elementId: x.status, state: x.state });
    } else {
      const task = tasksByKey.get(x.done);
      if (!task) throw new Error(`${messageId}: done refers to unknown plan ${x.done}`);
      operations.push({ ...base, type: "plan_task", task: { ...task, status: "done" } });
    }
  });
  return ExtractResult.parse({ messageId, operations, intents });
}

// ---------- Write ----------

const chat: ChatMessage[] = [];
const cache: { file: string; entry: ExtractResult }[] = [];

for (const m of MESSAGES) {
  const id = (m as { id?: string }).id!;
  const person = PEOPLE[m.by];
  const message = ChatMessage.parse({
    id,
    time: time(m.at),
    thread: m.thread ?? person.thread,
    senderName: person.senderName,
    senderRole: person.senderRole,
    ...("crewId" in person ? { crewId: person.crewId } : {}),
    text: m.text,
    kind: m.voice ? "voice" : "text",
  });
  chat.push(message);
  cache.push({ file: id, entry: extractionFor(id, message.time, message.thread, message.crewId, m.x ?? [], m.key) });
}

for (const p of PHONE) {
  const id = liveCacheId(p.text, p.crewId);
  cache.push({ file: id, entry: extractionFor(id, time(p.at), "site-group", p.crewId, p.x) });
}

const events: ReplayEvent[] = chat.map((message) => ({ kind: "message", message }));
for (const r of REHEARSALS) {
  const at = time(r.at);
  const i = events.findIndex((e) => (e.kind === "message" ? e.message.time : e.time) > at);
  events.splice(i < 0 ? events.length : i, 0, { kind: "rehearse", time: at, day: DAYS[r.day] });
}
const replay = GoldenReplay.parse({ id: "golden", events });

const labels = LabelSet.parse({
  cases: CASES.map((c) => ({ id: c.id, check: c.check, triggerMessageId: msgId(c.trigger), crewIds: c.crews, elementIds: c.elements, note: c.note })),
});

// data/expected/: the hand-written expectation, always rewritten (compared with LLM output by server/extract/build-cache.ts).
// data/llm-cache/: an entry from the LLM (provenance "llm: ...") is kept; anything else is replaced by the expectation,
// so the demo runs before the live run. Entries for messages that no longer exist are removed.
const expectedDir = join(DATA, "expected");
rmSync(expectedDir, { recursive: true, force: true });
mkdirSync(expectedDir, { recursive: true });
const cacheDir = join(DATA, "llm-cache");
mkdirSync(cacheDir, { recursive: true });
const wanted = new Set(cache.map((c) => `${c.file}.json`));
const fromLlm = (f: string) => {
  try {
    return String(JSON.parse(readFileSync(join(cacheDir, f), "utf8")).provenance ?? "").startsWith("llm:");
  } catch {
    return false;
  }
};
for (const f of readdirSync(cacheDir)) if (f.endsWith(".json") && !wanted.has(f)) rmSync(join(cacheDir, f));
let keptLlm = 0;
for (const { file, entry } of cache) {
  write(`expected/${file}.json`, { provenance: PROVENANCE, ...entry });
  if (fromLlm(`${file}.json`)) keptLlm++;
  else write(`llm-cache/${file}.json`, { provenance: PROVENANCE, ...entry });
}

write("floor.json", floor);
write("chat.json", { note: "Simulated site data.", messages: chat });
write("replay.golden.json", replay);
write("labels.json", labels);

const withOps = cache.filter((c) => c.entry.operations.length + c.entry.intents.length > 0).length;
console.log(
  `floor: ${floor.elements.length} elements, ${floor.crews.length} crews\n` +
    `chat: ${chat.length} messages (${withOps - PHONE.length} with operations or intents)\n` +
    `replay: ${replay.events.length} events\nlabels: ${labels.cases.length} cases\n` +
    `cache: ${cache.length} entries (${PHONE.length} phone), ${keptLlm} kept from the LLM, ${cache.length - keptLlm} hand-written`,
);
for (const p of PHONE) console.log(`  phone ${p.name}: ${liveCacheId(p.text, p.crewId)}`);
