import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AcknowledgeFixResponse, AcknowledgementsResponse, DismissalsResponse, PostMessageResponse, SheetRevisionResponse, StateResponse } from "@site/contracts";
import { handle } from "./index";
import { configureDismissals } from "../learning/dismissals";

const server = createServer((req, res) => void handle(req, res));
let base: string;
beforeAll(async () => {
  process.env.LIVE_LLM = "0";
  configureDismissals(undefined);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
const get = async (path: string) => {
  const response = await fetch(`${base}${path}`);
  expect(response.status).toBe(200);
  return response.json();
};
const post = async (path: string, body: unknown) => {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
};

it("keeps dispatch held, records a crew reply, and preserves an idempotent receipt", async () => {
  await post("/api/reset", { keepLearning: false });
  const state = StateResponse.parse(await get("/api/state"));
  const finding = state.findings.find((f) => f.ghost?.elementId === "W-12")!;
  const fix = state.fixes.find((f) => f.findingId === finding.id)!;
  await post(`/api/fixes/${fix.id}/approve`, {});
  const waiting = AcknowledgementsResponse.parse(await get("/api/acknowledgements"));
  expect(waiting.receipts.find((r) => r.fixId === fix.id)?.status).toBe("awaiting_confirmation");
  expect(StateResponse.parse(await get("/api/state")).findings.some((f) => f.id === finding.id)).toBe(true);
  const reply = AcknowledgeFixResponse.parse(await post(`/api/fixes/${fix.id}/acknowledge`, { crewId: "crew-plumbing" }));
  expect(reply.receipt.status).toBe("confirmed");
  const repeat = AcknowledgeFixResponse.parse(await post(`/api/fixes/${fix.id}/acknowledge`, { crewId: "crew-plumbing" }));
  expect(repeat.sourceMessageId).toBe(reply.sourceMessageId);
  expect(StateResponse.parse(await get("/api/state")).findings.some((f) => f.id === finding.id)).toBe(false);
});

it("compares uncached explicit sheet text without live extraction", async () => {
  await post("/api/reset", { keepLearning: false });
  const issue = PostMessageResponse.parse(await post("/api/message", { text: "Issued A-201 rev C", senderRole: "architect", senderName: "Test architect", thread: "office", kind: "text" }));
  const claim = PostMessageResponse.parse(await post("/api/message", { text: "We're on A-201 rev B", senderRole: "crew_lead", senderName: "Test plumber", crewId: "crew-plumbing", thread: "site-group", kind: "text" }));
  const result = SheetRevisionResponse.parse(await get("/api/sheets"));
  const sheet = result.sheets.find((s) => s.sheetId === "A-201")!;
  expect(sheet.latest?.sourceMessageId).toBe(issue.message.id);
  expect(sheet.claims.find((c) => c.sourceMessageId === claim.message.id)?.status).toBe("different_revision");
});

it("retains a review on replay, supports undo, and never removes the safety finding", async () => {
  await post("/api/reset", { keepLearning: false });
  const state = StateResponse.parse(await get("/api/state"));
  const finding = state.findings[0]!;
  await post("/api/dismissals", { findingId: finding.id, reason: "Reviewed this exact record with the supervisor" });
  const memory = DismissalsResponse.parse(await get("/api/dismissals"));
  expect(memory.matches.some((m) => m.findingId === finding.id)).toBe(true);
  expect(StateResponse.parse(await get("/api/state")).findings.some((f) => f.id === finding.id)).toBe(true);
  await post("/api/reset", { keepLearning: true });
  expect(DismissalsResponse.parse(await get("/api/dismissals")).rules.some((r) => r.active)).toBe(true);
  await post(`/api/dismissals/${memory.rules[0]!.id}/undo`, {});
  expect(DismissalsResponse.parse(await get("/api/dismissals")).matches).toHaveLength(0);
  await post("/api/reset", { keepLearning: false });
  expect(DismissalsResponse.parse(await get("/api/dismissals")).rules).toHaveLength(0);
});
