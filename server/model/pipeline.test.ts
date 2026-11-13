import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, GoldenReplay, Scene } from "@site/contracts";
import { W12_BEFORE, fixtureExtractResults, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";

// End to end: the ghost-wall story through extract (cached), model, checks and fixes.

vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessage) =>
    fixtureExtractResults.find((r) => r.messageId === message.id) ?? { messageId: message.id, operations: [], intents: [] },
}));

const { runReplay } = await import("./replay");

/** The floor before rev C: W-12 at its old line, no plan yet. */
const startScene: Scene = {
  ...fixtureScene,
  time: "2026-11-10T08:00:00",
  tasks: [],
  elements: fixtureScene.elements.map((e) =>
    e.id === "W-12" ? { ...e, geometry: W12_BEFORE, version: 1, history: e.history.slice(0, 1) } : e,
  ),
};

const replay: GoldenReplay = {
  id: "fixture",
  events: fixtureMessages.map((message) => ({ kind: "message" as const, message })),
};

describe("pipeline", () => {
  it("shows the ghost wall when plumbing plans from the old W-12 line", async () => {
    const state = await runReplay(replay, startScene);
    const w12 = state.scene.elements.find((e) => e.id === "W-12");
    expect(w12?.version).toBe(2);

    const ghost = state.findings.find((f) => f.check === "latest_change");
    expect(ghost?.sourceMessageId).toBe("m-002");
    expect(ghost?.evidenceMessageIds).toEqual(["m-001"]);
    expect(ghost?.ghost?.geometry).toEqual(W12_BEFORE);
    expect(ghost?.ghost?.label).toBe("0.4 m east");

    const fix = state.fixes.find((f) => f.findingId === ghost?.id);
    expect(fix?.kind).toBe("notify_crew");
    expect(fix?.messages[0]?.text.startsWith("HOLD")).toBe(true);
  });

  it("stops before the plumbing message when replayed to Thursday", async () => {
    const state = await runReplay(replay, startScene, "2026-11-12T23:59:00");
    expect(state.findings).toEqual([]);
  });
});
