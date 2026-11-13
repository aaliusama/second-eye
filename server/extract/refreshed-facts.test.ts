import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ExtractResult } from "@site/contracts";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { dataPath } from "../paths";
import { MessageFacts } from "./facts";
import { toResult } from "./result";

// Offline regression coverage of the two omissions found by the independent labelled evaluation.
// Read real cached LLM facts, not hand-written expected extraction, and rebuild by the normal rules.
async function rebuilt(id: string) {
  const [replay, scene, raw] = await Promise.all([
    loadGoldenReplay(), loadStartScene(), readFile(dataPath("llm-cache", `${id}.json`), "utf8"),
  ]);
  const entry = JSON.parse(raw);
  expect(entry.provenance).toMatch(/^llm: groq /);
  const event = replay.events.find((e) => e.kind === "message" && e.message.id === id);
  if (!event || event.kind !== "message") throw new Error(`Missing source message ${id}`);
  const facts = MessageFacts.parse(entry.facts);
  const result = toResult(event.message, facts, scene);
  expect(ExtractResult.parse(entry)).toEqual(result);
  return result;
}

describe("refreshed proposal and crew assignment facts", () => {
  it("keeps an owner-signoff fixture suggestion as a sourced proposal", async () => {
    const result = await rebuilt("m-043");
    expect(result.operations).toContainEqual(expect.objectContaining({
      type: "set_status", sourceMessageId: "m-043", elementId: "light-202-kitchen", state: "proposed",
    }));
  });

  it("keeps a lead's assignment to their own crew member as that crew's plan", async () => {
    const result = await rebuilt("m-177");
    expect(result.operations).toContainEqual(expect.objectContaining({
      type: "plan_task", sourceMessageId: "m-177",
      task: expect.objectContaining({ crewId: "crew-drywall", day: "2026-11-14", slot: "afternoon", taskType: "layout", placeId: "room-201" }),
    }));
    expect(result.intents).toContainEqual(expect.objectContaining({
      crewId: "crew-drywall", sourceMessageId: "m-177", placeId: "room-201", taskType: "layout",
    }));
  });
});
