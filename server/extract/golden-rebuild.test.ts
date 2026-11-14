import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ExtractResult, type Scene } from "@site/contracts";
import { applyOperations } from "../model/index";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { dataPath } from "../paths";
import { MessageFacts } from "./facts";
import { toResult } from "./result";

// Guard for every rule change in result.ts: rebuilding each stored golden extraction from its raw
// LLM facts must give exactly the stored result. The demo and the golden evaluation read the stored
// results, so a rule that would change any of them must show up here first.
describe("golden extractions rebuild unchanged under the current rules", () => {
  it("every cached message with raw facts", async () => {
    const replay = await loadGoldenReplay();
    let scene: Scene = await loadStartScene();
    const changed: string[] = [];
    let checked = 0;
    for (const e of replay.events) {
      if (e.kind !== "message") continue;
      let entry: (ExtractResult & { facts?: unknown }) | undefined;
      try {
        entry = JSON.parse(await readFile(dataPath("llm-cache", `${e.message.id}.json`), "utf8"));
      } catch {
        continue;
      }
      const stored = ExtractResult.parse(entry);
      if (entry!.facts) {
        checked++;
        const rebuilt = toResult(e.message, MessageFacts.parse(entry!.facts), scene);
        if (JSON.stringify(rebuilt) !== JSON.stringify(stored)) changed.push(e.message.id);
      }
      scene = applyOperations(scene, stored.operations);
    }
    expect(checked).toBeGreaterThan(100);
    expect(changed).toEqual([]);
  });
});
