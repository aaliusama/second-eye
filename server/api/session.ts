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
  type IncidentReceipt,
  type AcknowledgeFixResponse,
} from "@site/contracts";
import { receiptStatus, revisionSignature } from "./acknowledgement";
import { computeProfiles, runAgent, stepsFor, suggestCorrections, type AgentRun, type TimelineStep } from "../agent/index";
import { proposeFixes, runChecks } from "../checks/index";
import { extract } from "../extract/index";
import * as learning from "../learning/index";
import { logLine } from "../log";
import { applyOperations, getPlan } from "../model/index";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { runReplay } from "../model/replay";
import { resolveLiveFindings, type LiveRecord } from "../model/resolve";
import { liveCacheId } from "./live-id";

// Owner: A. The live session: golden replay once, then crew chat posted from the web on top.
// Deterministic: live message n is stamped replay end + n minutes, and its id comes from its words
// (live-id.ts), so scripted phone messages hit data/llm-cache. No wall clock, no randomness.

export interface Session extends LiveRecord {
  /** Replay time at the end of the golden replay. Live messages count from here. */
  t: string;
  scene: Scene;
  messages: ChatMessage[];
  /** Active findings. Live findings a later message fixed move to resolvedFindings (model/resolve.ts). */
  findings: Finding[];
  fixes: Fix[];
  rehearsals: Rehearsal[];
  /** Messages whose place could not be told; the superintendent maps the nickname. */
  unresolved: learning.Unresolved[];
  liveCount: number;
  /** Site agent (server/agent): action ids that already ran, its timeline, and its escalations. */
  agentDone: string[];
  agentLog: TimelineStep[];
  escalations: AgentRun["escalations"];
  receipts: IncidentReceipt[];
}

/**
 * Let the site agent act on the session at the given replay times. Its DMs join the chat as
 * dm:<crewId> messages; done ids carry over so nothing is sent twice.
 */
function stepAgent(s: Session, steps: string[]): void {
  // The agent also sees resolved live findings (and their dropped fixes), so it can still say CLEAR.
  const run = runAgent(
    {
      scene: s.scene,
      messages: s.messages,
      findings: [...s.findings, ...s.resolvedFindings],
      fixes: [...s.fixes, ...s.resolvedFixes],
      rehearsals: s.rehearsals,
      learning: learning.getContext(),
      done: s.agentDone,
    },
    steps,
  );
  s.messages.push(...run.sent);
  s.agentLog.push(...run.timeline);
  s.escalations.push(...run.escalations);
  s.agentDone = run.done;
  for (const step of run.timeline) logLine({ kind: "agent.step", time: step.time, actions: step.actions.map((a) => a.id) });
}

export class NotFoundError extends Error {}
export class AcknowledgementConflictError extends Error {}

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
      const s: Session = { ...state, liveCount: 0, agentDone: [], agentLog: [], escalations: [], receipts: [] };
      stepAgent(s, stepsFor(s.messages, s.t));
      return s;
    })();
    // A failed replay is not cached; the next request tries again.
    p.catch(() => {
      if (current === p) current = undefined;
    });
    current = p;
  }
  return current;
}

/**
 * Builds the session at server start, so the first request does not wait for the replay. Requests
 * during the warm-up await the same promise (getSession), so the replay plays once. Logs one JSON line;
 * the duration is for the log only, never for logic. A failure is logged, the next request retries.
 */
export async function warmUp(): Promise<void> {
  const started = performance.now();
  try {
    const s = await getSession();
    logLine({ kind: "server.warmup", ms: Math.round(performance.now() - started), messages: s.messages.length, findings: s.findings.length });
  } catch (err) {
    logLine({ kind: "server.warmup_error", ms: Math.round(performance.now() - started), error: String(err) });
  }
}

/**
 * End-of-run learning: crews the agent put on watch (missed changes, unanswered questions) are stored
 * as crew_misread corrections, so the next run's agent warns them as soon as a change lands.
 * Same correction id is stored once.
 */
