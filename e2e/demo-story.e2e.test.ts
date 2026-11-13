import { spawn, execSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  // One command string with shell: true, so npx resolves on Windows without the args-with-shell warning.
  server = spawn("npx tsx server/index.ts", {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), LIVE_LLM: "0" },
    stdio: "ignore",
    shell: true,
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

/** Runs the MCP demo robot (mcp/demo-robot.ts) against this server and returns the line for one room. */
function robotLine(room: string): string {
  const out = execSync("npx tsx mcp/demo-robot.ts", {
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

  it("F: the MCP robot skips unit 204 while it is on hold", () => {
    expect(robotLine("Unit 204")).toMatch(/ HOLD /);
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

  it("F: after approval the robot no longer reports unit 204 as HOLD", () => {
    expect(robotLine("Unit 204")).not.toMatch(/ HOLD /);
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
    expect(reset.body.learnedCrews).toBe(1);
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

  // Beats that need lane B's full scenario (data/). Turn each into a real test when it lands on main.
  it.todo("beat 3 live: a scripted phone message from plumbing (cached by text) produces the ghost");
  it.todo("beat 6: 'the blue room' is unresolved on run 1, superintendent maps it, run 2 resolves it on its own");
  it.todo("incident 2: electrical and painting both in unit 206 Saturday morning -> space_clash");
  it.todo("incident 3: drywall closes the 203 wall before the plumbing inspection -> order_of_work");
  it.todo("incident 4: tiling 205 while the tile choice is still proposed -> open_decision");
});
