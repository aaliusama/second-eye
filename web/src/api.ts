import type {
  ApproveFixResponse,
  ChatMessage,
  Correction,
  EvalResults,
  PostMessageRequest,
  PostMessageResponse,
  Rehearsal,
  StateResponse,
} from "@site/contracts";

// Owner: D. Typed calls to the server. Shapes come from contracts/. A route the server
// does not have yet answers `undefined` (404), so the screen degrades instead of breaking.

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = ((await res.json()) as { error?: string }).error ?? detail;
    } catch {
      // body was not JSON
    }
    throw new ApiError(`${path}: ${detail}`);
  }
  return (await res.json()) as T;
}

async function optional<T>(path: string): Promise<T | undefined> {
  const res = await fetch(path);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new ApiError(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface UnresolvedItem {
  messageId: string;
  crewId?: string;
  text: string;
  phrase?: string;
}

// Shapes below come from lanes still landing (A, E, G). Replace with contract imports once
// they are in contracts/; until then they are read-only views of what the server sends.

/** POST /api/ask: a crew question answered from the record. */
export interface Answer {
  kind: "answer" | "escalated" | "not_found";
  text: string;
  sourceMessageIds: string[];
}

/** GET /api/agent/log: what the system did on its own, per tick. */
export interface AgentLogEntry {
  time: string;
  /** Lane G actions carry `kind` (send_dm, escalate, follow_up, auto_resolve); `type` kept for older logs. */
  actions: { kind?: string; type?: string; crewId?: string; text?: string; reason?: string; sourceMessageIds?: string[] }[];
  /** Actions waiting for the superintendent, when the server reports them. */
  queued?: unknown[];
}

/** GET /api/briefing?crew=&day=. Read loosely: lines of text plus their sources. */
export interface Briefing {
  crewId?: string;
  day?: string;
  text?: string;
  lines?: { text: string; sourceMessageIds?: string[] }[];
  items?: { text: string; sourceMessageIds?: string[] }[];
}

/** A crew question, not a statement of intent. */
export const isQuestion = (text: string) => /\?\s*$/.test(text.trim()) || /^(what|where|can|who|is)\b/i.test(text.trim());

/** POST that answers undefined on 404, so a route that has not landed falls back. */
async function optionalPost<T>(path: string, body: unknown): Promise<T | undefined> {
  const res = await fetch(path, post(body));
  if (res.status === 404) return undefined;
  if (!res.ok) throw new ApiError(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  ask: (crewId: string, text: string) => optionalPost<Answer>("/api/ask", { crewId, text }),
  agentLog: () =>
    optional<AgentLogEntry[] | { entries?: AgentLogEntry[]; timeline?: AgentLogEntry[] }>("/api/agent/log").then((r) =>
      r === undefined ? undefined : Array.isArray(r) ? r : (r.timeline ?? r.entries ?? []),
    ),
  briefing: (crewId: string, day: string) =>
    optional<Briefing>(`/api/briefing?crew=${encodeURIComponent(crewId)}&day=${encodeURIComponent(day)}`),
  state: (t?: string) => call<StateResponse>(t ? `/api/state?t=${encodeURIComponent(t)}` : "/api/state"),
  messages: () => call<{ messages: ChatMessage[] }>("/api/messages").then((r) => r.messages),
  rehearsal: () => optional<Rehearsal>("/api/rehearsal"),
  postMessage: (body: PostMessageRequest) => call<PostMessageResponse>("/api/message", post(body)),
  approve: (fixId: string) => call<ApproveFixResponse>(`/api/fixes/${encodeURIComponent(fixId)}/approve`, post({})),
  correction: (c: Correction) => call<{ correction: Correction }>("/api/corrections", post(c)),
  reset: (keepLearning: boolean) => call<{ ok: true; t: string }>("/api/reset", post({ keepLearning })),
  eval: () => optional<EvalResults>("/api/eval"),
  /** Lane A route; undefined until the server has it. */
  unresolved: () => optional<{ items: UnresolvedItem[] }>("/api/unresolved").then((r) => r?.items),
};

/** Tabs (main screen, /phone) tell each other to refetch after a write. */
const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("site-rehearsal");

export function announceChange(): void {
  channel?.postMessage("changed");
}

export function onChange(fn: () => void): () => void {
  if (!channel) return () => undefined;
  const handler = () => fn();
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}
