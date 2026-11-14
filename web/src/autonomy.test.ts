import { describe, expect, it } from "vitest";
import type { ChatMessage, Finding, Fix, IncidentReceipt } from "@site/contracts";
import type { AgentLogEntry } from "./api";
import { buildChains, type ChainInput } from "./autonomyChain";

const finding = (id: string, check: Finding["check"], time: string, ghost?: string): Finding => ({
  id, check, trigger: "live", severity: "hold", time, sourceMessageId: `src-${id}`, evidenceMessageIds: [`ev-${id}`],
  crewIds: ["crew-plumbing"], elementIds: ["W-12"], taskIds: [], summary: `Per the record, ${id}.`,
  ...(ghost ? { ghost: { elementId: "W-12", geometry: { kind: "segment", from: [0, 0], to: [0, 1], thickness: 0.1 }, label: ghost } } : {}),
});
const fix = (findingId: string, status: Fix["status"]): Fix => ({
  id: `fix-${findingId}`, findingId, kind: "notify_crew", description: "Send the new line.", status, sourceMessageId: "m-1",
  messages: [{ crewId: "crew-plumbing", text: "HOLD: wall moved." }],
});
const escalate = (findingId: string, time: string): AgentLogEntry => ({
  time,
  actions: [{ kind: "escalate", id: `esc-${findingId}`, findingId, urgency: "tonight", text: `HOLD needs your decision: Per the record, ${findingId}. Proposed: Send the new line.`, sourceMessageIds: [`src-${findingId}`] } as AgentLogEntry["actions"][number]],
  queued: [],
});
const sent = (findingId: string, time: string): ChatMessage =>
  ({ id: `sent-fix-${findingId}-crew-plumbing`, time, thread: "dm:crew-plumbing", senderName: "Second Eye", senderRole: "system", crewId: "crew-plumbing", text: "HOLD: wall moved.", kind: "text" }) as ChatMessage;

const base = (over: Partial<ChainInput>): ChainInput => ({
  log: [], findings: [], fixes: [], receipts: [], messages: [], crewName: (id) => (id === "crew-plumbing" ? "Novak Plumbing" : id), elementName: () => "Unit 204 bathroom east wall", ...over,
});

describe("buildChains", () => {
  it("draws only the steps the record shows: noticed, brought to you; no approval while the fix is pending", () => {
    const f = finding("f-a", "space_clash", "2026-11-12T16:00:00");
    const [c] = buildChains(base({ log: [escalate("f-a", "2026-11-12T16:05:00")], findings: [f], fixes: [fix("f-a", "pending")] }));
    expect(c!.steps.map((s) => s.kind)).toEqual(["noticed", "brought"]);
    expect(c!.steps[1]!.text).toBe("Proposed: Send the new line.");
    expect(c!.status).toBe("needs_you");
  });

  it("adds approved, sent and waiting from the fix and receipt; confirmed only when acknowledged", () => {
    const f = finding("f-b", "latest_change", "2026-11-13T17:40:00", "0.4 m east");
    const receipt: IncidentReceipt = {
      fixId: "fix-f-b", findingId: "f-b", summary: "", sourceMessageId: "m-1", evidenceMessageIds: [], sentAt: "2026-11-13T20:00:00",
      revisions: [], crews: [{ crewId: "crew-plumbing", crewName: "Novak Plumbing", sentMessageId: "sent-fix-f-b-crew-plumbing" }], status: "awaiting_confirmation",
    };
    const input = base({ log: [escalate("f-b", "2026-11-13T17:40:00")], findings: [f], fixes: [fix("f-b", "approved")], messages: [sent("f-b", "2026-11-13T20:00:00")], receipts: [receipt] });
    const [waiting] = buildChains(input);
    expect(waiting!.steps.map((s) => s.kind)).toEqual(["noticed", "brought", "approved", "sent", "waiting"]);
    expect(waiting!.steps[2]!.time).toBe("2026-11-13T20:00:00");
    expect(waiting!.status).toBe("waiting_crew");

    const acked = { ...receipt, status: "confirmed" as const, crews: [{ ...receipt.crews[0]!, acknowledgedAt: "2026-11-13T20:10:00", acknowledgedMessageId: "ack-1" }] };
    const [done] = buildChains({ ...input, receipts: [acked] });
    expect(done!.steps.at(-1)).toMatchObject({ kind: "confirmed", time: "2026-11-13T20:10:00", sourceIds: ["ack-1"] });
    expect(done!.status).toBe("confirmed");
  });

  it("puts the latest latest-change ghost risk first and respects the replay time", () => {
    const old = finding("f-old", "latest_change", "2026-11-12T16:10:00", "0.3 m north");
    const ghost = finding("f-ghost", "latest_change", "2026-11-13T17:40:00", "0.4 m east");
    const clash = finding("f-clash", "space_clash", "2026-11-13T18:00:00");
    const log = [escalate("f-old", "2026-11-12T16:10:00"), escalate("f-ghost", "2026-11-13T17:40:00"), escalate("f-clash", "2026-11-13T18:00:00")];
    const chains = buildChains(base({ log, findings: [old, ghost, clash] }));
    expect(chains.map((c) => c.findingId)).toEqual(["f-ghost", "f-clash", "f-old"]);
    expect(chains[0]!.lead).toBe(true);
    expect(buildChains(base({ log, findings: [old, ghost, clash], asOf: "2026-11-12T23:00:00" })).map((c) => c.findingId)).toEqual(["f-old"]);
  });

  it("says not found when an action names a finding missing from the record", () => {
    const [c] = buildChains(base({ log: [escalate("f-gone", "2026-11-12T17:45:00")] }));
    expect(c!.findingFound).toBe(false);
    expect(c!.title).toMatch(/not found/);
  });
});
