import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage, LearningContext } from "@site/contracts";
import { liveCacheId } from "../api/live-id";
import { applyOperations } from "../model";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { dataPath, REPO_ROOT } from "../paths";
import { cachePath, extractLive, readCached, writeCached } from "./index";
import { groqModel, MISSING_KEY } from "./llm";

// Owner: B. Fill data/llm-cache/ with real Groq extraction.
// Run: npx tsx server/extract/build-cache.ts [--force] [--phone <file.json>]
//   - every message in data/replay.golden.json, in order, each on the scene the earlier ones built;
//   - scripted phone texts from --phone (default data/phone-texts.json if it exists):
//     [{ "crewId": "crew-plumbing", "text": "...", "thread"?: "...", "senderName"?: "..." }]
//     stored under the id the server gives a live phone message (server/api/live-id.ts).
// Existing entries are kept unless --force. Needs GROQ_API_KEY in .env; the key is never printed.

type PhoneText = { crewId?: string; text: string; thread?: string; senderName?: string };

try {
  process.loadEnvFile(join(REPO_ROOT, ".env"));
} catch {
  // no .env
}
if (!process.env.GROQ_API_KEY) {
  console.log(`${MISSING_KEY}. Nothing built; the demo keeps using the existing cache.`);
  process.exit(0);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const phoneArg = args.indexOf("--phone");
const phoneFile = phoneArg >= 0 ? args[phoneArg + 1] : dataPath("phone-texts.json");

async function readPhoneTexts(): Promise<PhoneText[]> {
  try {
    const list = JSON.parse(await readFile(phoneFile!, "utf8")) as PhoneText[];
    // Texts still in [[...]] are placeholders the phone never sends.
    return list.filter((p) => typeof p.text === "string" && !p.text.trim().startsWith("[["));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" && phoneArg < 0) return [];
    throw err;
  }
}

const ctx: LearningContext = { locationAliases: {}, crewNotes: {} };
const replay = await loadGoldenReplay();
let scene = await loadStartScene();
console.log(`Model ${groqModel()}, floor ${scene.floorId}, replay ${replay.id}`);

let wrote = 0;
let kept = 0;
let failed = 0;

async function one(message: ChatMessage): Promise<void> {
  const have = !force ? await readCached(message.id) : undefined;
  if (have) {
    kept++;
    scene = applyOperations(scene, have.operations);
    console.log(`have  ${message.id}`);
    return;
  }
  const { result, error } = await extractLive(message, ctx, scene);
  if (error) {
    failed++;
    console.log(`FAIL  ${message.id}: ${error}`);
    return;
  }
  await writeCached(result);
  wrote++;
  scene = applyOperations(scene, result.operations);
  console.log(`wrote ${cachePath(message.id)}  (${result.operations.length} ops, ${result.intents.length} intents)`);
}

let lastTime = scene.time;
for (const event of replay.events) {
  if (event.kind !== "message") continue;
  lastTime = event.message.time;
  await one(event.message);
}

for (const p of await readPhoneTexts()) {
  const crew = scene.crews.find((c) => c.id === p.crewId);
  await one({
    id: liveCacheId(p.text, p.crewId),
    time: lastTime,
    thread: p.thread ?? "site-group",
    senderName: p.senderName ?? crew?.name ?? "Phone",
    senderRole: p.crewId ? "crew_lead" : "superintendent",
    crewId: p.crewId,
    text: p.text,
    kind: "text",
  });
}

console.log(`done: ${wrote} written, ${kept} kept, ${failed} failed`);
