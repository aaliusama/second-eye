import { describe, expect, it } from "vitest";
import type { Finding, Fix, IncidentReceipt } from "@site/contracts";
import { fixtureFinding, fixtureFix, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import { sampleClearance } from "./fixtures/laneSamples";
import { traceOf } from "./howDecided";

const rule = { id: "latest_change.unheard_geometry", statement: "A crew's planned work touches an element whose latest position was said in a thread that crew does not read." };
const finding: Finding = { ...fixtureFinding, rule };
const receipt = (status: IncidentReceipt["status"]): IncidentReceipt => ({
  fixId: fixtureFix.id, findingId: finding.id, summary: "", sourceMessageId: "m-002", evidenceMessageIds: ["m-001"], sentAt: "2026-11-13T18:00:00",
  revisions: [], crews: [{ crewId: "crew-plumbing", crewName: "Novak Plumbing", sentMessageId: "sent-1" }], status,
});

describe("how it decided", () => {
  it("traces the ghost wall from the messages to the rule, with the extracted facts and their confidence", () => {
    const t = traceOf(finding, fixtureScene, fixtureMessages, [fixtureFix], []);
    expect(t.messages.map((m) => [m.role, m.source.id, m.source.who])).toEqual([
      ["trigger", "m-002", "Marek"],
      ["evidence", "m-001", "Lena Hofer"],
    ]);
    expect(t.messages[0].facts).toEqual([{ kind: "task", text: "Novak Plumbing plans rough in plumbing in Unit 204, Sat morning", confidence: 0.88, used: true }]);
    expect(t.messages[1].facts).toEqual([{ kind: "change", text: "Unit 204 bathroom east wall moved 0.4 m east (version 2)", confidence: 0.92, used: true }]);
    expect(t.rule).toEqual(rule);
    expect(t.finding.offset).toBe("0.4 m east");
    expect(t.finding.numbers).toEqual([]);
  });

  it("says not found instead of inventing a fact or a rule", () => {
    const bare: Finding = { ...fixtureFinding, sourceMessageId: "m-999", evidenceMessageIds: [] };
    const t = traceOf(bare, fixtureScene, fixtureMessages, [], undefined);
    expect(t.messages[0].source.who).toBe("Not found in the record");
    expect(t.messages[0].facts).toEqual([]);
    expect(t.rule).toBeUndefined();
    expect(t.fixes).toEqual([]);
  });

  it("shows measured numbers when lane B sends them", () => {
    const t = traceOf({ ...finding, measure: { clearance: sampleClearance } }, fixtureScene, fixtureMessages, [], []);
    expect(t.finding.numbers).toEqual(["Face offset 0.40 m east, tolerance 0.10 m: work on the face they believe in leaves a gap beyond tolerance"]);
    expect(t.finding.note).toBe(sampleClearance.text);
  });

  it("never words a sent correction as confirmed", () => {
    const sent: Fix = { ...fixtureFix, status: "approved" };
    const status = (fixes: Fix[], receipts?: IncidentReceipt[]) => traceOf(finding, fixtureScene, fixtureMessages, fixes, receipts).fixes[0]?.status;
    expect(status([fixtureFix], [])).toBe("pending");
    expect(status([sent], undefined)).toBe("waiting");
    expect(status([sent], [receipt("awaiting_confirmation")])).toBe("waiting");
    expect(status([sent], [receipt("confirmed")])).toBe("confirmed");
    expect(status([sent], [receipt("superseded")])).toBe("superseded");
    expect(traceOf(finding, fixtureScene, fixtureMessages, [sent], []).fixes[0].words).toContain("Sent is not confirmed");
  });
});
