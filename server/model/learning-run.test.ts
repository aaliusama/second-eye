import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ExtractResult, GoldenReplay, Scene } from "@site/contracts";
import { W12_BEFORE, fixtureExtractResults, fixtureIntent, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import * as learning from "../learning/index";

// Run 1 vs run 2: "the blue room" is unknown, the superintendent maps it, the next run knows it.
// Own scene (no nicknames), not data/floor.json.

const blue: ChatMessage = {
  id: "m-blue",
  time: "2026-11-13T18:10:00",
  thread: "site-group",
  senderName: "Tom (Walsh Drywall)",
  senderRole: "crew_lead",
  crewId: "crew-drywall",
  text: "tomorrow morning we close up the blue room",
  kind: "text",
};

const { placeId: _drop, ...noPlace } = fixtureIntent;
const blueResult: ExtractResult = {
  messageId: "m-blue",
  operations: [],
  intents: [
    {
      ...noPlace,
      id: "intent-blue",
      crewId: "crew-drywall",
      time: blue.time,
      sourceMessageId: "m-blue",
      confidence: 0.6,
      taskType: "close_wall",
      description: "Close up the blue room",
      elementIds: [],
    },
  ],
};

vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessage) =>
    structuredClone(
      [...fixtureExtractResults, blueResult].find((r) => r.messageId === message.id) ?? {
        messageId: message.id,
        operations: [],
        intents: [],
      },
    ),
}));
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const { runReplay } = await import("./replay");

const start: Scene = {
  ...fixtureScene,
  time: "2026-11-10T08:00:00",
  tasks: [],
  elements: fixtureScene.elements.map((e) => ({
    ...e,
    aliases: [],
    ...(e.id === "W-12" ? { geometry: W12_BEFORE, version: 1, history: e.history.slice(0, 1) } : {}),
  })),
};

const replay: GoldenReplay = {
  id: "fixture-blue",
  events: [...fixtureMessages, blue].map((message) => ({ kind: "message" as const, message })),
};

afterEach(learning.reset);

describe("learning across runs", () => {
  it("run 1 cannot place the blue room; run 2 can, and the checks then see the work", async () => {
    const run1 = await runReplay(replay, learning.applyToScene(start));
    expect(run1.unresolved.map((u) => u.messageId)).toEqual(["m-blue"]);
    expect(run1.findings.filter((f) => f.sourceMessageId === "m-blue")).toEqual([]);

    learning.record({
      kind: "location_alias",
      id: "c-blue",
      time: "2026-11-13T18:20:00",
      sourceMessageId: "m-blue",
      alias: "the blue room",
      elementId: "room-204",
    });

    const run2 = await runReplay(replay, learning.applyToScene(start));
    expect(run2.unresolved).toEqual([]);
    const checks = run2.findings.filter((f) => f.sourceMessageId === "m-blue").map((f) => f.check);
    // Drywall closes 204 with no inspection on record, while plumbing is in 204 the same morning.
    expect(checks).toContain("order_of_work");
    expect(checks).toContain("space_clash");
  });
});
