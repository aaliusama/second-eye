import type { ChatMessage, Finding, Fix, LearningContext, Rehearsal, Scene } from "@site/contracts";
import { decide } from "./policy";
import { profilesFromLearning } from "./profiles";
import type { Action, CrewProfile, TimelineStep } from "./schema";
import { hourly } from "./time";

// Owner: G. Steps the replay clock and lets the policy act. Pure: returns the agent log and the
// DMs it sent; the caller decides whether to keep them. No wall clock, no randomness.

export interface AgentState {
  scene: Scene;
  messages: ChatMessage[];
  findings: Finding[];
  fixes: Fix[];
  rehearsals: Rehearsal[];
  learning: LearningContext;
  /** Profiles from earlier runs. Defaults to crews with stored crew_misread notes on watch. */
  crewProfiles?: CrewProfile[];
  /** Action ids that already ran (from an earlier runAgent call). */
  done?: string[];
}

export interface AgentRun {
  timeline: TimelineStep[];
  /** DMs and follow-ups the agent sent, as chat messages in dm:<crewId> threads. */
  sent: ChatMessage[];
  /** Escalations to the superintendent, in order. */
  escalations: Extract<Action, { kind: "escalate" }>[];
  /** Every action id that ran, for the next call's `done`. */
  done: string[];
}

/** The chat message a DM or follow-up becomes. Id "agent-<action id>" so decide() can see it was sent. */
export function toMessage(action: Extract<Action, { kind: "send_dm" | "follow_up" }>, time: string): ChatMessage {
  return {
    id: `agent-${action.id}`,
    time,
    thread: `dm:${action.crewId}`,
    senderName: "Second Eye",
    senderRole: "system",
    crewId: action.crewId,
    text: action.text,
    kind: "text",
  };
}

export function runAgent(state: AgentState, steps: string[]): AgentRun {
  const crewProfiles = state.crewProfiles ?? profilesFromLearning(state.scene.crews, state.learning);
  const done = new Set(state.done ?? []);
  let messages = [...state.messages];
  const timeline: TimelineStep[] = [];
  const sent: ChatMessage[] = [];
  const escalations: AgentRun["escalations"] = [];
  const queuedSeen = new Set<string>();

  for (const now of [...new Set(steps)].sort()) {
    const decided = decide({ ...state, now, messages, crewProfiles, done: [...done] });
    const actions = decided.filter((a) => a.due <= now);
    // Log a held action once, when it is first decided, not at every step of the night.
    const queued = decided.filter((a) => a.due > now && !queuedSeen.has(a.id));
    for (const a of queued) queuedSeen.add(a.id);
    for (const a of actions) {
      done.add(a.id);
      if (a.kind === "send_dm" || a.kind === "follow_up") {
        const m = toMessage(a, now);
        sent.push(m);
        messages = [...messages, m].sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
      }
      if (a.kind === "escalate") escalations.push(a);
    }
    if (actions.length > 0 || queued.length > 0) timeline.push({ time: now, actions, queued });
  }

  return { timeline, sent, escalations, done: [...done].sort() };
}

/**
 * Clock steps for a record: every message time and every full hour from the first message
 * to `until`. Finer steps catch actions sooner; the policy does not depend on the step size.
 */
export function stepsFor(messages: ChatMessage[], until: string): string[] {
  const times = messages.map((m) => m.time).filter((t) => t <= until).sort();
  if (times.length === 0) return [until];
  return [...new Set([...times, ...hourly(times[0]!, until), until])].sort();
}
