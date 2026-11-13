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

  it("beat 6 setup: reset keeps learning and replays the record", async () => {
    const reset = await post("/api/reset", { keepLearning: true });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);
    expect(reset.body.keepLearning).toBe(true);
    const { body } = await get("/api/state");
    expect(body.findings.some((f: any) => f.id === GHOST_ID)).toBe(true);
  });

  it("rejects a bad request with 400, not a crash", async () => {
    const bad = await post("/api/reset", { keepLearning: "yes" });
    expect(bad.status).toBe(400);
    expect((await get("/api/health")).status).toBe(200);
  });

  // Beats waiting on lanes building now. Turn each into a real test when it lands on main.
  it.todo("beat 3 live: a phone message from plumbing (scripted text, cached by text) produces the ghost");
  it.todo("beat 6: 'the blue room' is unresolved on run 1, superintendent maps it, run 2 resolves it on its own");
  it.todo("beat 5: approving the W-12 fix clears the ghost from state and rehearsal");
  it.todo("E: a crew asks a question by text and gets an answer from the record (/api/ask)");
  it.todo("F: an agent or robot asks is_place_clear for unit 204 over MCP and gets a sourced answer");
  it.todo("C: npm run eval scores live and rehearsal findings; numbers match eval/results.json");
});
