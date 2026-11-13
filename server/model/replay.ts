import type { ChatMessage, Finding, Fix, GoldenReplay, Rehearsal, Scene } from "@site/contracts";
import { proposeFixes, rehearse, runChecks } from "../checks/index";
import { extract } from "../extract/index";
import * as learning from "../learning/index";
import { logLine } from "../log";
import { applyOperations, getPlan } from "./index";

// Owner: A. The replay clock and the pipeline: message -> extract -> model -> checks -> fixes.

export interface ReplayState {
  t: string;
  scene: Scene;
  messages: ChatMessage[];
  findings: Finding[];
  fixes: Fix[];
  rehearsals: Rehearsal[];
  /** Messages with an intent whose place could not be told (learning.resolvePlaces). */
  unresolved: learning.Unresolved[];
}

/** Play the golden replay up to replay time `until` (inclusive). Same input, same output. */
export async function runReplay(replay: GoldenReplay, start: Scene, until?: string): Promise<ReplayState> {
  const state: ReplayState = { t: start.time, scene: start, messages: [], findings: [], fixes: [], rehearsals: [], unresolved: [] };

  for (const event of replay.events) {
    const at = event.kind === "message" ? event.message.time : event.time;
    if (until !== undefined && at > until) break;
    state.t = at;

    if (event.kind === "message") {
      const message = event.message;
      state.messages.push(message);
      const ctx = learning.getContext();
      const resolved = learning.resolvePlaces(await extract(message, ctx), message, state.scene, ctx);
      const result = resolved.result;
      for (const u of resolved.unresolved) logLine({ kind: "learning.unresolved", ...u });
      state.unresolved.push(...resolved.unresolved);
      for (const op of result.operations) logLine({ kind: "operation", operation: op });
      state.scene = applyOperations(state.scene, result.operations);

      for (const intent of result.intents) {
        const found = runChecks(state.scene, getPlan(state.scene, intent.day), intent);
        for (const finding of found) logLine({ kind: "finding", finding });
        state.findings.push(...found);
        state.fixes.push(...proposeFixes(found, state.scene, state.messages));
      }
    } else {
      const rehearsal = rehearse(state.scene, getPlan(state.scene, event.day));
      for (const frame of rehearsal.frames) for (const finding of frame.findings) logLine({ kind: "finding", finding });
      state.rehearsals.push(rehearsal);
      // Evening fixes: each finding once (frames repeat full_day findings), first fix per id wins.
      const unique = [...new Map(rehearsal.frames.flatMap((fr) => fr.findings).map((f) => [f.id, f])).values()];
      const known = new Set(state.fixes.map((x) => x.id));
      state.fixes.push(...proposeFixes(unique, state.scene, state.messages).filter((x) => !known.has(x.id)));
    }
  }

  return state;
}
