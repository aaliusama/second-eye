import { readFile, writeFile } from "node:fs/promises";
import { LabelSet, type EvalCounts } from "@site/contracts";
import { loadGoldenReplay, loadStartScene } from "@site/server/load";
import { dataPath, evalPath } from "@site/server/paths";
import { runReplay } from "@site/server/replay";
import { rehearsalFindings, score, scoreDetail } from "./score";

// Owner: C. npm run eval: golden replay vs data/labels.json, live and evening rehearsal findings pooled.
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
  // Evaluation measures alerts emitted during the replay, including ones a later message fixed.
  // The UI's active queue alone would erase successful catches (and past false alarms).
  const live = [...state.findings, ...state.resolvedFindings];
  const rehearsal = rehearsalFindings(state.rehearsals);
  const results = score(replay.id, labels, [...live, ...rehearsal]);
  const detail = scoreDetail(
    replay.id,
    labels,
    live,
    rehearsal,
    state.scene.tasks,
    state.messages.map((m) => m.id),
  );

  const row = (name: string, c: EvalCounts) =>
    `${name.padEnd(17)} ${String(c.caught).padStart(6)} ${String(c.missed).padStart(6)} ${String(c.falseAlarms).padStart(12)}`;
  const header = `${"".padEnd(17)} ${"caught".padStart(6)} ${"missed".padStart(6)} ${"false alarms".padStart(12)}`;

  console.log(`\nReplay ${results.replayId}, ${results.cases} labelled cases`);
  console.log(
    `Findings: ${detail.findings.live} live + ${detail.findings.rehearsal} rehearsal = ${detail.findings.incidents} incidents (repeats count once)\n`,
  );
  console.log(header.replace("".padEnd(17), "check".padEnd(17)));
  for (const [check, counts] of Object.entries(results.perCheck)) console.log(row(check, counts));
  console.log(row("total", results.total));

  console.log(`\n${header.replace("".padEnd(17), "trigger alone".padEnd(17))}`);
  console.log(row("live", detail.perTrigger.live));
  console.log(row("rehearsal", detail.perTrigger.rehearsal));

  console.log(`\n${header.replace("".padEnd(17), "crew".padEnd(17))}`);
  for (const [crew, counts] of Object.entries(detail.perCrew)) console.log(row(crew, counts));

  console.log(`\n${header.replace("".padEnd(17), "min confidence".padEnd(17))}`);
  for (const t of detail.thresholds) console.log(row(`>= ${t.threshold}`, t.total));

  console.log("\ncase              check            caught by");
  for (const c of detail.cases) console.log(`${c.id.padEnd(17)} ${c.check.padEnd(16)} ${c.caughtBy}`);
  const m = detail.messages;
  console.log(
    `\nMessages: ${m.total} in the replay, ${m.labelled} labelled, ${m.unlabelled} with no label, ${m.unlabelledWithFalseAlarm} of those raised a false alarm`,
  );
  if (detail.labelsNotInReplay.length > 0) {
    console.log(`Labelled trigger messages not in the replay (counted as missed): ${detail.labelsNotInReplay.join(", ")}`);
  }
  if (detail.falseAlarms.length > 0) {
    console.log("\nfalse alarms");
    for (const i of detail.falseAlarms) console.log(`  ${i.key}  (${i.triggers.join("+")})`);
  }
  if (detail.repeats.length > 0) {
    console.log("\nrepeats of a caught incident (not counted)");
    for (const i of detail.repeats) console.log(`  ${i.key}  (${i.triggers.join("+")})`);
  }

  await writeFile(evalPath("results.json"), JSON.stringify(results, null, 2) + "\n");
  await writeFile(evalPath("results.detail.json"), JSON.stringify(detail, null, 2) + "\n");
  console.log("\nWrote eval/results.json and eval/results.detail.json");
}

await main();
