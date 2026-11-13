import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EvalResults, ReplayTime, type HealthResponse, type StateResponse } from "@site/contracts";
import { logLine } from "../log";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { runReplay } from "../model/replay";
import { evalPath } from "../paths";

// Owner: A. HTTP API. Shapes come from contracts/. The web dev server proxies /api here.

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

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
      if (t !== null && !ReplayTime.safeParse(t).success) {
        return send(res, 400, { error: "t must look like 2026-11-13T17:40:00" });
      }
      const state = await runReplay(await loadGoldenReplay(), await loadStartScene(), t ?? undefined);
      const body: StateResponse = { t: state.t, scene: state.scene, findings: state.findings, fixes: state.fixes };
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

    if (["/api/message", "/api/rehearsal", "/api/fixes"].some((p) => url.pathname.startsWith(p))) {
      return send(res, 501, { error: `not built yet: ${route}` });
    }

    return send(res, 404, { error: `not found: ${route}` });
  } catch (err) {
    logLine({ kind: "api.error", route, error: String(err) });
    return send(res, 500, { error: String(err) });
  }
}
