import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@site/contracts";
import { sheetRevisions } from "./index";

function msg(id: string, text: string, office = false, time = `2026-11-13T17:0${id}:00`): ChatMessage {
  return { id, text, time, senderName: office ? "Architect" : "Plumber", senderRole: office ? "architect" : "crew_lead", thread: office ? "office" : "site-group", kind: "text", ...(office ? {} : { crewId: "crew-plumbing" }) };
}
describe("explicit sheet revision record", () => {
  it("compares crew text with an issued revision and keeps both sources", () => {
    const result = sheetRevisions([msg("1", "Issued A-201 rev C", true), msg("2", "We're on A-201 rev B")]);
    expect(result.sheets[0]?.claims[0]?.status).toBe("different_revision");
    expect(result.sheets[0]?.sourceMessageIds).toEqual(["1", "2"]);
  });
  it("replaces a crew statement without treating an office dispatch as a crew claim", () => {
    const result = sheetRevisions([msg("1", "Issued A-201 rev C", true), msg("2", "We're on A-201 rev B"), msg("3", "We're using A-201 rev C")]);
    expect(result.sheets[0]?.claims).toHaveLength(1);
    expect(result.sheets[0]?.claims[0]?.status).toBe("matches_record");
  });
  it("does not infer revision from attachment mentions or unauthorized issuance", () => {
    expect(sheetRevisions([msg("1", "Updated sheet A-201 attached", true)]).sheets).toEqual([]);
    expect(sheetRevisions([msg("1", "Issued A-201 rev C"), msg("2", "We're on A-201 rev B")]).sheets[0]?.claims[0]?.status).toBe("unknown");
  });
  it("uses recorded issuance order rather than lexical revision order", () => {
    const result = sheetRevisions([msg("1", "Issued A-201 rev Z", true), msg("2", "Issued A-201 rev A", true)]);
    expect(result.sheets[0]?.latest?.revision).toBe("A");
  });
  it("leaves withdrawn and conflicting office records unknown", () => {
    expect(sheetRevisions([msg("1", "Issued A-201 rev C", true), msg("2", "A-201 rev C withdrawn", true)]).sheets[0]?.latest).toBeUndefined();
    expect(sheetRevisions([msg("1", "Issued A-201 rev B", true, "2026-11-13T17:00:00"), msg("2", "Issued A-201 rev C", true, "2026-11-13T17:00:00")]).sheets[0]?.latest).toBeUndefined();
  });
  it("does not promote a tentative or questioned revision", () => {
    expect(sheetRevisions([msg("1", "Is A-201 rev C current?", true)]).sheets[0]?.latest).toBeUndefined();
    const result = sheetRevisions([msg("1", "Issued A-201 rev C", true), msg("2", "We're using A-201 rev B or A-201 rev C")]);
    expect(result.sheets[0]?.claims[0]?.status).toBe("unknown");
  });
  it("does not treat negated crew wording as confirmed use", () => {
    const result = sheetRevisions([msg("1", "Issued A-201 rev C", true), msg("2", "We are not using A-201 rev C")]);
    expect(result.sheets[0]?.claims[0]?.status).toBe("unknown");
  });
  it("keeps a simultaneous issuance conflict unknown despite another same-time message", () => {
    const result = sheetRevisions([msg("1", "Issued A-201 rev B", true, "2026-11-13T17:00:00"), msg("2", "Issued A-201 rev C", true, "2026-11-13T17:00:00"), msg("3", "Issued A-201 rev C", true, "2026-11-13T17:00:00")]);
    expect(result.sheets[0]?.latest).toBeUndefined();
  });
  it("does not promote future issuance and ignores system posts", () => {
    const system = { ...msg("2", "Issued A-201 rev Z", true), senderRole: "system" as const };
    const result = sheetRevisions([msg("1", "Issued A-201 rev B", true), system, msg("3", "A-201 rev C will be issued tomorrow", true)]);
    expect(result.sheets[0]?.latest?.revision).toBe("B");
  });
  it("sorts messages by recorded time before identifying the latest issuance", () => {
    const result = sheetRevisions([msg("2", "Issued A-201 rev C", true), msg("1", "Issued A-201 rev B", true)]);
    expect(result.sheets[0]?.latest?.revision).toBe("C");
  });
});
