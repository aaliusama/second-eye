import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ExtractResult, GoldenReplay, Scene } from "@site/contracts";
import { W12_AFTER, W12_BEFORE, fixtureExtractResults, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";

// Live posts: a later message that fixes an open live finding takes it and its pending fix off the lists.

const ACK = "ok saw rev C, W-12 40cm east, we work to the new line";

vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessage): Promise<ExtractResult> => {
    const hit = fixtureExtractResults.find((r) => r.messageId === message.id);
    if (hit) return hit;
    if (message.text === ACK) {
      return {
        messageId: message.id,
        operations: [
          { id: `op-${message.id}-0`, type: "move", time: message.time, sourceMessageId: message.id, thread: "site-group", confidence: 0.9, elementId: "W-12", to: W12_AFTER },
        ],
        intents: [],
      };
    }
    return { messageId: message.id, operations: [], intents: [] };
  },
}));

const start: Scene = {
  ...fixtureScene,
  time: "2026-11-10T08:00:00",
  tasks: [],
  elements: fixtureScene.elements.map((e) =>
    e.id === "W-12" ? { ...e, geometry: W12_BEFORE, version: 1, history: e.history.slice(0, 1) } : e,
  ),
};
const replay: GoldenReplay = { id: "fixture", events: fixtureMessages.map((message) => ({ kind: "message" as const, message })) };

vi.mock("../model/load", () => ({
  loadStartScene: async () => structuredClone(start),
  loadGoldenReplay: async () => structuredClone(replay),
}));
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const { approveFix, getSession, postMessage, resetSession } = await import("./session");

const GHOST = "f-latest_change-m-002-W-12";
const post = (text: string) =>
  postMessage({ thread: "site-group", senderName: "Marek (Novak Plumbing)", senderRole: "crew_lead", crewId: "crew-plumbing", text, kind: "text" });

beforeEach(() => resetSession({ keepLearning: false }));
afterEach(() => resetSession({ keepLearning: false }));

describe("session: live findings resolved by a later post", () => {
  it("not fixed: a post that changes nothing keeps the finding and its fix", async () => {
    await post("running late tomorrow, 7:15");
    const s = await getSession();
    expect(s.findings.map((f) => f.id)).toContain(GHOST);
    expect(s.fixes.some((x) => x.findingId === GHOST && x.status === "pending")).toBe(true);
  });

  it("fixed: the crew hears the change, the finding and its pending fix leave; the agent still says CLEAR", async () => {
    await post(ACK);
    const s = await getSession();
    expect(s.findings.map((f) => f.id)).not.toContain(GHOST);
    expect(s.fixes.some((x) => x.findingId === GHOST)).toBe(false);
    expect(s.resolvedFindings.map((f) => f.id)).toEqual([GHOST]);
    expect(s.messages.some((m) => m.id === `agent-clr~${GHOST}~crew-plumbing`)).toBe(true);
  });

  it("an approved fix and its sent DMs are untouched by a later post", async () => {
    const fix = (await getSession()).fixes.find((x) => x.findingId === GHOST)!;
    const { sent } = await approveFix(fix.id);
    await post(ACK);
    const s = await getSession();
    expect(s.fixes.find((x) => x.id === fix.id)?.status).toBe("approved");
    expect(s.findings.map((f) => f.id)).toContain(GHOST);
    for (const m of sent) expect(s.messages.some((x) => x.id === m.id)).toBe(true);
  });
});
