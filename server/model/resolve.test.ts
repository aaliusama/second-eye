import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, ExtractResult, GoldenReplay, Operation, Scene } from "@site/contracts";
import { W12_AFTER, W12_BEFORE, fixtureExtractResults, fixtureMessages, fixtureScene, fixtureTask } from "@site/contracts/fixtures";

// Live findings a later message fixed: the finding and its pending fix leave the active lists.

const FRI = (clock: string) => `2026-11-13T${clock}`;
const msg = (id: string, time: string, thread: string, text: string): ChatMessage => ({
  id,
  time,
  thread,
  senderName: "Marek (Novak Plumbing)",
  senderRole: "crew_lead",
  crewId: "crew-plumbing",
  text,
  kind: "text",
});
const op = (id: string, time: string, thread: string, extra: Record<string, unknown>) =>
  ({ id, time, sourceMessageId: id.replace("op-", "m-"), thread, confidence: 0.9, ...extra }) as Operation;

/** m-003: the W-12 change re-posted in the site group, which plumbing reads. */
const heard = msg("m-003", FRI("18:30:00"), "site-group", "ok saw rev C, W-12 40cm east, we work to the new line");
/** m-004: chatter that changes nothing. */
const chatter = msg("m-004", FRI("18:45:00"), "site-group", "running late tomorrow, 7:15");
/** m-005: plumbing cancels the rough-in. */
const cancel = msg("m-005", FRI("19:00:00"), "site-group", "rough in 204 is off for tomorrow");

const extra: ExtractResult[] = [
  { messageId: "m-003", operations: [op("op-003", heard.time, "site-group", { type: "move", elementId: "W-12", to: W12_AFTER })], intents: [] },
  { messageId: "m-004", operations: [], intents: [] },
  {
    messageId: "m-005",
    operations: [op("op-005", cancel.time, "site-group", { type: "plan_task", task: { ...fixtureTask, status: "cancelled" } })],
    intents: [],
  },
];

vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessage) =>
    [...fixtureExtractResults, ...extra].find((r) => r.messageId === message.id) ?? { messageId: message.id, operations: [], intents: [] },
}));
vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const { runReplay } = await import("./replay");
const { resolveLiveFindings } = await import("./resolve");
const { applyOperations } = await import("./index");

const start: Scene = {
  ...fixtureScene,
  time: "2026-11-10T08:00:00",
  tasks: [],
  elements: fixtureScene.elements.map((e) =>
    e.id === "W-12" ? { ...e, geometry: W12_BEFORE, version: 1, history: e.history.slice(0, 1) } : e,
  ),
};
const replayOf = (...later: ChatMessage[]): GoldenReplay => ({
  id: "fixture",
  events: [...fixtureMessages, ...later].map((message) => ({ kind: "message" as const, message })),
});
const GHOST = "f-latest_change-m-002-W-12";

describe("live findings resolved by a later message", () => {
  it("not fixed: the finding and its pending fix stay", async () => {
    const s = await runReplay(replayOf(chatter), structuredClone(start));
    expect(s.findings.map((f) => f.id)).toContain(GHOST);
    expect(s.fixes.some((x) => x.findingId === GHOST)).toBe(true);
    expect(s.resolvedFindings).toEqual([]);
  });

  it("the crew hears the change in a thread they read: finding gone, fix gone, kept as resolved", async () => {
    const s = await runReplay(replayOf(heard, chatter), structuredClone(start));
    expect(s.findings.map((f) => f.id)).not.toContain(GHOST);
    expect(s.fixes.some((x) => x.findingId === GHOST)).toBe(false);
    expect(s.resolvedFindings.map((f) => f.id)).toEqual([GHOST]);
    expect(s.resolvedFixes.map((x) => x.findingId)).toEqual([GHOST]);
    expect(s.liveIntents[GHOST]).toBeUndefined();
  });

  it("the crew's task is cancelled: finding gone", async () => {
    const s = await runReplay(replayOf(cancel), structuredClone(start));
    expect(s.findings.map((f) => f.id)).not.toContain(GHOST);
    expect(s.fixes).toEqual([]);
  });

  it("logs one finding.resolved line naming the message", async () => {
    const write = vi.mocked(process.stdout.write);
    write.mockClear();
    await runReplay(replayOf(heard), structuredClone(start));
    const lines = write.mock.calls.map((c) => JSON.parse(String(c[0]))).filter((l) => l.kind === "finding.resolved");
    expect(lines).toEqual([{ kind: "finding.resolved", findingId: GHOST, byMessageId: "m-003", fixIds: [expect.any(String)] }]);
  });

  it("an approved fix is untouched: its finding stays", async () => {
    const s = await runReplay(replayOf(), structuredClone(start));
    const fix = s.fixes.find((x) => x.findingId === GHOST)!;
    fix.status = "approved";
    s.scene = applyOperations(s.scene, extra[0]!.operations);
    expect(resolveLiveFindings(s, "m-003")).toEqual([]);
    expect(s.findings.map((f) => f.id)).toContain(GHOST);
    expect(s.fixes).toContain(fix);
    expect(fix.status).toBe("approved");
  });

  it("is deterministic: same replay, same state", async () => {
    const a = await runReplay(replayOf(heard, chatter, cancel), structuredClone(start));
    const b = await runReplay(replayOf(heard, chatter, cancel), structuredClone(start));
    expect(a).toEqual(b);
  });
});
