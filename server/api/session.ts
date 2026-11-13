import {
  Correction,
  PostMessageRequest,
  type ApproveFixResponse,
  type ChatMessage,
  type ExtractResult,
  type Finding,
  type Fix,
  type Operation,
  type PostMessageResponse,
  type Rehearsal,
  type Scene,
} from "@site/contracts";
import { proposeFixes, runChecks } from "../checks/index";
import { extract } from "../extract/index";
import * as learning from "../learning/index";
import { logLine } from "../log";
import { applyOperations, getPlan } from "../model/index";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { runReplay } from "../model/replay";
import { liveCacheId } from "./live-id";

// Owner: A. The live session: golden replay once, then crew chat posted from the web on top.
// Deterministic: live message n is stamped replay end + n minutes, and its id comes from its words
// (live-id.ts), so scripted phone messages hit data/llm-cache. No wall clock, no randomness.

export interface Session {
  /** Replay time at the end of the golden replay. Live messages count from here. */
  t: string;
  scene: Scene;
  messages: ChatMessage[];
  findings: Finding[];
  fixes: Fix[];
  rehearsals: Rehearsal[];
  /** Messages whose place could not be told; the superintendent maps the nickname. */
  unresolved: learning.Unresolved[];
  liveCount: number;
}

export class NotFoundError extends Error {}

let current: Promise<Session> | undefined;
/** Serialises writes so two quick posts cannot interleave and reuse an id. */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Lazily plays the golden replay once and keeps the result. Stored corrections are applied to the
 * start scene first (learning.applyToScene), so run 2 after POST /api/reset already knows the nicknames.
 */
export function getSession(): Promise<Session> {
  if (!current) {
    const p = (async (): Promise<Session> => {
      const start = learning.applyToScene(await loadStartScene());
      const state = await runReplay(await loadGoldenReplay(), start);
      return { ...state, liveCount: 0 };
    })();
    // A failed replay is not cached; the next request tries again.
    p.catch(() => {
      if (current === p) current = undefined;
    });
    current = p;
  }
  return current;
}

/** Drop the session. keepLearning=true is "run 2": the replay is played again with stored corrections. */
export function resetSession({ keepLearning = true }: { keepLearning?: boolean } = {}): void {
  current = undefined;
  if (!keepLearning) learning.reset();
}

