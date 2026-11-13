import { join } from "node:path";
import { loadStartScene } from "../model/load";
import { REPO_ROOT } from "../paths";
import { ASKED_AT, DEMO_QUESTIONS } from "./demo-questions";
import { readCache, writeCache } from "./cache";
import { groqModel, groqParse } from "./llm";
import { cacheKey, guard } from "./parse";

// Owner: E. Fill server/query/cache/ for the demo questions with real Groq calls.
// Run: npx tsx server/query/build-cache.ts [--force]
// Needs GROQ_API_KEY in .env. The key is never printed. Rerun after data/floor.json changes.

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
const scene = await loadStartScene();
console.log(`Model ${groqModel()}, floor ${scene.floorId}, ${scene.elements.length} elements, ${scene.crews.length} crews`);

for (const dq of DEMO_QUESTIONS) {
  const crew = scene.crews.find((c) => c.trade === dq.trade);
  const missing = dq.rooms.filter((n) => !scene.elements.some((e) => e.type === "room" && e.name.includes(n)));
  if (!crew || missing.length) {
    console.log(`skip  "${dq.text}": floor has no ${!crew ? `${dq.trade} crew` : `room ${missing.join(", ")}`}`);
    continue;
  }
  const key = cacheKey(dq.text, crew.id);
  if (!force && (await readCache(key))) {
    console.log(`have  ${key} "${dq.text}"`);
    continue;
  }
  const q = { id: `q-${key}`, time: ASKED_AT, crewId: crew.id, text: dq.text };
  const query = await groqParse(q, scene);
  await writeCache({ key, text: dq.text, crewId: crew.id, query, source: "llm", model: groqModel() });
  const kept = guard(query, q, scene);
  console.log(`wrote ${key} "${dq.text}" -> ${JSON.stringify(query)}${kept ? "" : "  (guard: not found)"}  expect: ${dq.expect}`);
}
