import type { ChatMessage, Rehearsal, StateResponse } from "@site/contracts";

// Owner: F. HTTP client for the site server. No imports from server/: the MCP layer only sees the API.

export const DEFAULT_SITE_API = "http://127.0.0.1:8787";

/** The route is missing (older server) or the thing asked for is not on record. */
export class NotFound extends Error {
  constructor(readonly path: string, message: string) {
    super(message);
  }
}

/** The site server answered with an error, or could not be reached. Never treated as "clear". */
export class SiteError extends Error {}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Answer of POST /api/ask (lane E). Kept loose: only `text` is relied on. */
export interface AskAnswer {
  text: string;
  [key: string]: unknown;
}

export interface SiteApi {
  state(t?: string): Promise<StateResponse>;
  messages(): Promise<ChatMessage[]>;
  /** undefined when the server has no plan to rehearse for that day (404). */
  rehearsal(day?: string): Promise<Rehearsal | undefined>;
  /** Throws NotFound when the query endpoint does not exist. */
  ask(body: { text: string; crewId?: string }): Promise<AskAnswer>;
}

export function createSiteApi(base: string = process.env.SITE_API ?? DEFAULT_SITE_API, fetchImpl: FetchLike = fetch): SiteApi {
  const root = base.replace(/\/+$/, "");

  async function call(path: string, init?: Parameters<FetchLike>[1]): Promise<unknown> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchImpl(`${root}${path}`, init);
    } catch (err) {
      throw new SiteError(`site server not reachable at ${root} (${String(err)})`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const error = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : undefined;
    if (res.status === 404) throw new NotFound(path, error ?? `not found: ${path}`);
    if (!res.ok) throw new SiteError(`site server answered ${res.status} for ${path}${error ? `: ${error}` : ""}`);
    return body;
  }

  return {
    async state(t) {
      return (await call(t ? `/api/state?t=${encodeURIComponent(t)}` : "/api/state")) as StateResponse;
    },
    async messages() {
      return ((await call("/api/messages")) as { messages: ChatMessage[] }).messages;
    },
    async rehearsal(day) {
      try {
        return (await call(day ? `/api/rehearsal?day=${encodeURIComponent(day)}` : "/api/rehearsal")) as Rehearsal;
      } catch (err) {
        if (err instanceof NotFound) return undefined;
        throw err;
      }
    },
    async ask(body) {
      const raw = await call("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (typeof raw === "object" && raw !== null && typeof (raw as { text?: unknown }).text === "string") return raw as AskAnswer;
      if (typeof raw === "object" && raw !== null && typeof (raw as { answer?: unknown }).answer === "string") {
        return { ...(raw as object), text: (raw as { answer: string }).answer };
      }
      return { text: JSON.stringify(raw) };
    },
  };
}