/** "2026-11-13T17:40:00" + n minutes, in the same format. Pure string-in, string-out. */
export function addMinutes(t: string, minutes: number): string {
  const d = new Date(`${t}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

/** The session clock: the last live message, or the end of the replay. */
export function sessionNow(s: Session): string {
  return addMinutes(s.t, s.liveCount);
}

/** Same words posted twice in one session: the second gets "-2", the third "-3". */
function uniqueId(cacheId: string, messages: ChatMessage[]): string {
  if (!messages.some((m) => m.id === cacheId)) return cacheId;
  let k = 2;
  while (messages.some((m) => m.id === `${cacheId}-${k}`)) k++;
  return `${cacheId}-${k}`;
}

/** Extraction output read under the cache id, re-sourced to the message actually posted. */
function resource(result: ExtractResult, from: string, to: string): ExtractResult {
  if (from === to) return result;
  const src = (id: string) => (id === from ? to : id);
  return {
    messageId: to,
    operations: result.operations.map((op) =>
      op.type === "plan_task"
        ? { ...op, sourceMessageId: src(op.sourceMessageId), task: { ...op.task, sourceMessageId: src(op.task.sourceMessageId) } }
        : { ...op, sourceMessageId: src(op.sourceMessageId) },
    ),
    intents: result.intents.map((i) => ({ ...i, sourceMessageId: src(i.sourceMessageId) })),
  };
}

export function postMessage(req: PostMessageRequest): Promise<PostMessageResponse> {
  const body = PostMessageRequest.parse(req);
  return serial(async () => {
    const s = await getSession();
    const n = s.liveCount + 1;
    const cacheId = liveCacheId(body.text, body.crewId);
    const message: ChatMessage = { ...body, id: uniqueId(cacheId, s.messages), time: addMinutes(s.t, n) };

    const ctx = learning.getContext();
    const extracted = resource(await extract({ ...message, id: cacheId }, ctx), cacheId, message.id);
    const resolved = learning.resolvePlaces(extracted, message, s.scene, ctx);
    const result = resolved.result;
    for (const u of resolved.unresolved) logLine({ kind: "learning.unresolved", ...u });
    for (const op of result.operations) logLine({ kind: "operation", operation: op });
    let scene = applyOperations(s.scene, result.operations);

    const findings: Finding[] = [];
    const fixes: Fix[] = [];
    for (const intent of result.intents) {
      const found = runChecks(scene, getPlan(scene, intent.day), intent);
      for (const finding of found) logLine({ kind: "finding", finding });
      findings.push(...found);
      // Messages include the one being posted, so a fix can quote its source.
      fixes.push(...proposeFixes(found, scene, [...s.messages, message]));
    }

    // Commit only after the whole pipeline succeeded.
    s.liveCount = n;
    s.scene = scene;
    s.messages.push(message);
    s.findings.push(...findings);
    s.fixes.push(...fixes);
    s.unresolved.push(...resolved.unresolved);
    logLine({ kind: "api.message", messageId: message.id, cacheId, findings: findings.length, fixes: fixes.length });
    return { message, operations: result.operations, intents: result.intents, findings, fixes };
  });
}

export function approveFix(id: string): Promise<ApproveFixResponse> {
  return serial(async () => {
    const s = await getSession();
    const fix = s.fixes.find((f) => f.id === id);
    if (!fix) throw new NotFoundError(`not found: fix ${id}`);

    const time = sessionNow(s);
    const sent: ChatMessage[] = fix.messages.map((m) => ({
      id: `sent-${fix.id}-${m.crewId}`,
      time,
      thread: `dm:${m.crewId}`,
      senderName: "Site Rehearsal",
      senderRole: "system",
      crewId: m.crewId,
      text: m.text,
      kind: "text",
    }));

    // Approving twice is a no-op: same fix, same messages, nothing sent again.
    if (fix.status !== "approved") {
      fix.status = "approved";
      learning.record({
        kind: "fix_decision",
        id: `corr-${fix.id}`,
        time,
        sourceMessageId: fix.sourceMessageId,
        fixId: fix.id,
        approved: true,
      });
      s.messages.push(...sent);
      s.scene = applyOperations(s.scene, heardOperations(s, fix, sent));
      logLine({ kind: "api.fix_approved", fixId: fix.id, sent: sent.map((m) => m.id) });
    }
    return { fix: structuredClone(fix), sent };
  });
}

/** The finding behind a fix: live findings first, then the evening rehearsals. */
function findingOf(s: Session, id: string): Finding | undefined {
  return (
    s.findings.find((f) => f.id === id) ??
    s.rehearsals.flatMap((r) => r.frames.flatMap((fr) => fr.findings)).find((f) => f.id === id)
  );
}

/**
 * An approved notify_crew fix for a latest_change finding tells the crew where the element is now:
 * one move per element and sent DM, to its current geometry, sourced from the DM. The crew has then
 * heard the latest version, so the checks and the rehearsal stop flagging it. Other fix kinds change
 * nothing in the model.
 */
function heardOperations(s: Session, fix: Fix, sent: ChatMessage[]): Operation[] {
  if (fix.kind !== "notify_crew") return [];
  const finding = findingOf(s, fix.findingId);
  if (!finding || finding.check !== "latest_change") return [];
  const ids = finding.ghost ? [finding.ghost.elementId] : finding.elementIds;
  const ops: Operation[] = [];
  for (const m of sent) {
    for (const elementId of ids) {
      const el = s.scene.elements.find((e) => e.id === elementId);
      if (!el) continue;
      ops.push({
        id: `op-${m.id}-${elementId}`,
        type: "move",
        time: m.time,
        sourceMessageId: m.id,
        thread: m.thread,
        confidence: 1,
        elementId,
        to: structuredClone(el.geometry),
        note: "latest position sent to the crew",
      });
    }
  }
  for (const op of ops) logLine({ kind: "operation", operation: op });
  return ops;
}

/** Unresolved places that no stored location_alias correction answers yet. */
export async function getUnresolved(): Promise<learning.Unresolved[]> {
  const s = await getSession();
  const answered = new Set(learning.all().flatMap((c) => (c.kind === "location_alias" ? [c.sourceMessageId] : [])));
  return s.unresolved.filter((u) => !answered.has(u.messageId));
}

/** Validates and stores a correction. It changes the next run (POST /api/reset), not the current scene. */
export function recordCorrection(c: Correction): Correction {
  const parsed = Correction.parse(c);
  learning.record(parsed);
  logLine({ kind: "api.correction", correction: parsed });
  return parsed;
}

/** Latest day that has plan tasks, or undefined. */
export function latestDay(scene: Scene): string | undefined {
  let day: string | undefined;
  for (const t of scene.tasks) if (day === undefined || t.day > day) day = t.day;
  return day;
}
