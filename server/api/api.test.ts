import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  ApproveFixResponse,
  ChatMessage,
  FixesResponse,
  HealthResponse,
  PostMessageResponse,
  RehearsalResponse,
  StateResponse,
  type ChatMessage as ChatMessageT,
} from "@site/contracts";
import { fixtureExtractResults, fixtureFinding, fixtureFix, fixtureMessages } from "@site/contracts/fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as learning from "../learning/index";
import { handle } from "./index";
import { liveCacheId } from "./live-id";
import { addMinutes, resetSession } from "./session";

// Extraction: the fixture result whose message has the same text (live ids are live-n).
vi.mock("../extract/index", () => ({
  extract: async (message: ChatMessageT) => {
    const src = fixtureMessages.find((m) => m.id === message.id || m.text === message.text);
    const hit = src && fixtureExtractResults.find((r) => r.messageId === src.id);
    return structuredClone(hit ?? { messageId: message.id, operations: [], intents: [] });
  },
}));

// Checks are being built in parallel; pin them to the ghost-wall fixture so these tests test the API.
vi.mock("../checks/index", async (importOriginal) => {
  const real = await importOriginal<typeof import("../checks/index")>();
  return {
    ...real,
    runChecks: (_s: unknown, _p: unknown, intent?: { id: string }) => (intent ? [structuredClone(fixtureFinding)] : []),
    proposeFixes: (found: { id: string }[]) => found.map((f) => ({ ...structuredClone(fixtureFix), findingId: f.id })),
  };
});

vi.spyOn(process.stdout, "write").mockImplementation(() => true);

interface Result {
  status: number;
  body: any;
}

async function call(method: string, url: string, body?: unknown): Promise<Result> {
  const payload = body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Object.assign(Readable.from(payload), { method, url }) as unknown as IncomingMessage;
  let status = 0;
  let text = "";
  const res = {
    writeHead(s: number) {
      status = s;
      return this;
    },
    end(chunk?: string) {
      text = chunk ?? "";
    },
  } as unknown as ServerResponse;
  await handle(req, res);
  return { status, body: text ? JSON.parse(text) : undefined };
}

const plumberSays = {
  thread: "site-group",
  senderName: "Marek (Novak Plumbing)",
  senderRole: "crew_lead",
  crewId: "crew-plumbing",
  text: fixtureMessages[1]!.text,
  kind: "text",
} as const;

beforeEach(() => resetSession({ keepLearning: false }));
afterEach(() => resetSession({ keepLearning: false }));