export async function learnFromRun(): Promise<number> {
  if (!current) return 0;
  const s = await current;
  const known = new Set(learning.all().map((c) => c.id));
  const fresh = suggestCorrections(computeProfiles(s.scene.crews, [...s.findings, ...s.resolvedFindings], [...s.fixes, ...s.resolvedFixes], s.messages), sessionNow(s)).filter(
    (c) => !known.has(c.id),
  );
  for (const c of fresh) learning.record(c);
  if (fresh.length > 0) logLine({ kind: "learning.crew_watch", corrections: fresh.map((c) => c.id) });
  return fresh.length;
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
    const extracted = resource(await extract({ ...message, id: cacheId }, ctx, s.scene), cacheId, message.id);
    const resolved = learning.resolvePlaces(extracted, message, s.scene, ctx);
    const result = resolved.result;
    for (const u of resolved.unresolved) logLine({ kind: "learning.unresolved", ...u });
    for (const op of result.operations) logLine({ kind: "operation", operation: op });
    let scene = applyOperations(s.scene, result.operations);

    const findings: Finding[] = [];
    const fixes: Fix[] = [];
    const intents: LiveRecord["liveIntents"] = {};
    for (const intent of result.intents) {
      const found = runChecks(scene, getPlan(scene, intent.day), intent);
      for (const finding of found) logLine({ kind: "finding", finding });
      for (const finding of found) intents[finding.id] = intent;
      findings.push(...found);
      // Messages include the one being posted, so a fix can quote its source.
      fixes.push(...proposeFixes(found, scene, [...s.messages, message]));
    }

    // Commit only after the whole pipeline succeeded.
    s.liveCount = n;
    s.scene = scene;
    s.messages.push(message);
    // Open live findings this message fixed leave the active list, with their pending fixes.
    resolveLiveFindings(s, message.id);
    Object.assign(s.liveIntents, intents);
    s.findings.push(...findings);
    s.fixes.push(...fixes);
    s.unresolved.push(...resolved.unresolved);
    logLine({ kind: "api.message", messageId: message.id, cacheId, findings: findings.length, fixes: fixes.length });
    stepAgent(s, [message.time]);
    return { message, operations: result.operations, intents: result.intents, findings, fixes };
  });
}

export function approveFix(id: string): Promise<ApproveFixResponse> {
  return serial(async () => {
    const s = await getSession();
    const fix = s.fixes.find((f) => f.id === id);
    if (!fix) throw new NotFoundError(`not found: fix ${id}`);

    // Never ask a crew to confirm a snapshot newer than the correction text being dispatched.
    const dispatchFinding = findingOf(s, fix.findingId);
    if (fix.status !== "approved" && fix.kind === "notify_crew" && dispatchFinding?.check === "latest_change" && dispatchFinding.severity === "hold") {
      const ids = dispatchFinding.ghost ? [dispatchFinding.ghost.elementId] : dispatchFinding.elementIds;
      const sources = new Set([dispatchFinding.sourceMessageId, ...dispatchFinding.evidenceMessageIds]);
      for (const id of ids) {
        const element = s.scene.elements.find((e) => e.id === id);
        const revision = element && [...element.history].reverse().find((entry) => entry.geometry && !entry.sourceMessageId.startsWith("ack-"));
        if (!element || !revision || !sources.has(revision.sourceMessageId)) throw new AcknowledgementConflictError("The correction is based on an older revision. Review the current finding before sending.");
      }
    }

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
      const finding = findingOf(s, fix.findingId);
      if (finding?.check === "latest_change" && finding.severity === "hold" && fix.kind === "notify_crew") {
        const ids = finding.ghost ? [finding.ghost.elementId] : finding.elementIds;
        s.receipts.push({
          fixId: fix.id, findingId: finding.id, summary: finding.summary, sourceMessageId: finding.sourceMessageId,
          evidenceMessageIds: [...finding.evidenceMessageIds], sentAt: time, status: "awaiting_confirmation",
          revisions: ids.flatMap((id) => {
            const el = s.scene.elements.find((e) => e.id === id);
            if (!el) return [];
            return [{ elementId: el.id, name: el.name, version: el.version, sourceMessageId: el.history.at(-1)!.sourceMessageId, signature: revisionSignature(el) }];
          }),
          crews: sent.map((m) => ({ crewId: m.crewId!, crewName: s.scene.crews.find((c) => c.id === m.crewId)?.name ?? "not found", sentMessageId: m.id })),
        });
      }
      logLine({ kind: "api.fix_approved", fixId: fix.id, sent: sent.map((m) => m.id) });
      stepAgent(s, [time]);
    }
    return { fix: structuredClone(fix), sent };
  });
}

