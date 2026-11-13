import type { ChatMessage, Correction, Crew, Finding, Fix, LearningContext } from "@site/contracts";
import type { CrewProfile } from "./schema";

// Owner: G. Crew reliability learned from what happened in a run. Pure and deterministic.
// A run's profiles become crew_misread corrections; the next run reads them back through
// LearningContext.crewNotes, so a crew that missed a change is watched from the start.

/** One missed change or one unanswered question puts a crew on watch. Tuned for a two-day site record. */
export const WATCH_MISSED = 1;
export const WATCH_UNANSWERED = 1;

/** Agent questions are messages with this id prefix (see runner.ts). */
export const ASK_PREFIX = "agent-ask~";
export const FOLLOW_UP_PREFIX = "agent-fu~";

/** Crew messages after `since` that the crew itself wrote. */
export const crewPostedAfter = (messages: ChatMessage[], crewId: string, since: string) =>
  messages.some((m) => m.crewId === crewId && m.senderRole !== "system" && m.time > since);

const uniq = (xs: string[]) => [...new Set(xs)].sort();

/**
 * Profiles from one run's record. missedChanges counts latest_change findings per (crew, element),
 * unansweredQuestions counts agent questions with no crew post after them, approvedFixes counts
 * approved fixes naming the crew.
 */
export function computeProfiles(
  crews: Crew[],
  findings: Finding[],
  fixes: Fix[],
  messages: ChatMessage[],
): CrewProfile[] {
  return [...crews]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((crew) => {
      const missed = new Map<string, string>(); // elementId -> source message
      for (const f of findings) {
        if (f.check !== "latest_change" || !f.crewIds.includes(crew.id)) continue;
        for (const el of f.elementIds) if (!missed.has(el)) missed.set(el, f.sourceMessageId);
      }
      const asks = messages.filter(
        (m) => m.crewId === crew.id && m.senderRole === "system" && m.id.startsWith(ASK_PREFIX),
      );
      const unanswered = asks.filter((m) => !crewPostedAfter(messages, crew.id, m.time));
      const approved = fixes.filter(
        (x) => x.status === "approved" && x.messages.some((m) => m.crewId === crew.id),
      );
      const missedChanges = missed.size;
      const unansweredQuestions = unanswered.length;
      return {
        crewId: crew.id,
        missedChanges,
        unansweredQuestions,
        approvedFixes: approved.length,
        risk: missedChanges >= WATCH_MISSED || unansweredQuestions >= WATCH_UNANSWERED ? "watch" : "normal",
        evidenceMessageIds: uniq([...missed.values(), ...unanswered.map((m) => m.id)]),
      } satisfies CrewProfile;
    });
}

/** Profiles read back from stored corrections: any crew with a note is on watch. */
export function profilesFromLearning(crews: Crew[], ctx: LearningContext): CrewProfile[] {
  return [...crews]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((crew) => {
      const notes = ctx.crewNotes[crew.id] ?? [];
      return {
        crewId: crew.id,
        missedChanges: 0,
        unansweredQuestions: 0,
        approvedFixes: 0,
        risk: notes.length > 0 ? "watch" : "normal",
        evidenceMessageIds: [],
      } satisfies CrewProfile;
    });
}

/** Whether the crew is on watch, from this run's profiles or from stored corrections. */
export function onWatch(crewId: string, profiles: CrewProfile[], ctx: LearningContext): boolean {
  return (
    profiles.some((p) => p.crewId === crewId && p.risk === "watch") || (ctx.crewNotes[crewId]?.length ?? 0) > 0
  );
}

/**
 * crew_misread corrections for every crew on watch, for learning.record at the end of a run.
 * Deterministic ids and wording; sourced from the first evidence message.
 */
export function suggestCorrections(profiles: CrewProfile[], time: string): Correction[] {
  return profiles
    .filter((p) => p.risk === "watch" && p.evidenceMessageIds.length > 0)
    .map((p) => {
      const parts: string[] = [];
      if (p.missedChanges > 0) parts.push(`missed ${p.missedChanges} change${p.missedChanges === 1 ? "" : "s"} said outside its threads`);
      if (p.unansweredQuestions > 0)
        parts.push(`left ${p.unansweredQuestions} question${p.unansweredQuestions === 1 ? "" : "s"} unanswered`);
      return {
        kind: "crew_misread" as const,
        id: `corr-watch-${p.crewId}`,
        time,
        sourceMessageId: p.evidenceMessageIds[0]!,
        crewId: p.crewId,
        note: `Per the record this crew ${parts.join(" and ")}. Send changes to it directly.`,
      };
    });
}
