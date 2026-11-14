import { spawn, execFile, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The demo story over plain HTTP, against a real server process.
// No server internals are imported: lanes change them in parallel, the HTTP shapes in contracts/ stay.

const PORT = Number(process.env.E2E_PORT ?? 8790);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = fileURLToPath(new URL("..", import.meta.url));

let server: ChildProcess | undefined;

async function get<T = any>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(BASE + path);
  return { status: res.status, body: (await res.json()) as T };
}

async function post<T = any>(path: string, body: unknown = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

function stopServer(): void {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already gone
    }
  } else {
    server.kill("SIGTERM");
  }
  server = undefined;
}

beforeAll(async () => {
  // node + the tsx loader directly, no npx: npx costs 30-45 s per call on Windows in this workspace.
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), LIVE_LLM: "0" },
    stdio: "ignore",
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  stopServer();
  throw new Error(`server did not answer on ${BASE}/api/health within 45 s`);
});

afterAll(() => stopServer());

const GHOST_ID = "f-latest_change-m-002-W-12";

/**
 * Runs the MCP demo robot (mcp/demo-robot.ts) against this server and returns the line for one room.
 * Async and without npx: a blocking exec stalls the event loop, the server drops the idle keep-alive
 * socket meanwhile, and the next fetch fails with ECONNRESET.
 */