export async function getAcknowledgements(): Promise<IncidentReceipt[]> {
  const s = await getSession();
  return s.receipts.map((receipt) => ({ ...structuredClone(receipt), status: receiptStatus(receipt, s.scene) }));
}

/** Explicit crew simulation action: the acknowledgement is a crew message with its own source. */
export function acknowledgeFix(fixId: string, crewId: string): Promise<AcknowledgeFixResponse> {
  return serial(async () => {
    const s = await getSession();
    const receipt = s.receipts.find((r) => r.fixId === fixId);
    if (!receipt) throw new NotFoundError("not found: dispatched geometry correction");
    const crew = receipt.crews.find((c) => c.crewId === crewId);
    if (!crew) throw new NotFoundError("not found: recipient crew");
    if (receiptStatus(receipt, s.scene) === "superseded") throw new AcknowledgementConflictError("The recorded revision changed after dispatch. Review and send the current correction before acknowledging.");
    if (crew.acknowledgedMessageId) return { receipt: { ...structuredClone(receipt), status: receiptStatus(receipt, s.scene) }, sourceMessageId: crew.acknowledgedMessageId };
    s.liveCount++;
    const message: ChatMessage = {
      id: `ack-${fixId}-${crewId}`, time: sessionNow(s), thread: `dm:${crewId}`, crewId,
      senderName: crew.crewName, senderRole: "crew_lead", kind: "text",
      text: `Confirmed receipt of the correction: ${receipt.revisions.map((r) => `${r.name}, recorded version ${r.version}`).join("; ")}. This confirms the information received, not completed work.`,
    };
    const fix = s.fixes.find((f) => f.id === fixId)!;
    s.messages.push(message);
    s.scene = applyOperations(s.scene, heardOperations(s, fix, [message]));
    crew.acknowledgedMessageId = message.id;
    crew.acknowledgedAt = message.time;
    receipt.status = receiptStatus(receipt, s.scene);
    // Approved dispatches remain in the receipt; recheck findings against the now acknowledged record.
    const gone = s.findings.filter((f) => f.check === "latest_change" && f.crewIds.includes(crewId) &&
      f.elementIds.some((id) => receipt.revisions.some((r) => r.elementId === id)) &&
      !runChecks(s.scene, getPlan(s.scene, s.liveIntents[f.id]?.day ?? latestDay(s.scene)!), s.liveIntents[f.id]).some((next) => next.id === f.id));
    const goneIds = new Set(gone.map((f) => f.id));
    s.findings = s.findings.filter((f) => !goneIds.has(f.id));
    s.resolvedFindings.push(...gone);
    logLine({ kind: "api.crew_acknowledged", fixId, crewId, sourceMessageId: message.id, status: receipt.status });
    stepAgent(s, [message.time]);
    return { receipt: structuredClone(receipt), sourceMessageId: message.id };
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
 * A crew acknowledgement of a notify_crew fix records receipt of the exact dispatched revision:
 * one geometry-history entry per element, sourced from the crew reply. A WARN draft requests
 * confirmation of an uncertain record: sending that question cannot confirm geometry. Other fix kinds
 * and warning findings change nothing in the model.
 */
function heardOperations(s: Session, fix: Fix, sent: ChatMessage[]): Operation[] {
  if (fix.kind !== "notify_crew") return [];
  const finding = findingOf(s, fix.findingId);
  if (!finding || finding.check !== "latest_change" || finding.severity !== "hold") return [];
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
        note: "crew acknowledged the dispatched position",
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
