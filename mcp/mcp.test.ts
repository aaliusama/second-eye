import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Fix, Rehearsal, StateResponse } from "@site/contracts";
import { fixtureFinding, fixtureFix, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import { describe, expect, it } from "vitest";
import { createSiteApi, type FetchLike } from "./api";
import { createSiteMcpServer } from "./server";
import {
  askSite,
  checkPlan,
  elementHistory,
  getFindings,
  getRehearsal,
  getSiteState,
  isPlaceClear,
  whatsPlanned,
} from "./tools";

// A fake site server: route table -> [status, body]. No network.
type Routes = Record<string, [number, unknown] | ((body?: string) => [number, unknown])>;

const baseState = (): StateResponse => ({
  t: "2026-11-13T20:00:00",
  scene: structuredClone(fixtureScene),
  findings: [structuredClone(fixtureFinding)],
  fixes: [structuredClone(fixtureFix)],
});

const rehearsal: Rehearsal = {
  day: "2026-11-14",
  frames: [{ step: 0, time: "2026-11-14T07:00:00", activeTaskIds: ["task-001"], findings: [{ ...fixtureFinding, trigger: "rehearsal" }] }],
};

function fakeSite(routes: Routes) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const key = `${init?.method ?? "GET"} ${u.pathname}${u.search}`;
    calls.push(key);
    const route = routes[key] ?? routes[`${init?.method ?? "GET"} ${u.pathname}`];
    const [status, body] = route === undefined ? [404, { error: `not found: ${key}` }] : typeof route === "function" ? route(init?.body) : route;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { api: createSiteApi("http://site.test", fetchImpl), calls };
}

const standard = (overrides: Routes = {}) =>
  fakeSite({
    "GET /api/state": [200, baseState()],
    "GET /api/messages": [200, { messages: fixtureMessages }],
    "GET /api/rehearsal": [200, rehearsal],
    ...overrides,
  });

describe("api client", () => {
  it("uses SITE_API base and passes t", async () => {
    const { api, calls } = standard();
    await api.state("2026-11-13T18:00:00");
    expect(calls).toEqual(["GET /api/state?t=2026-11-13T18%3A00%3A00"]);
  });

  it("an unreachable server is an error, not an empty answer", async () => {
    const api = createSiteApi("http://site.test", async () => {
      throw new Error("ECONNREFUSED");
    });
    const out = await getSiteState(api, {});
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/not reachable/);
  });
});

describe("get_site_state", () => {
  it("summarises the record", async () => {
    const out = await getSiteState(standard().api, {});
    expect(out.isError).toBeUndefined();
    expect(out.text).toMatch(/Open findings: 1/);
    expect(out.text).toMatch(/Fixes waiting for the superintendent: 1/);
    expect(out.data.plannedTasks).toHaveLength(1);
    expect((out.data.places as { id: string }[]).map((p) => p.id)).toEqual(["corridor", "room-203", "room-204"]);
  });

  it("an approved fix closes its finding", async () => {
    const s = baseState();
    s.fixes = [{ ...fixtureFix, status: "approved" } satisfies Fix];
    const out = await getSiteState(standard({ "GET /api/state": [200, s] }).api, {});
    expect(out.data.openFindings).toEqual([]);
  });
});

describe("whats_planned", () => {
  it("filters by place and day", async () => {
    const { api } = standard();
    expect((await whatsPlanned(api, { placeId: "room-204", day: "2026-11-14" })).data.tasks).toHaveLength(1);
    expect((await whatsPlanned(api, { placeId: "room-203" })).data.tasks).toHaveLength(0);
  });

  it("an unknown place is not found, not an empty plan", async () => {
    const out = await whatsPlanned(standard().api, { placeId: "room-999" });
    expect(out.isError).toBe(true);
    expect(out.text).toBe("not found: place room-999");
  });
});

