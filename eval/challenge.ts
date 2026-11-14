import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GoldenReplay, LabelSet, type ExtractResult, type Scene } from "@site/contracts";
import { loadStartScene } from "../server/model/load";
import { dataPath, evalPath, REPO_ROOT } from "../server/paths";
import { runReplay } from "../server/model/replay";
import { applyOperations } from "../server/model/index";
import { extractBatch, llmProvenance, useCache, writeCacheEntry } from "../server/extract/index";
import { groqModel } from "../server/extract/llm";
import { rehearsalFindings, score, scoreDetail } from "./score";

// Owner: C. npm run eval:challenge: the separate challenge set in data/challenge/, scored with the golden rules.
// The set was written and committed before any run. Its live extraction is stored once in
// data/challenge/llm-cache/ with provenance; the golden data/llm-cache/ is never read or written here.
// A missed case is split into an extraction failure (a message it rests on was read wrong) or a check miss.

const CACHE = ["challenge", "llm-cache"];
const BATCH = 8;

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Facts in the same string form as data/challenge/expected.json. */
function facts(r: ExtractResult | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  for (const op of r.operations) {
    if (op.type === "move") out.push(`move ${op.elementId} ${op.note ?? ""}`.trim());
    if (op.type === "set_status") out.push(`status ${op.elementId} ${op.state}`);
  }
  for (const i of r.intents) {
    out.push(`plan ${i.crewId} ${i.day} ${i.slot} ${i.taskType} ${i.placeId ?? "(no place)"}`);
    for (const e of i.elementIds) out.push(`on ${i.crewId} ${i.day} ${e}`);
  }
  return [...new Set(out)].sort();
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch {
    // no .env
  }
  const replay = GoldenReplay.parse(await readJson(dataPath("challenge", "replay.json")));
  const labels = LabelSet.parse(await readJson(dataPath("challenge", "labels.json")));
  const expected = (await readJson<{
    facts: Record<string, string[]>;
    cases: Record<string, { kind: string; needs: string[] }>;
    nonCases: { kind: string; why: string; messageIds: string[] }[];
  }>(dataPath("challenge", "expected.json")))!;
  const messages = replay.events.flatMap((e) => (e.kind === "message" ? [e.message] : []));
  const cached = async (id: string) => readJson<ExtractResult & { provenance?: string }>(dataPath(...CACHE, `${id}.json`));

  // 1. Extract once, in time order, measuring moves from the floor as it is then. Stored outputs are reused.
  const missing: string[] = [];
  for (const m of messages) if (!(await cached(m.id))) missing.push(m.id);
  if (missing.length > 0) {
    if (!process.env.GROQ_API_KEY) {
      const out = { status: "unavailable", reason: `GROQ_API_KEY is missing; ${missing.length} of ${messages.length} challenge messages have no stored extraction. Nothing scored.` };
      await writeFile(evalPath("results.challenge.json"), JSON.stringify(out, null, 2) + "\n");
      console.log(out.reason);
      return;
    }
    await mkdir(dataPath(...CACHE), { recursive: true });
    let scene: Scene = await loadStartScene();
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const todo = batch.filter((m) => missing.includes(m.id));
      if (todo.length > 0) {
        const results = await extractBatch(todo, scene);
        for (const r of results) await writeCacheEntry(r.result, llmProvenance(), r.facts, CACHE);
        console.log(`extracted ${todo.map((m) => m.id).join(" ")}`);
      }
      for (const m of batch) {
        const entry = await cached(m.id);
        if (entry) scene = applyOperations(scene, entry.operations);
      }
    }
  }
  const provenance = [...new Set(await Promise.all(messages.map(async (m) => (await cached(m.id))?.provenance ?? "none")))];

  // 2. Run the real pipeline over the challenge replay, reading only the challenge cache.
  delete process.env.LIVE_LLM;
  useCache([CACHE], CACHE);
  const state = await runReplay(replay, await loadStartScene());
  const live = [...state.findings, ...state.resolvedFindings];
  const rehearsal = rehearsalFindings(state.rehearsals);
  const results = score(replay.id, labels, [...live, ...rehearsal]);
  const detail = scoreDetail(replay.id, labels, live, rehearsal, state.scene.tasks, state.messages.map((m) => m.id));

  // 3. Extraction against the hand-written expectation, message by message.
  let matched = 0;
  let extra = 0;
  let missedFacts = 0;
  const wrongMessages = new Set<string>();
  const extraction: { messageId: string; text: string; expected: string[]; extracted: string[] }[] = [];
  for (const m of messages) {
    const want = expected.facts[m.id] ?? [];
    const got = facts(await cached(m.id));
    const hit = got.filter((f) => want.includes(f)).length;
    matched += hit;
    extra += got.length - hit;
    missedFacts += want.length - hit;
    if (hit !== want.length || hit !== got.length) {
      wrongMessages.add(m.id);
      extraction.push({ messageId: m.id, text: m.text, expected: want, extracted: got });
    }
  }

  // 4. Why each missed case was missed.
  const cases = detail.cases.map((c) => {
    const needs = expected.cases[c.id]?.needs ?? [];
    const misread = needs.filter((id) => {
      const want = expected.facts[id] ?? [];
      return want.length > 0 && wrongMessages.has(id);
    });
    return {
      id: c.id,
      check: c.check,
      kind: expected.cases[c.id]?.kind,
      caughtBy: c.caughtBy,
      outcome: c.caught ? "caught" : misread.length > 0 ? "missed: extraction failure" : "missed: check miss",
      misreadMessages: misread,
    };
  });
  const nonCaseIds = new Set(expected.nonCases.flatMap((n) => n.messageIds));
  const falseAlarms = detail.falseAlarms.map((i) => ({
    key: i.key,
    check: i.check,
    triggers: i.triggers,
    fromPlantedNonCase: i.messageIds.some((id) => nonCaseIds.has(id)),
    restsOnMisreadMessage: i.messageIds.some((id) => wrongMessages.has(id)),
  }));
  const nonCases = expected.nonCases.map((n) => ({
    kind: n.kind,
    messageIds: n.messageIds,
    raisedFalseAlarm: detail.falseAlarms.some((i) => i.messageIds.some((id) => n.messageIds.includes(id))),
  }));

  const out = {
    note: "Simulated site data. Separate challenge set written and committed before any run (data/challenge/). Extracted once with live Groq; outputs stored with provenance and not edited. Scored with the golden rules (eval/score.ts). Not field performance.",
    model: groqModel(),
    provenance,
    replayId: results.replayId,
    messages: messages.length,
    cases: results.cases,
    perCheck: results.perCheck,
    total: results.total,
    perTrigger: detail.perTrigger,
    missedBy: {
      extractionFailure: cases.filter((c) => c.outcome === "missed: extraction failure").length,
      checkMiss: cases.filter((c) => c.outcome === "missed: check miss").length,
    },
    extraction: {
      messagesWithExpectedFacts: Object.keys(expected.facts).length,
      messagesReadExactly: messages.length - wrongMessages.size,
      facts: { expected: matched + missedFacts, extracted: matched + extra, matched, extra, missed: missedFacts },
    },
    caseResults: cases,
    falseAlarms,
    nonCases,
    extractionMismatches: extraction,
  };
  await writeFile(evalPath("results.challenge.json"), JSON.stringify(out, null, 2) + "\n");

  const row = (name: string, c: { caught: number; missed: number; falseAlarms: number }) =>
    `${name.padEnd(17)} ${String(c.caught).padStart(6)} ${String(c.missed).padStart(6)} ${String(c.falseAlarms).padStart(12)}`;
  console.log(`\nChallenge set (${out.model}): ${messages.length} messages, ${results.cases} labelled cases, ${expected.nonCases.length} planted non-cases`);
  console.log(`${"check".padEnd(17)} ${"caught".padStart(6)} ${"missed".padStart(6)} ${"false alarms".padStart(12)}`);
  for (const [check, c] of Object.entries(results.perCheck)) console.log(row(check, c));
  console.log(row("total", results.total));
  console.log(row("live alone", detail.perTrigger.live));
  console.log(row("rehearsal alone", detail.perTrigger.rehearsal));
  console.log(`\nMissed: ${out.missedBy.extractionFailure} extraction failure, ${out.missedBy.checkMiss} check miss`);
  console.log(`Extraction: ${out.extraction.messagesReadExactly}/${messages.length} messages exact; facts matched ${matched}, extra ${extra}, missed ${missedFacts}`);
  for (const c of cases) console.log(`${c.id.padEnd(8)} ${c.check.padEnd(14)} ${c.outcome}${c.misreadMessages.length ? ` (${c.misreadMessages.join(", ")})` : ""}`);
  for (const n of nonCases) console.log(`non-case ${n.kind}: ${n.raisedFalseAlarm ? "FALSE ALARM" : "quiet"}`);
  for (const f of falseAlarms) console.log(`false alarm ${f.key}${f.restsOnMisreadMessage ? " (rests on a misread message)" : ""}`);
  console.log("\nWrote eval/results.challenge.json");
}

await main();