async function robotLine(room: string): Promise<string> {
  const { stdout: out } = await promisify(execFile)(process.execPath, ["--import", "tsx", "mcp/demo-robot.ts"], {
    cwd: ROOT,
    env: { ...process.env, SITE_API: BASE },
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = out.split("\n").find((l) => l.trim().startsWith(room));
  if (!line) throw new Error(`robot printed no line for ${room}: ${out}`);
  return line;
}

describe("demo story (golden replay, cached extraction)", () => {
  it("health: demo mode, no live LLM", async () => {
    const { status, body } = await get("/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, liveLlm: false });
  });

  it("beat 3: the ghost wall is in the record — W-12, 0.4 m east, sourced", async () => {
    const { status, body } = await get("/api/state");
    expect(status).toBe(200);
    const ghost = body.findings.find((f: any) => f.id === GHOST_ID);
    expect(ghost).toBeDefined();
    expect(ghost.check).toBe("latest_change");
    expect(ghost.sourceMessageId).toBe("m-002");
    expect(ghost.evidenceMessageIds).toContain("m-001");
    expect(ghost.ghost.elementId).toBe("W-12");
    expect(ghost.ghost.label).toBe("0.4 m east");
    expect(ghost.summary).toMatch(/^Per the record/);
  });

  it("beat 4: the evening rehearsal of 2026-11-14 shows it too", async () => {
    const { status, body } = await get("/api/rehearsal?day=2026-11-14");
    expect(status).toBe(200);
    expect(body.day).toBe("2026-11-14");
    const all = body.frames.flatMap((fr: any) => fr.findings);
    const ghost = all.find((f: any) => f.id === GHOST_ID);
    expect(ghost?.trigger).toBe("rehearsal");
    expect(ghost?.ghost?.label).toBe("0.4 m east");
  });

  it("E: a crew asks by text and gets HOLD from the record (/api/ask)", async () => {
    const { status, body } = await post("/api/ask", {
      crewId: "crew-plumbing",
      text: "can we start the 204 bath tomorrow morning?",
    });
    expect(status).toBe(200);
    expect(body.kind).toBe("answer");
    expect(body.text).toMatch(/^HOLD/);
    expect(body.sourceMessageIds).toContain("m-001");
  });

  it("E: plumbing's morning briefing lists the hold", async () => {
    const { status, body } = await get("/api/briefing?crew=crew-plumbing");
    expect(status).toBe(200);
    const holds = body.tasks.flatMap((t: any) => t.holds ?? []);
    expect(holds.some((h: any) => h.findingId === GHOST_ID)).toBe(true);
  });

  it("E: the superintendent's digest counts one latest_change hold", async () => {
    const { status, body } = await get("/api/digest");
    expect(status).toBe(200);
    expect(body.counts.latest_change.hold).toBe(1);
  });

  it("G: the site agent escalated the ghost wall on its own at Fri 17:40", async () => {
    const { status, body } = await get("/api/agent/log");
    expect(status).toBe(200);
    const esc = body.escalations.find((a: any) => a.kind === "escalate" && a.findingId === GHOST_ID);
    expect(esc).toBeDefined();
    expect(esc.to).toBe("superintendent");
    const step = body.timeline.find((s: any) => s.actions.some((a: any) => a.id === esc.id));
    expect(step?.time).toBe("2026-11-13T17:40:00");
  });

  it("F: the MCP robot skips unit 204 while it is on hold", async () => {
    expect(await robotLine("Unit 204")).toMatch(/ HOLD /);
  });

  it("beat 5: a notify_crew fix waits for the superintendent, then sends a HOLD DM", async () => {
    const fixes = await get("/api/fixes");
    expect(fixes.status).toBe(200);
    const fix = fixes.body.fixes.find((x: any) => x.findingId === GHOST_ID && x.kind === "notify_crew");
    expect(fix).toBeDefined();
    expect(fix.messages.map((m: any) => m.crewId)).toContain("crew-plumbing");

    const approved = await post(`/api/fixes/${encodeURIComponent(fix.id)}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.fix.status).toBe("approved");
    const dm = approved.body.sent.find((m: any) => m.crewId === "crew-plumbing");
    expect(dm?.thread).toBe("dm:crew-plumbing");
    expect(dm?.text).toMatch(/^HOLD:/);
  });

  it("beat 5: approving the W-12 fix clears the ghost from the rehearsal", async () => {
    const { body } = await get("/api/rehearsal?day=2026-11-14");
    const all = body.frames.flatMap((fr: any) => fr.findings);
    expect(all.some((f: any) => f.check === "latest_change")).toBe(false);
  });

  it("F: after approval the robot no longer reports unit 204 as HOLD", async () => {
    expect(await robotLine("Unit 204")).not.toMatch(/ HOLD /);
  });

  it("C: /api/eval serves the measured numbers from eval/results.json", async () => {
    const { status, body } = await get("/api/eval");
    expect(status).toBe(200);
    expect(body.cases).toBeGreaterThan(0);
    expect(body.total.caught + body.total.missed).toBe(body.cases);
  });

  it("beat 6: reset learns the crew that missed a change; run 2's agent warns it", async () => {
    const reset = await post("/api/reset", { keepLearning: true });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);
    expect(reset.body.keepLearning).toBe(true);
    // The full scenario has several crews that missed changes; the slice had only plumbing.
    expect(reset.body.learnedCrews).toBeGreaterThanOrEqual(1);
    const { body } = await get("/api/state");
    expect(body.findings.some((f: any) => f.id === GHOST_ID)).toBe(true);
    const log = await get("/api/agent/log");
    const dms = log.body.timeline.flatMap((s: any) => s.actions).filter((a: any) => a.kind === "send_dm");
    expect(dms.some((a: any) => a.crewId === "crew-plumbing")).toBe(true);
  });

  it("rejects a bad request with 400, not a crash", async () => {
    const bad = await post("/api/reset", { keepLearning: "yes" });
    expect(bad.status).toBe(400);
    expect((await get("/api/health")).status).toBe(200);
  });

  it("beat 3 live: a scripted phone message from plumbing produces a newly sourced ghost", async () => {
    expect((await post("/api/reset", { keepLearning: false })).status).toBe(200);
    const live = await post("/api/message", {
      thread: "site-group", senderName: "Marek (Novak Plumbing)", senderRole: "crew_lead", crewId: "crew-plumbing",
      text: "tomorrow morning we rough in the 204 bath along the east wall", kind: "text",
    });
    expect(live.status).toBe(200);
    expect(live.body.message.id).toBe("live-9aa884fec0");
    const ghost = live.body.findings.find((f: any) => f.check === "latest_change");
    expect(ghost).toMatchObject({ sourceMessageId: live.body.message.id, severity: "hold", ghost: { elementId: "W-12", label: "0.4 m east" } });
    expect(ghost.evidenceMessageIds).toContain("m-001");
    expect(live.body.fixes.some((f: any) => f.findingId === ghost.id && f.messages.some((m: any) => m.text.startsWith("HOLD:")))).toBe(true);
  });

  it("beat 6: the blue room is unresolved, mapped once, then resolved on run 2", async () => {
    expect((await post("/api/reset", { keepLearning: false })).status).toBe(200);
    const message = {
      thread: "site-group", senderName: "Sean (Walsh Drywall)", senderRole: "crew_lead", crewId: "crew-drywall",
      text: "tmrw afternoon we start boarding the blue room, ceiling first", kind: "text",
    };
    const first = await post("/api/message", message);
    expect(first.status).toBe(200);
    expect(first.body.intents).toHaveLength(1);
    expect(first.body.intents[0].placeId).toBeUndefined();
    expect((await get("/api/unresolved")).body.items.some((u: any) => u.messageId === first.body.message.id)).toBe(true);
    const correction = await post("/api/corrections", {
      id: "e2e-blue-room", kind: "location_alias", time: first.body.message.time,
      sourceMessageId: first.body.message.id, alias: "the blue room", elementId: "room-204",
    });
    expect(correction.status).toBe(200);
    expect((await post("/api/reset", { keepLearning: true })).status).toBe(200);
    const second = await post("/api/message", message);
    expect(second.status).toBe(200);
    expect(second.body.intents[0]).toMatchObject({ placeId: "room-204", sourceMessageId: second.body.message.id });
    expect((await get("/api/unresolved")).body.items.some((u: any) => u.messageId === second.body.message.id)).toBe(false);
  });

  it.each([
    ["space_clash", "m-170", "room-206", "hold"],
    ["order_of_work", "m-175", "W-08", "hold"],
    ["open_decision", "m-172", "tile-205-bath", "hold"],
  ])("full scenario: %s reaches the HTTP record and rehearsal with evidence", async (check, source, element, severity) => {
    expect((await post("/api/reset", { keepLearning: false })).status).toBe(200);
    const state = await get("/api/state");
    expect(state.status).toBe(200);
    const hit = state.body.findings.find((f: any) => f.check === check &&
      [f.sourceMessageId, ...f.evidenceMessageIds].includes(source) && f.elementIds.includes(element));
    expect(hit).toBeDefined();
    expect(hit.severity).toBe(severity);
    expect(hit.evidenceMessageIds.length).toBeGreaterThan(0);
    expect(hit.summary).toMatch(/^Per the record/);
    const rehearsal = await get("/api/rehearsal?day=2026-11-14");
    expect(rehearsal.status).toBe(200);
    expect(rehearsal.body.frames.flatMap((fr: any) => fr.findings).some((f: any) =>
      f.check === check && f.elementIds.includes(element) && f.trigger === "rehearsal")).toBe(true);
  });
});

// Planted cases from data/labels.json, checked over HTTP with eval's rule (eval/score.ts): a case is
// caught when a live or rehearsal finding has its check and its trigger message (space_clash: source or
// evidence, the clash is symmetric). Expected = the cases eval/results.detail.json reports caught, so
// this suite follows lane C's measured numbers instead of inventing its own. A case eval reports
// missed is skipped here (lane C's work, not hidden by a test expectation).
const ROOT_FILE = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
const labels: { id: string; check: string; triggerMessageId: string }[] = JSON.parse(ROOT_FILE("data/labels.json")).cases;
const detail: { cases: { id: string; caught: boolean }[] } = JSON.parse(ROOT_FILE("eval/results.detail.json"));
const caughtIds = new Set(detail.cases.filter((c) => c.caught).map((c) => c.id));
const CHECKS = ["latest_change", "space_clash", "order_of_work", "open_decision"] as const;

describe("planted cases (data/labels.json) over HTTP", () => {
  let pooled: any[] = [];

  beforeAll(async () => {
    expect((await post("/api/reset", { keepLearning: false })).status).toBe(200);
    const { body: state } = await get("/api/state");
    const days = [...new Set<string>(state.scene.tasks.map((t: any) => t.day))].sort();
    pooled = [...state.findings];
    for (const day of days) {
      const { body } = await get(`/api/rehearsal?day=${day}`);
      pooled.push(...body.frames.flatMap((fr: any) => fr.findings));
    }
  });

  it("eval detail is current with labels.json (same case ids)", () => {
    expect(detail.cases.map((c) => c.id).sort()).toEqual(labels.map((c) => c.id).sort());
  });

  it.each(CHECKS)("%s: every case eval reports caught has a finding on its trigger message", (check) => {
    const cases = labels.filter((c) => c.check === check && caughtIds.has(c.id));
    expect(cases.length).toBeGreaterThan(0);
    const missing = cases.filter(
      (c) =>
        !pooled.some(
          (f) =>
            f.check === c.check &&
            (f.sourceMessageId === c.triggerMessageId ||
              (f.check === "space_clash" && f.evidenceMessageIds.includes(c.triggerMessageId))),
        ),
    );
    expect(missing.map((c) => c.id)).toEqual([]);
  });
});