describe("get_findings and get_rehearsal", () => {
  it("merges live and rehearsal findings, keyed by id and trigger", async () => {
    const out = await getFindings(standard().api, {});
    const findings = out.data.findings as { trigger: string }[];
    expect(findings.map((f) => f.trigger).sort()).toEqual(["live", "rehearsal"]);
    expect((await getFindings(standard().api, { check: "space_clash" })).data.findings).toEqual([]);
  });

  it("rehearsal 404 means no plan, reported as not found", async () => {
    const out = await getRehearsal(standard({ "GET /api/rehearsal": [404, { error: "not found: no plan tasks to rehearse" }] }).api, {});
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/not found/);
  });

  it("rehearsal frames are summarised", async () => {
    const out = await getRehearsal(standard().api, { day: "2026-11-14" });
    expect(out.text).toMatch(/07:00: 1 active task\(s\); HOLD latest change/);
  });
});

describe("element_history", () => {
  it("quotes the source message for each change", async () => {
    const out = await elementHistory(standard().api, { elementId: "W-12" });
    expect(out.text).toMatch(/v1 .* by drawing set/);
    expect(out.text).toMatch(/v2 .* by Lena Hofer \(architect\) \(m-001\): "Rev C: W-12/);
  });

  it("unknown element is not found", async () => {
    expect((await elementHistory(standard().api, { elementId: "W-99" })).isError).toBe(true);
  });
});

describe("is_place_clear", () => {
  const ask = (api: ReturnType<typeof standard>["api"], placeId: string, slot: "morning" | "afternoon" | "full_day" = "morning") =>
    isPlaceClear(api, { placeId, day: "2026-11-14", slot });

  it("hold where a crew is planned and a hold finding touches it", async () => {
    const out = await ask(standard().api, "room-204");
    expect(out.data.status).toBe("hold");
    expect(out.data.crews).toEqual(["Novak Plumbing"]);
    expect(out.text).toMatch(/^HOLD: Unit 204/);
  });

  it("clear only when nothing is planned and nothing touches the place", async () => {
    const out = await ask(standard().api, "room-203");
    expect(out.data.status).toBe("clear");
  });

  it("occupied when planned but the finding is handled", async () => {
    const s = baseState();
    s.fixes = [{ ...fixtureFix, status: "approved" }];
    const out = await ask(standard({ "GET /api/state": [200, s], "GET /api/rehearsal": [200, { day: "2026-11-14", frames: [] }] }).api, "room-204");
    expect(out.data.status).toBe("occupied");
  });

  it("other slot of the same day is clear; full_day overlaps", async () => {
    const s = baseState();
    s.findings = [];
    s.fixes = [];
    const api = standard({ "GET /api/state": [200, s], "GET /api/rehearsal": [200, { day: "2026-11-14", frames: [] }] }).api;
    expect((await ask(api, "room-204", "afternoon")).data.status).toBe("clear");
    expect((await ask(api, "room-204", "full_day")).data.status).toBe("occupied");
  });

  it("never clear on missing data: unknown place", async () => {
    const out = await ask(standard().api, "room-999");
    expect(out.data.status).toBe("unknown");
    expect(out.text).toMatch(/Do not enter/);
  });

  it("never clear on missing data: server down or failing", async () => {
    const down = await ask(standard({ "GET /api/state": [500, { error: "boom" }] }).api, "room-203");
    expect(down.isError).toBe(true);
    expect(down.data.status).toBeUndefined();
    const brokenRehearsal = await ask(standard({ "GET /api/rehearsal": [500, { error: "boom" }] }).api, "room-203");
    expect(brokenRehearsal.isError).toBe(true);
  });

  it("no plan to rehearse (404) still answers from bookings", async () => {
    const out = await ask(standard({ "GET /api/rehearsal": [404, { error: "not found" }] }).api, "room-203");
    expect(out.data.status).toBe("clear");
  });
});

describe("check_plan", () => {
  const plan = { crewId: "crew-drywall", taskType: "close_wall" as const, placeId: "room-204", day: "2026-11-14", slot: "morning" as const };

  it("asks the query endpoint when it exists", async () => {
    let posted: unknown;
    const { api } = standard({
      "POST /api/ask": (body) => {
        posted = JSON.parse(body ?? "{}");
        return [200, { text: "HOLD: plumbing is in Unit 204 that morning (m-002)." }];
      },
    });
    const out = await checkPlan(api, plan);
    expect(out.data.basis).toBe("ask");
    expect(out.data.verdict).toBe("HOLD");
    expect(posted).toEqual({ crewId: "crew-drywall", text: "Can Walsh Drywall close wall in Unit 204 on 2026-11-14 morning?" });
  });

  it("falls back to bookings when /api/ask is missing (404)", async () => {
    const out = await checkPlan(standard().api, plan);
    expect(out.data.basis).toBe("record");
    expect(out.data.verdict).toBe("HOLD");
    expect(out.text).toMatch(/space: Novak Plumbing/);
  });

  it("fallback flags the crew's own open finding", async () => {
    const out = await checkPlan(standard().api, { ...plan, crewId: "crew-plumbing", taskType: "rough_in_plumbing", elementIds: ["W-12"] });
    expect(out.data.verdict).toBe("HOLD");
    expect(out.text).toMatch(/latest change/);
  });

  it("fallback CLEAR says it did not re-check", async () => {
    const out = await checkPlan(standard().api, { ...plan, placeId: "room-203" });
    expect(out.data.verdict).toBe("CLEAR");
    expect(out.text).toMatch(/not re-checked/);
  });

  it("a server error on /api/ask is a hold-worthy error, not a fallback CLEAR", async () => {
    const out = await checkPlan(standard({ "POST /api/ask": [500, { error: "boom" }] }).api, { ...plan, placeId: "room-203" });
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/treat as HOLD/);
  });

  it("unknown crew or place is not found", async () => {
    expect((await checkPlan(standard().api, { ...plan, crewId: "crew-x" })).isError).toBe(true);
    expect((await checkPlan(standard().api, { ...plan, placeId: "room-x" })).isError).toBe(true);
  });
});

