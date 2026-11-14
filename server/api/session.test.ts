import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, GoldenReplay, Scene } from "@site/contracts";
import { W12_BEFORE, fixtureExtractResults, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import { getPlan } from "../model/index";
import { rehearse } from "../checks/index";
import { liveCacheId } from "./live-id";

// Session with the real checks on its own fixture floor (not data/).

const extractedIds: string[] = [];

vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessage) => {
    extractedIds.push(message.id);
    const src = fixtureMessages.find((m) => m.id === message.id || m.text === message.text);
    const hit = src && fixtureExtractResults.find((r) => r.messageId === src.id);
    if (!hit) return { messageId: message.id, operations: [], intents: [] };
    // Re-key to the requested id, like a cache entry stored under it.
    return JSON.parse(JSON.stringify(hit).replaceAll(`"${src.id}"`, `"${message.id}"`));
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
const replay: GoldenReplay = {
  id: "fixture",
  events: [
    ...fixtureMessages.map((message) => ({ kind: "message" as const, message })),
    { kind: "rehearse" as const, time: "2026-11-13T20:00:00", day: "2026-11-14" },
  ],
};

vi.mock("../model/load", () => ({
  loadStartScene: async () => structuredClone(start),
  loadGoldenReplay: async () => structuredClone(replay),
}));
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const { approveFix, acknowledgeFix, getAcknowledgements, getSession, postMessage, resetSession } = await import("./session");

beforeEach(() => {
  resetSession({ keepLearning: false });
  extractedIds.length = 0;
});
afterEach(() => resetSession({ keepLearning: false }));

const latestChangeIn = (scene: Scene) =>
  rehearse(scene, getPlan(scene, "2026-11-14")).frames.flatMap((f) => f.findings).filter((f) => f.check === "latest_change");

describe("session", () => {
  it("dispatch stays on hold until the crew acknowledges the sent revision", async () => {
    const s = await getSession();
    expect(latestChangeIn(s.scene)).toHaveLength(1);
    const fix = s.fixes.find((f) => f.findingId === "f-latest_change-m-002-W-12")!;
    expect(fix.kind).toBe("notify_crew");

    const { sent } = await approveFix(fix.id);
    expect(latestChangeIn((await getSession()).scene)).toHaveLength(1);
    expect((await getAcknowledgements())[0]!.status).toBe("awaiting_confirmation");
    const ack = await acknowledgeFix(fix.id, "crew-plumbing");
    expect(ack.receipt.status).toBe("confirmed");
    const after = await getSession();
    expect(latestChangeIn(after.scene)).toEqual([]);
    const last = after.scene.elements.find((e) => e.id === "W-12")!.history.at(-1)!;
    expect(last).toMatchObject({ operationType: "move", thread: "dm:crew-plumbing", sourceMessageId: ack.sourceMessageId, confidence: 1 });
    expect(after.messages.find((m) => m.id === ack.sourceMessageId)?.senderRole).toBe("crew_lead");
    expect(ack.sourceMessageId).not.toBe(sent[0]!.id);

    // Approving again changes nothing more.
    const version = after.scene.elements.find((e) => e.id === "W-12")!.version;
    await approveFix(fix.id);
    await acknowledgeFix(fix.id, "crew-plumbing");
    expect((await getSession()).scene.elements.find((e) => e.id === "W-12")!.version).toBe(version);
    expect(after.messages.filter((m) => m.id === ack.sourceMessageId)).toHaveLength(1);
  });

  it("rejects a late acknowledgement after a changed revision and a non-recipient crew", async () => {
    const s = await getSession();
    const fix = s.fixes.find((f) => f.findingId === "f-latest_change-m-002-W-12")!;
    await approveFix(fix.id);
    await expect(acknowledgeFix(fix.id, "crew-tiling")).rejects.toThrow("recipient");
    s.scene.elements.find((e) => e.id === "W-12")!.state = "proposed";
    await expect(acknowledgeFix(fix.id, "crew-plumbing")).rejects.toThrow("revision changed");
    expect((await getAcknowledgements())[0]!.status).toBe("superseded");
  });

  it("rejects an older receipt even when a new revision repeats the same geometry", async () => {
    const s = await getSession();
    const fix = s.fixes.find((f) => f.findingId === "f-latest_change-m-002-W-12")!;
    await approveFix(fix.id);
    const wall = s.scene.elements.find((e) => e.id === "W-12")!;
    wall.version++;
    wall.history.push({ ...wall.history.at(-1)!, version: wall.version, sourceMessageId: "new-revision", time: "2026-11-13T20:01:00" });
    await expect(acknowledgeFix(fix.id, "crew-plumbing")).rejects.toThrow("revision changed");
    expect(s.messages.some((m) => m.id.startsWith("ack-"))).toBe(false);
  });

  it("a live message reads the cache under its word-based id; a repeat gets -2 but the same cache entry", async () => {
    const body = {
      thread: "site-group",
      senderName: "Marek (Novak Plumbing)",
      senderRole: "crew_lead",
      crewId: "crew-plumbing",
      text: fixtureMessages[1]!.text,
      kind: "text",
    } as const;
    const cacheId = liveCacheId(body.text, body.crewId);
    await getSession();
    extractedIds.length = 0;

    const first = await postMessage(body);
    const second = await postMessage(body);
    expect(first.message.id).toBe(cacheId);
    expect(second.message.id).toBe(`${cacheId}-2`);
    expect(extractedIds).toEqual([cacheId, cacheId]);
    // Output is re-sourced to the message actually posted.
    expect(second.intents.every((i) => i.sourceMessageId === `${cacheId}-2`)).toBe(true);
    expect(second.findings.every((f) => f.sourceMessageId === `${cacheId}-2`)).toBe(true);
    expect(second.findings.map((f) => f.check)).toContain("latest_change");
  });

  it("approving a warning sends the confirmation request without confirming uncertain geometry", async () => {
    const s = await getSession();
    const wall = s.scene.elements.find((e) => e.id === "W-12")!;
    wall.history.at(-1)!.confidence = 0.4;
    const result = await postMessage({
      thread: "site-group", senderName: "Marek (Novak Plumbing)", senderRole: "crew_lead",
      crewId: "crew-plumbing", text: fixtureMessages[1]!.text, kind: "text",
    });
    const warning = result.findings.find((f) => f.check === "latest_change")!;
    expect(warning.severity).toBe("warn");
    const fix = result.fixes.find((f) => f.findingId === warning.id)!;
    expect(fix.kind).toBe("notify_crew");
    expect(fix.messages[0]!.text).toMatch(/^WARN:/);
    const before = structuredClone(wall);
    const { sent } = await approveFix(fix.id);
    expect(sent[0]!.text).toMatch(/^WARN:/);
    expect((await getSession()).scene.elements.find((e) => e.id === "W-12")).toEqual(before);
    expect(latestChangeIn((await getSession()).scene)[0]!.severity).toBe("warn");
  });
});