describe("api", () => {
  it("health", async () => {
    const r = await call("GET", "/api/health");
    expect(r.status).toBe(200);
    expect(HealthResponse.parse(r.body).ok).toBe(true);
  });

  it("state validates with StateResponse", async () => {
    const r = await call("GET", "/api/state");
    expect(r.status).toBe(200);
    StateResponse.parse(r.body);
  });

  it("state with a bad t is 400", async () => {
    expect((await call("GET", "/api/state?t=yesterday")).status).toBe(400);
  });

  it("invalid message is 400", async () => {
    expect((await call("POST", "/api/message", { text: "no sender" })).status).toBe(400);
    expect((await call("POST", "/api/message", "{not json")).status).toBe(400);
  });

  it("posting a message runs the pipeline with deterministic ids and times", async () => {
    const s0 = StateResponse.parse((await call("GET", "/api/state")).body);
    const t0 = s0.t;
    const fixes0 = FixesResponse.parse((await call("GET", "/api/fixes")).body).fixes.length;
    const r1 = await call("POST", "/api/message", plumberSays);
    expect(r1.status).toBe(200);
    const p1 = PostMessageResponse.parse(r1.body);
    expect(p1.message.id).toBe(liveCacheId(plumberSays.text, "crew-plumbing"));
    expect(p1.message.time).toBe(addMinutes(t0, 1));
    expect(p1.findings).toHaveLength(1);
    expect(p1.fixes[0]!.id).toBe("fix-001");

    const p2 = PostMessageResponse.parse((await call("POST", "/api/message", { ...plumberSays, text: "ok" })).body);
    expect(p2.message.id).toBe(liveCacheId("ok", "crew-plumbing"));
    expect(p2.message.time).toBe(addMinutes(t0, 2));

    const state = StateResponse.parse((await call("GET", "/api/state")).body);
    expect(state.t).toBe(addMinutes(t0, 2));
    // The golden replay may already hold findings; the live posts add exactly one.
    expect(state.findings).toHaveLength(s0.findings.length + 1);
    expect(FixesResponse.parse((await call("GET", "/api/fixes")).body).fixes).toHaveLength(fixes0 + 1);
  });

  it("approve unknown fix is 404", async () => {
    const r = await call("POST", "/api/fixes/nope/approve");
    expect(r.status).toBe(404);
  });

  it("approving a fix sends DMs, records the decision and is idempotent", async () => {
    await call("POST", "/api/message", plumberSays);
    const r = await call("POST", "/api/fixes/fix-001/approve");
    expect(r.status).toBe(200);
    const a = ApproveFixResponse.parse(r.body);
    expect(a.fix.status).toBe("approved");
    expect(a.sent[0]).toMatchObject({
      id: "sent-fix-001-crew-plumbing",
      thread: "dm:crew-plumbing",
      senderRole: "system",
      senderName: "Site Rehearsal",
    });
    expect(learning.all().filter((c) => c.kind === "fix_decision")).toHaveLength(1);

    await call("POST", "/api/fixes/fix-001/approve");
    expect(learning.all().filter((c) => c.kind === "fix_decision")).toHaveLength(1);
    const msgs = (await call("GET", "/api/messages")).body.messages.map((m: unknown) => ChatMessage.parse(m));
    expect(msgs.filter((m: ChatMessageT) => m.id.startsWith("sent-"))).toHaveLength(1);
  });

  it("a stored correction shows up in the learning context and survives reset by default", async () => {
    const r = await call("POST", "/api/corrections", {
      kind: "location_alias",
      id: "c-1",
      time: "2026-11-13T18:00:00",
      sourceMessageId: "live-1",
      alias: "The Blue Room",
      elementId: "room-204",
    });
    expect(r.status).toBe(200);
    expect(learning.getContext().locationAliases["the blue room"]).toBe("room-204");

    expect((await call("POST", "/api/reset", {})).status).toBe(200);
    expect(learning.getContext().locationAliases["the blue room"]).toBe("room-204");

    await call("POST", "/api/reset", { keepLearning: false });
    expect(learning.getContext().locationAliases).toEqual({});
  });

  it("run 2: a stored nickname shows on the element after POST /api/reset", async () => {
    const aliasesOf = async (id: string) =>
      StateResponse.parse((await call("GET", "/api/state")).body).scene.elements.find((e) => e.id === id)!.aliases;
    expect(await aliasesOf("room-203")).not.toContain("the blue room");

    const r = await call("POST", "/api/corrections", {
      kind: "location_alias",
      id: "c-2",
      time: "2026-11-13T18:00:00",
      sourceMessageId: "live-1",
      alias: "The Blue Room",
      elementId: "room-203",
    });
    expect(r.status).toBe(200);
    // The current run is not changed; the next run is.
    expect(await aliasesOf("room-203")).not.toContain("the blue room");

    expect((await call("POST", "/api/reset", {})).status).toBe(200);
    expect(await aliasesOf("room-203")).toContain("the blue room");

    await call("POST", "/api/reset", { keepLearning: false });
    expect(await aliasesOf("room-203")).not.toContain("the blue room");
  });

  it("invalid correction is 400", async () => {
    expect((await call("POST", "/api/corrections", { kind: "location_alias" })).status).toBe(400);
  });

  it("rehearsal defaults to the latest planned day; bad day is 400", async () => {
    const r = await call("GET", "/api/rehearsal");
    expect(r.status).toBe(200);
    expect(RehearsalResponse.parse(r.body).day).toBe("2026-11-14");
    expect((await call("GET", "/api/rehearsal?day=tomorrow")).status).toBe(400);
  });

  it("reset after live messages starts the live clock over", async () => {
    await call("POST", "/api/message", plumberSays);
    await call("POST", "/api/reset", {});
    const p = PostMessageResponse.parse((await call("POST", "/api/message", plumberSays)).body);
    expect(p.message.id).toBe(liveCacheId(plumberSays.text, "crew-plumbing"));
    expect(p.message.time).toBe(addMinutes(StateResponse.parse((await call("GET", "/api/state")).body).t, 0));
  });
});