describe("ask_site", () => {
  it("passes the question through", async () => {
    const out = await askSite(standard({ "POST /api/ask": [200, { answer: "Plumbing is in 204 tomorrow morning." }] }).api, { text: "who is in 204?" });
    expect(out.text).toBe("Plumbing is in 204 tomorrow morning.");
  });

  it("404 is a tool error: query endpoint not available", async () => {
    const out = await askSite(standard().api, { text: "who is in 204?" });
    expect(out).toMatchObject({ isError: true, text: "query endpoint not available" });
  });
});

describe("MCP server", () => {
  async function connect() {
    const server = createSiteMcpServer(standard().api);
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  }

  it("lists the read-only tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "ask_site",
      "check_plan",
      "element_history",
      "get_findings",
      "get_rehearsal",
      "get_site_state",
      "is_place_clear",
      "whats_planned",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    await client.close();
  });

  it("is_place_clear over the protocol, with structured content", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "is_place_clear", arguments: { placeId: "room-204", day: "2026-11-14", slot: "morning" } });
    expect((r.structuredContent as { status: string }).status).toBe("hold");
    await client.close();
  });

  it("rejects a bad slot with the contract schema", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "is_place_clear", arguments: { placeId: "room-204", day: "2026-11-14", slot: "evening" } });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("serves resources", async () => {
    const client = await connect();
    const scene = await client.readResource({ uri: "site://scene" });
    expect(JSON.parse(String((scene.contents[0] as { text: string }).text)).floorId).toBe("level-2");
    const r = await client.readResource({ uri: "site://rehearsal/2026-11-14" });
    expect(JSON.parse(String((r.contents[0] as { text: string }).text)).day).toBe("2026-11-14");
    await client.close();
  });
});
