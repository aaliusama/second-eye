import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage, ExtractResult, Scene } from "@site/contracts";
import { liveCacheId } from "../api/live-id";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { applyOperations } from "../model/index";
import { dataPath, REPO_ROOT } from "../paths";
import { DAYS, PEOPLE, PHONE, type DayName } from "../../data/build/source";
import { extractBatch, llmProvenance, writeCacheEntry } from "./index";
import { groqModel } from "./llm";

// Owner: B. Fill data/llm-cache/ with real Groq extraction for every golden-replay message and phone text.
// Run: npx tsx server/extract/build-cache.ts [--force]
// Needs GROQ_API_KEY in .env (never printed). Entries already from the LLM are kept unless --force.
// Then compares each entry with the hand-written expectation in data/expected/ and writes data/extraction-report.json.

const BATCH = 8;

try {
  process.loadEnvFile(join(REPO_ROOT, ".env"));
} catch {
  // no .env
}
if (!process.env.GROQ_API_KEY) {
  console.log("GROQ_API_KEY is not set. Nothing built.");
  process.exit(1);
}
const force = process.argv.includes("--force");

async function readJson(path: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}
const isLlm = async (id: string) => String((await readJson(dataPath("llm-cache", `${id}.json`)))?.provenance ?? "").startsWith("llm:");

const replay = await loadGoldenReplay();
let scene: Scene = await loadStartScene();
const messages = replay.events.flatMap((e) => (e.kind === "message" ? [e.message] : []));

const lead = (crewId: string) => Object.values(PEOPLE).find((p) => "crewId" in p && p.crewId === crewId && p.senderRole === "crew_lead");
const phone: ChatMessage[] = PHONE.map((p) => {
  const [day, hm] = p.at.split(" ");
  const person = lead(p.crewId);
  return {
    id: liveCacheId(p.text, p.crewId),
    time: `${DAYS[day as DayName]}T${hm}:00`,
    thread: "site-group",
    senderName: person?.senderName ?? p.crewId,
    senderRole: "crew_lead",
    crewId: p.crewId,
    text: p.text,
    kind: "text",
  };
});

console.log(`Model ${groqModel()}: ${messages.length} replay messages + ${phone.length} phone texts, batches of ${BATCH}`);

// Replay in time order; the floor moves as the chat goes, so a move is measured from where the element is then.
const all = [...messages, ...phone];
let wrote = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const batch = all.slice(i, i + BATCH);
  const todo: ChatMessage[] = [];
  for (const m of batch) if (force || !(await isLlm(m.id))) todo.push(m);
  if (todo.length > 0) {
    const results = await extractBatch(todo, scene);
    for (const r of results) await writeCacheEntry(r.result, llmProvenance(), r.facts);
    wrote += results.length;
    console.log(`batch ${i / BATCH + 1}: wrote ${todo.map((m) => m.id).join(" ")}`);
  }
  for (const m of batch) {
    const entry = await readJson(dataPath("llm-cache", `${m.id}.json`));
    if (entry) scene = applyOperations(scene, entry.operations);
  }
}
console.log(`Wrote ${wrote} entries.`);

// ---------- Compare with the hand-written expectation ----------

/** One string per fact, so two extractions compare as sets. */
function facts(r: ExtractResult | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  for (const op of r.operations) {
    if (op.type === "move") out.push(`move ${op.elementId} ${op.note ?? ""}`.trim());
    if (op.type === "set_status") out.push(`status ${op.elementId} ${op.state}`);
    if (op.type === "add" || op.type === "remove") out.push(`${op.type} ${op.type === "add" ? op.element.id : op.elementId}`);
  }
  for (const i of r.intents) {
    out.push(`plan ${i.crewId} ${i.day} ${i.slot} ${i.taskType} ${i.placeId ?? "(no place)"} [${[...i.elementIds].sort().join(",")}]`);
  }
  return out.sort();
}

let tp = 0;
let fp = 0;
let fn = 0;
let exact = 0;
const mismatches: { messageId: string; text: string; expected: string[]; llm: string[] }[] = [];
for (const m of all) {
  const expected = facts(await readJson(dataPath("expected", `${m.id}.json`)));
  const llm = facts(await readJson(dataPath("llm-cache", `${m.id}.json`)));
  const e = new Set(expected);
  const l = new Set(llm);
  const hit = [...l].filter((x) => e.has(x)).length;
  tp += hit;
  fp += l.size - hit;
  fn += e.size - hit;
  if (hit === e.size && hit === l.size) exact++;
  else mismatches.push({ messageId: m.id, text: m.text, expected, llm });
}

const report = {
  note: "Simulated site data. LLM extraction compared with the hand-written expectation in data/expected/, fact by fact.",
  model: groqModel(),
  messages: all.length,
  messagesExact: exact,
  facts: { expected: tp + fn, extracted: tp + fp, matched: tp, extra: fp, missed: fn },
  mismatches,
};
await writeFile(dataPath("extraction-report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`\nExtraction vs expectation: ${exact}/${all.length} messages exact; facts matched ${tp}, extra ${fp}, missed ${fn}`);
for (const x of mismatches) {
  console.log(`\n${x.messageId}: ${x.text}`);
  for (const f of x.expected.filter((f) => !x.llm.includes(f))) console.log(`  missed  ${f}`);
  for (const f of x.llm.filter((f) => !x.expected.includes(f))) console.log(`  extra   ${f}`);
}
console.log("\nWrote data/extraction-report.json");
