import type { IncomingMessage, ServerResponse } from "node:http";
import { Day, type LearningContext } from "@site/contracts";
import { logLine } from "../log";
import { answerQuery, type QueryState } from "./answer";
import { briefing, digest } from "./briefing";
import { readCache, writeCache } from "./cache";
import { groqModel, groqParse } from "./llm";
import { cacheKey, guard, keywordParse } from "./parse";
import { AskRequest, type Answer, type Question, type StructuredQuery } from "./schema";

// Owner: E. "Crews text the system and get answers from the record, while decisions go to the superintendent."
// Parse (cache -> live Groq if LIVE_LLM=1 -> keyword fallback) then answer by rules.

export { answerQuery, briefing, digest, cacheKey };
export type { QueryState };
export * from "./schema";

export interface AskContext {
  state: QueryState;
  learning?: LearningContext;
}

export type ParsedVia = "cache" | "llm" | "keywords" | "none";

/** Question text -> StructuredQuery. Every result goes through guard(): unknown ids become null. */
export async function parseQuestion(q: Question, ctx: AskContext): Promise<{ query: StructuredQuery | null; via: ParsedVia }> {
  const key = cacheKey(q.text, q.crewId);
  const cached = await readCache(key);
  if (cached) return { query: guard(cached.query, q, ctx.state.scene), via: "cache" };

  if (process.env.LIVE_LLM === "1") {
    const query = await groqParse(q, ctx.state.scene, ctx.learning);
    await writeCache({ key, text: q.text, ...(q.crewId ? { crewId: q.crewId } : {}), query, source: "llm", model: groqModel() });
    return { query: guard(query, q, ctx.state.scene), via: "llm" };
  }

  const query = guard(keywordParse(q, ctx.state.scene, ctx.learning), q, ctx.state.scene);
  return { query, via: query ? "keywords" : "none" };
}

export async function ask(q: Question, ctx: AskContext): Promise<Answer & { via: ParsedVia }> {
  const { query, via } = await parseQuestion(q, ctx);
  const answer = answerQuery(q, query, ctx.state);
  logLine({ kind: "query.answer", questionId: q.id, via, query, answerKind: answer.kind, sources: answer.sourceMessageIds });
  return { ...answer, via };
}

// ---------- HTTP helper for the lead to mount in server/api ----------

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of req) {
    text += typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8");
    if (text.length > 10_000) throw new Error("body too large");
  }
  return text.trim() ? JSON.parse(text) : {};
}

/** Latest day with plan tasks, or the day of `t`. */
const defaultDay = (s: QueryState) => s.scene.tasks.map((t) => t.day).sort().at(-1) ?? s.t.slice(0, 10);

/**
 * Handles POST /api/ask, GET /api/briefing, GET /api/digest. Returns false for any other route.
 * `getState` returns the live session; `getLearning` the stored nicknames (optional).
 */
export async function handleQueryRoute(
  req: IncomingMessage,
  res: ServerResponse,
  getState: () => Promise<QueryState>,
  getLearning?: () => LearningContext,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const route = `${req.method} ${url.pathname}`;
  if (route !== "POST /api/ask" && route !== "GET /api/briefing" && route !== "GET /api/digest") return false;

  try {
    const state = await getState();
    if (route === "POST /api/ask") {
      let raw: unknown;
      try {
        raw = await readBody(req);
      } catch (err) {
        send(res, 400, { error: `invalid body: ${String((err as Error).message)}` });
        return true;
      }
      const body = AskRequest.safeParse(raw);
      if (!body.success) {
        send(res, 400, { error: "invalid body: expected {crewId?, text}" });
        return true;
      }
      // Deterministic id: same text from the same crew at the same replay time -> same question id.
      const q: Question = { id: `q-${cacheKey(body.data.text, body.data.crewId)}`, time: state.t, text: body.data.text, ...(body.data.crewId ? { crewId: body.data.crewId } : {}) };
      send(res, 200, await ask(q, { state, learning: getLearning?.() }));
      return true;
    }

    const day = url.searchParams.get("day") ?? defaultDay(state);
    if (!Day.safeParse(day).success) {
      send(res, 400, { error: "day must look like 2026-11-14" });
      return true;
    }
    if (route === "GET /api/digest") {
      send(res, 200, digest(state, day));
      return true;
    }
    const crew = url.searchParams.get("crew");
    if (!crew || !state.scene.crews.some((c) => c.id === crew)) {
      send(res, 404, { error: `not found: crew ${crew ?? "(missing ?crew=)"}` });
      return true;
    }
    send(res, 200, briefing(state, crew, day));
    return true;
  } catch (err) {
    logLine({ kind: "query.error", route, error: String(err) });
    send(res, 500, { error: String(err) });
    return true;
  }
}
