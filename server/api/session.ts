import {
  Correction,
  PostMessageRequest,
  type ApproveFixResponse,
  type ChatMessage,
  type Finding,
  type Fix,
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

// Owner: A. The live session: golden replay once, then crew chat posted from the web on top.
// Deterministic: live message n is stamped replay end + n minutes. No wall clock, no randomness.

export interface Session {
  /** Replay time at the end of the golden replay. Live messages count from here. */
  t: string;
  scene: Scene;
  messages: ChatMessage[];
  findings: Finding[];
  fixes: Fix[];
  rehearsals: Rehearsal[];
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

export function postMessage(req: PostMessageRequest): Promise<PostMessageResponse> {
  const body = PostMessageRequest.parse(req);
  return serial(async () => {
    const s = await getSession();
    const n = s.liveCount + 1;
    const message: ChatMessage = { ...body, id: `live-${n}`, time: addMinutes(s.t, n) };

    const result = await extract(message, learning.getContext());
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
    if (findings.length > 0) {
      logLine({ kind: "api.message", messageId: message.id, findings: findings.length, fixes: fixes.length });
    }
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
      logLine({ kind: "api.fix_approved", fixId: fix.id, sent: sent.map((m) => m.id) });
    }
    return { fix: structuredClone(fix), sent };
  });
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
