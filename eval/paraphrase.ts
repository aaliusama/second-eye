import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath, evalPath } from "../server/paths";
import { REPO_ROOT } from "../server/paths";
import { loadStartScene } from "../server/model/load";
import { extract, extractBatch } from "../server/extract/index";
import { applyOperations, getPlan } from "../server/model/index";
import { runChecks } from "../server/checks/index";
import * as learning from "../server/learning/index";

interface Case {
  id: string;
  crewId: string;
  time: string;
  thread: string;
  senderName: string;
  senderRole: "crew_lead";
  text: string;
  expected: "latest_change" | "no_intent";
  reason: string;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch {
    // No local .env: environment variables may still be supplied by the caller.
  }
  const raw = JSON.parse(await readFile(dataPath("paraphrase-eval.json"), "utf8")) as { cases: Case[] };
  if (!process.env.GROQ_API_KEY) {
    await writeFile(evalPath("paraphrase-results.json"), JSON.stringify({ status: "unavailable", casesScored: 0, reason: "GROQ_API_KEY is missing" }, null, 2) + "\n");
    console.log("Paraphrase evaluation unavailable: set GROQ_API_KEY to run uncached live extraction. No cases were scored.");
    return;
  }

  const initial = await loadStartScene();
  const revision = await extract(
    { id: "m-001", time: "2026-11-12T14:02:00", thread: "office", senderName: "Architect", senderRole: "architect", text: "Updated sheet A-201 attached: W-12 moves 40 cm east", kind: "text" },
    learning.getContext(),
    initial,
  );
  const scene = applyOperations(initial, revision.operations);
  const out: { id: string; expected: string; observed: string; pass: boolean; operations: number; intents: number; findings: string[]; reason: string }[] = [];
  for (const test of raw.cases) {
    const message = {
      id: `eval-${test.id.toLowerCase()}`,
      time: test.time,
      thread: test.thread,
      senderName: test.senderName,
      senderRole: test.senderRole,
      crewId: test.crewId,
      text: test.text,
      kind: "text" as const,
    };
    // Call the uncached live batch API directly: this harness never reads or writes the golden cache.
    let extracted;
    try {
      [extracted] = await extractBatch([message], scene);
    } catch (error) {
      const unavailable = {
        note: "Simulated site data. No accuracy score: the live extraction request failed before this case could be evaluated.",
        status: "unavailable",
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
        case: test.id,
        casesScored: out.length,
        error: String(error),
      };
      await import("node:fs/promises").then(({ writeFile }) => writeFile(evalPath("paraphrase-results.json"), JSON.stringify(unavailable, null, 2) + "\n"));
      console.log(`Paraphrase evaluation unavailable at ${test.id}: live extraction failed. No accuracy score was produced.`);
      return;
    }
    const result = extracted!.result;
    const caseScene = applyOperations(scene, result.operations);
    const findings = result.intents.flatMap((intent) => runChecks(caseScene, getPlan(caseScene, intent.day), intent));
    const observed = findings.some((finding) => finding.check === "latest_change")
      ? "latest_change"
      : result.intents.length > 0 || result.operations.some((operation) => operation.type === "plan_task")
        ? "other_intent"
        : "no_intent";
    out.push({ id: test.id, expected: test.expected, observed, pass: observed === test.expected, operations: result.operations.length, intents: result.intents.length, findings: findings.map((finding) => finding.check), reason: test.reason });
  }
  const summary = {
    note: "Simulated site data. Separate development challenge set; not a blind holdout or field-performance estimate. Cases are not cache backed.",
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    cases: out.length,
    passed: out.filter((test) => test.pass).length,
    failed: out.filter((test) => !test.pass).length,
    falseIntents: out.filter((test) => test.expected === "no_intent" && test.observed !== "no_intent").length,
    results: out,
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(evalPath("paraphrase-results.json"), JSON.stringify(summary, null, 2) + "\n"));
  console.log(`\nUncached paraphrase evaluation (${summary.model}): ${summary.passed}/${summary.cases} passed, ${summary.failed} failed; ${summary.falseIntents} false intents.`);
  for (const test of out) console.log(`${test.pass ? "PASS" : "FAIL"} ${test.id}: expected ${test.expected}, observed ${test.observed} (${test.operations} operations, ${test.intents} intents${test.findings.length ? `, ${test.findings.join(",")}` : ""})`);
  console.log("Wrote eval/paraphrase-results.json");
}

await main();
