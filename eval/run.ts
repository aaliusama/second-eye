import { readFile, writeFile } from "node:fs/promises";
import { LabelSet, type EvalCounts } from "@site/contracts";
import { loadGoldenReplay, loadStartScene } from "@site/server/load";
import { dataPath, evalPath } from "@site/server/paths";
import { runReplay } from "@site/server/replay";
import { score } from "./score";

// Owner: C. npm run eval: golden replay vs data/labels.json.
// The only source of numbers for the README, the UI and the pitch.

async function main(): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(dataPath("labels.json"), "utf8");
  } catch {
    console.log("No labels yet: data/labels.json not found. Nothing measured.");
    return;
  }

  const labels = LabelSet.parse(JSON.parse(raw));
  const replay = await loadGoldenReplay();
  const state = await runReplay(replay, await loadStartScene());
  const results = score(replay.id, labels, state.findings);

  const row = (name: string, c: EvalCounts) =>
    `${name.padEnd(15)} ${String(c.caught).padStart(6)} ${String(c.missed).padStart(6)} ${String(c.falseAlarms).padStart(12)}`;
  console.log(`Replay ${results.replayId}, ${results.cases} labelled cases`);
  console.log(`${"check".padEnd(15)} ${"caught".padStart(6)} ${"missed".padStart(6)} ${"false alarms".padStart(12)}`);
  for (const [check, counts] of Object.entries(results.perCheck)) console.log(row(check, counts));
  console.log(row("total", results.total));

  await writeFile(evalPath("results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log("Wrote eval/results.json");
}

await main();
