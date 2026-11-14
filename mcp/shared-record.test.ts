import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { AcknowledgementsResponse, StateResponse, type Finding } from "@site/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../server/api/index";
import { configureDismissals } from "../server/learning/dismissals";
import { createSiteApi, type SiteApi } from "./api";
import { checkPlan, elementHistory, getFindings, getSiteState, isPlaceClear } from "./tools";

// One incident, three moments: before the correction is sent, after it is sent, after the crew confirms.
// The MCP tools talk to the real site API over HTTP (the server is only hosted here, never called directly),
// and every answer is compared with what the superintendent's screen reads from the same endpoints.
// Simulated site data, golden replay, cached extraction.

const GHOST_ID = "f-latest_change-m-002-W-12";
const DAY = "2026-11-14";
const PLAN = { crewId: "crew-plumbing", taskType: "rough_in_plumbing" as const, placeId: "room-204", day: DAY, slot: "morning" as const, elementIds: ["W-12"] };

const server = createServer((req, res) => void handle(req, res));
let base: string;
let api: SiteApi;

beforeAll(async () => {
  process.env.LIVE_LLM = "0";
  configureDismissals(undefined);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  api = createSiteApi(base);
  await post("/api/reset", { keepLearning: false });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`);
  expect(res.status, path).toBe(200);
  return res.json();
}
async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status, await res.clone().text()).toBe(200);
  return res.json();
}

/** What the UI reads: the live record plus the evening rehearsal, latest-change findings only. */
async function screenLatestChange(): Promise<Finding[]> {
  const state = StateResponse.parse(await get("/api/state"));
  const rehearsal = (await get(`/api/rehearsal?day=${DAY}`)) as { frames: { findings: Finding[] }[] };
  const all = [...state.findings, ...rehearsal.frames.flatMap((f) => f.findings)];
  return [...new Map(all.filter((f) => f.check === "latest_change").map((f) => [`${f.id}:${f.trigger}`, f])).values()];
}

const key = (f: { id: string; trigger: string }) => `${f.id}:${f.trigger}`;

async function agentAgreesWithScreen(): Promise<Finding[]> {
  const screen = await screenLatestChange();
  const agent = (await getFindings(api, { check: "latest_change" })).data.findings as Finding[];
  expect(agent.map(key).sort()).toEqual(screen.map(key).sort());
  for (const f of agent) {
    const s = screen.find((x) => key(x) === key(f))!;
    expect(f.sourceMessageId).toBe(s.sourceMessageId);
    expect(f.evidenceMessageIds).toEqual(s.evidenceMessageIds);
    expect(f.ghost).toEqual(s.ghost);
  }
  return agent;
}

describe("an agent sees the same incident as the superintendent", () => {
  let fixId: string;

  it("before send: HOLD with the same source, evidence and ghost as the screen", async () => {
    const agent = await agentAgreesWithScreen();
    const ghost = agent.find((f) => f.id === GHOST_ID);
    expect(ghost?.sourceMessageId).toBe("m-002");
    expect(ghost?.evidenceMessageIds).toContain("m-001");
    expect(ghost?.ghost?.label).toBe("0.4 m east");

    const place = await isPlaceClear(api, { placeId: "room-204", day: DAY, slot: "morning" });
    expect(place.data.status).toBe("hold");
    const touching = place.data.findings as { id: string; awaitingConfirmation: boolean }[];
    expect(touching.find((f) => f.id === GHOST_ID)?.awaitingConfirmation).toBe(false);

    const plan = await checkPlan(api, PLAN);
    expect(plan.data.verdict, plan.text).toBe("HOLD");

    // The change behind it is quoted with its sender, as on the Why beat.
    const history = await elementHistory(api, { elementId: "W-12" });
    expect((history.data.history as { sourceMessageId: string }[]).map((h) => h.sourceMessageId)).toContain("m-001");

  });

  it("after send: still HOLD, and the agent is told the correction awaits the crew", async () => {
    const fixes = (await get("/api/fixes")) as { fixes: { id: string; findingId: string; kind: string }[] };
    fixId = fixes.fixes.find((f) => f.findingId === GHOST_ID && f.kind === "notify_crew")!.id;
    await post(`/api/fixes/${encodeURIComponent(fixId)}/approve`, {});
    const receipts = AcknowledgementsResponse.parse(await get("/api/acknowledgements"));
    expect(receipts.receipts.find((r) => r.findingId === GHOST_ID)?.status).toBe("awaiting_confirmation");

    await agentAgreesWithScreen();
    const place = await isPlaceClear(api, { placeId: "room-204", day: DAY, slot: "morning" });
    expect(place.data.status).toBe("hold");
    const touching = place.data.findings as { id: string; awaitingConfirmation: boolean }[];
    expect(touching.find((f) => f.id === GHOST_ID)?.awaitingConfirmation).toBe(true);
    expect(place.text).toMatch(/awaiting crew confirmation/);

    const state = await getSiteState(api, {});
    expect((state.data.openFindings as { id: string; awaitingConfirmation: boolean }[]).find((f) => f.id === GHOST_ID)?.awaitingConfirmation).toBe(true);
    expect((await checkPlan(api, PLAN)).data.verdict).toBe("HOLD");
  });

  it("after the crew confirms: the incident is gone for both, and the place is never called clear while work is booked", async () => {
    await post(`/api/fixes/${encodeURIComponent(fixId)}/acknowledge`, { crewId: "crew-plumbing" });
    const receipts = AcknowledgementsResponse.parse(await get("/api/acknowledgements"));
    expect(receipts.receipts.find((r) => r.findingId === GHOST_ID)?.status).toBe("confirmed");

    const agent = await agentAgreesWithScreen();
    expect(agent.some((f) => f.id === GHOST_ID)).toBe(false);

    const place = await isPlaceClear(api, { placeId: "room-204", day: DAY, slot: "morning" });
    expect((place.data.findings as { id: string }[]).some((f) => f.id === GHOST_ID)).toBe(false);
    // Plumbing is still booked there, so the answer is at most "occupied", never "clear".
    expect(place.data.status).not.toBe("clear");
  });
});
