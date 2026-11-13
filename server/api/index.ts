import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  Correction,
  Day,
  EvalResults,
  PostMessageRequest,
  ReplayTime,
  type AgentLogResponse,
  type FixesResponse,
  type HealthResponse,
  type RehearsalResponse,
  type ResetResponse,
  type StateResponse,
  type UnresolvedResponse,
} from "@site/contracts";
import { rehearse } from "../checks/index";
import * as learning from "../learning/index";
import { logLine } from "../log";
import { getPlan } from "../model/index";
import { evalPath } from "../paths";
import { handleQueryRoute } from "../query/index";
import {
  approveFix,
  getSession,
  getUnresolved,
  latestDay,
  learnFromRun,
  NotFoundError,
  postMessage,
  recordCorrection,
  resetSession,
  sessionNow,
} from "./session";
import { clearStateAt, stateAt } from "./state-at";

// Owner: A. HTTP API. Shapes come from contracts/. The web dev server proxies /api here.

const BODY_LIMIT = 100 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Reads a JSON body (max 100 kB). An empty body reads as {}. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > BODY_LIMIT) throw new HttpError(413, "body too large (limit 100 kB)");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

/** Parse with a contract schema; a mismatch is a 400 with the first issues. */
interface Schema<T> {
  safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

function parseBody<T>(schema: Schema<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const detail = r.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.map(String).join(".") || "body"}: ${i.message}`)
      .join("; ");
    throw new HttpError(400, `invalid body: ${detail}`);
  }
  return r.data;
}

const approveRoute = /^\/api\/fixes\/([^/]+)\/approve$/;

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const route = `${req.method} ${url.pathname}`;

  try {
    if (route === "GET /api/health") {
      const body: HealthResponse = { ok: true, liveLlm: process.env.LIVE_LLM === "1" };
      return send(res, 200, body);
    }

    if (route === "GET /api/state") {
      const t = url.searchParams.get("t");
      if (t !== null) {
        // Time slider: a replay up to t, independent of the live session, memoised (state-at.ts).
        if (!ReplayTime.safeParse(t).success) {
          return send(res, 400, { error: "t must look like 2026-11-13T17:40:00" });
        }
        return send(res, 200, await stateAt(t));
      }
      const s = await getSession();
      const body: StateResponse = { t: sessionNow(s), scene: s.scene, findings: s.findings, fixes: s.fixes };
      return send(res, 200, body);
    }

    if (route === "GET /api/eval") {
      try {
        const raw = await readFile(evalPath("results.json"), "utf8");
        return send(res, 200, EvalResults.parse(JSON.parse(raw)));
      } catch {
        return send(res, 404, { error: "not found: run npm run eval" });
      }
    }

    if (route === "GET /api/messages") {
      const s = await getSession();
      return send(res, 200, { messages: s.messages });
    }

    if (route === "POST /api/message") {
      const body = parseBody(PostMessageRequest, await readJson(req));
      return send(res, 200, await postMessage(body));
    }

    if (route === "GET /api/rehearsal") {
      const s = await getSession();
      const dayParam = url.searchParams.get("day");
      if (dayParam !== null && !Day.safeParse(dayParam).success) {
        return send(res, 400, { error: "day must look like 2026-11-14" });
      }
      const day = dayParam ?? latestDay(s.scene);
      if (day === undefined) return send(res, 404, { error: "not found: no plan tasks to rehearse" });
      const body: RehearsalResponse = rehearse(s.scene, getPlan(s.scene, day));
      const findings = body.frames.reduce((n, f) => n + f.findings.length, 0);
      if (findings > 0) logLine({ kind: "api.rehearsal", day, findings });
      return send(res, 200, body);
    }

    if (route === "GET /api/unresolved") {
      // Places the superintendent still has to map.
      const body: UnresolvedResponse = { items: await getUnresolved() };
      return send(res, 200, body);
    }

    if (route === "GET /api/fixes") {
      const s = await getSession();
      const body: FixesResponse = { fixes: s.fixes };
      return send(res, 200, body);
    }

    const approve = req.method === "POST" ? approveRoute.exec(url.pathname) : null;
    if (approve) {
      return send(res, 200, await approveFix(decodeURIComponent(approve[1]!)));
    }

    if (route === "POST /api/corrections") {
      const body = parseBody(Correction, await readJson(req));
      const correction = recordCorrection(body);
      clearStateAt();
      return send(res, 200, { correction });
    }

    if (route === "POST /api/reset") {
      const raw = await readJson(req);
      const keepRaw = typeof raw === "object" && raw !== null ? (raw as { keepLearning?: unknown }).keepLearning : undefined;
      if (keepRaw !== undefined && typeof keepRaw !== "boolean") {
        return send(res, 400, { error: "invalid body: keepLearning must be a boolean" });
      }
      const keepLearning = keepRaw ?? true;
      // Run 2 learns from run 1: crews the agent put on watch are stored before the session drops.
      const learnedCrews = keepLearning ? await learnFromRun() : 0;
      resetSession({ keepLearning });
      clearStateAt();
      const s = await getSession();
      logLine({ kind: "api.reset", keepLearning, learnedCrews, findings: s.findings.length });
      const body: ResetResponse = { ok: true, keepLearning, learnedCrews, t: sessionNow(s) };
      return send(res, 200, body);
    }

    if (route === "GET /api/agent/log") {
      const s = await getSession();
      const body: AgentLogResponse = { timeline: s.agentLog, escalations: s.escalations };
      return send(res, 200, body);
    }

    // Lane E: POST /api/ask, GET /api/briefing, GET /api/digest. Answers come from the record.
    const queryHandled = await handleQueryRoute(
      req,
      res,
      async () => {
        const s = await getSession();
        return { t: sessionNow(s), scene: s.scene, findings: s.findings, messages: s.messages, fixes: s.fixes };
      },
      () => learning.getContext(),
    );
    if (queryHandled) return;

    return send(res, 404, { error: `not found: ${route}` });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    if (err instanceof NotFoundError) return send(res, 404, { error: err.message });
    if (err instanceof Error && err.name === "ZodError") return send(res, 400, { error: `invalid: ${err.message}` });
    logLine({ kind: "api.error", route, error: String(err) });
    return send(res, 500, { error: String(err) });
  }
}
