import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, GoldenReplay, Scene } from "@site/contracts";
import { W12_BEFORE, fixtureExtractResults, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import * as learning from "../learning/index";

// GET /api/state?t= memo (state-at.ts) and the server warm-up, on the fixture floor (not data/).

let extractCalls = 0;

vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessage) => {
    extractCalls++;
    const hit = fixtureExtractResults.find((r) => r.messageId === message.id);
    return structuredClone(hit ?? { messageId: message.id, operations: [], intents: [] });
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
const fixtureReplay: GoldenReplay = {
  id: "fixture",
  events: [
    ...fixtureMessages.map((message) => ({ kind: "message" as const, message })),
    { kind: "rehearse" as const, time: "2026-11-13T20:00:00", day: "2026-11-14" },
  ],
};
let replay: GoldenReplay = fixtureReplay;

vi.mock("../model/load", () => ({
  loadStartScene: async () => structuredClone(start),
  loadGoldenReplay: async () => structuredClone(replay),
}));
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const { STATE_AT_MAX, clearStateAt, eventsUpTo, stateAt, stateAtSize } = await import("./state-at");
const { getSession, resetSession, warmUp } = await import("./session");
const { runReplay } = await import("../model/replay");

const alias = (name: string): Parameters<typeof learning.record>[0] => ({
  kind: "location_alias",
  id: `corr-alias-${name}`,
  time: "2026-11-13T18:00:00",
  sourceMessageId: "m-002",
  alias: name,
  elementId: "W-12",
});

beforeEach(() => {
  replay = fixtureReplay;
  learning.reset();
  clearStateAt();
  resetSession({ keepLearning: false });
  extractCalls = 0;
});
afterEach(() => {
  learning.reset();
  clearStateAt();
  resetSession({ keepLearning: false });
});

describe("stateAt (GET /api/state?t=)", () => {
  it("equals a fresh replay up to t", async () => {
    const t = "2026-11-12T16:00:00";
    const fresh = await runReplay(fixtureReplay, structuredClone(start), t);
    expect(JSON.stringify(await stateAt(t))).toBe(
      JSON.stringify({ t: fresh.t, scene: fresh.scene, findings: fresh.findings, fixes: fresh.fixes }),
    );
  });

  it("same t (or any t before the next event) is served from memory, identical", async () => {
    const a = await stateAt("2026-11-12T16:00:00");
    const calls = extractCalls;
    const b = await stateAt("2026-11-12T16:00:00");
    const c = await stateAt("2026-11-13T09:00:00"); // still only m-001 played
    expect(extractCalls).toBe(calls);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(c).toBe(a);
    expect(stateAtSize()).toBe(1);

    const d = await stateAt("2026-11-13T17:40:00"); // m-002 included
    expect(extractCalls).toBeGreaterThan(calls);
    expect(d.t).toBe("2026-11-13T17:40:00");
    expect(stateAtSize()).toBe(2);
  });

  it("concurrent requests for one t play the replay once", async () => {
    const [a, b] = await Promise.all([stateAt("2026-11-13T18:00:00"), stateAt("2026-11-13T18:00:00")]);
    expect(a).toBe(b);
    expect(extractCalls).toBe(2);
  });

  it("a stored correction or a learning reset invalidates it", async () => {
    const t = "2026-11-13T18:00:00";
    const before = await stateAt(t);
    expect(before.scene.elements.find((e) => e.id === "W-12")!.aliases).not.toContain("the blue room");

    learning.record(alias("the blue room"));
    const after = await stateAt(t);
    expect(after).not.toBe(before);
    expect(after.scene.elements.find((e) => e.id === "W-12")!.aliases).toContain("the blue room");
    expect(await stateAt(t)).toBe(after);

    learning.reset();
    const clean = await stateAt(t);
    expect(clean).not.toBe(after);
    expect(JSON.stringify(clean)).toBe(JSON.stringify(before));
  });

  it("clearStateAt empties it (POST /api/reset, POST /api/corrections)", async () => {
    await stateAt("2026-11-13T18:00:00");
    expect(stateAtSize()).toBe(1);
    clearStateAt();
    expect(stateAtSize()).toBe(0);
  });

  it(`keeps at most ${STATE_AT_MAX} entries, dropping the least recently used`, async () => {
    const minute = (i: number) => `2026-11-12T${String(8 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`;
    replay = {
      id: "many",
      events: Array.from({ length: STATE_AT_MAX + 5 }, (_, i) => ({
        kind: "message" as const,
        message: { ...fixtureMessages[0]!, id: `x-${i}`, time: minute(i) },
      })),
    };
    const first = await stateAt(minute(0));
    for (let i = 1; i < STATE_AT_MAX; i++) await stateAt(minute(i));
    expect(await stateAt(minute(0))).toBe(first); // touched: now most recent
    await stateAt(minute(STATE_AT_MAX)); // evicts minute(1)
    expect(stateAtSize()).toBe(STATE_AT_MAX);
    expect(await stateAt(minute(0))).toBe(first);
    const calls = extractCalls;
    await stateAt(minute(1));
    expect(extractCalls).toBeGreaterThan(calls);
  });

  it("eventsUpTo counts the events runReplay plays", () => {
    expect(eventsUpTo(fixtureReplay, "2026-11-01T00:00:00")).toBe(0);
    expect(eventsUpTo(fixtureReplay, "2026-11-12T14:02:00")).toBe(1);
    expect(eventsUpTo(fixtureReplay, "2026-11-13T19:59:59")).toBe(2);
    expect(eventsUpTo(fixtureReplay, "2026-11-20T00:00:00")).toBe(3);
  });
});

describe("warmUp", () => {
  it("requests during the warm-up await the same session; the replay plays once", async () => {
    const warming = warmUp();
    const [a, b] = await Promise.all([getSession(), getSession()]);
    await warming;
    expect(a).toBe(b);
    expect(await getSession()).toBe(a);
    expect(extractCalls).toBe(fixtureMessages.length);
  });
});
