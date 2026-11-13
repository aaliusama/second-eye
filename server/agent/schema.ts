import { z } from "zod";
import { Id, ReplayTime } from "@site/contracts";

// Owner: G (site agent). Local shapes for the autonomous loop. The lead lifts these into contracts/ later.
// Every action cites at least one source message. No source, no action.

const actionBase = {
  /** Deterministic: same situation, same id. Used to dedupe across clock steps. */
  id: Id,
  /** Replay time the action may run. Later than `now` when quiet hours push it to 06:00. */
  due: ReplayTime,
  sourceMessageIds: z.array(Id).min(1),
};

export const DmReason = z.enum([
  /** Listen step: a silent crew is asked to confirm its plan (an ask_crew fix). */
  "listen_question",
  /** The superintendent approved a fix; the crew is reminded at the start of the work day. */
  "approved_fix_reminder",
  /** CLEAR at 06:00: the crew's day has no open issues per the record. */
  "morning_briefing",
  /** CLEAR after the record shows a risk is gone. */
  "clear",
  /** Learning loop: a crew on watch gets a change the moment it lands, before it states intent. */
  "watch_crew_change",
]);

export const Action = z.discriminatedUnion("kind", [
  z.object({
    ...actionBase,
    kind: z.literal("send_dm"),
    crewId: Id,
    text: z.string().min(1),
    reason: DmReason,
    findingId: Id.optional(),
  }),
  z.object({
    ...actionBase,
    kind: z.literal("escalate"),
    to: z.literal("superintendent"),
    findingId: Id.optional(),
    fixId: Id.optional(),
    text: z.string().min(1),
    urgency: z.enum(["now", "tonight"]),
  }),
  z.object({
    ...actionBase,
    kind: z.literal("follow_up"),
    crewId: Id,
    findingId: Id,
    /** The agent message that asked the question. */
    questionMessageId: Id,
    text: z.string().min(1),
  }),
  z.object({
    ...actionBase,
    kind: z.literal("auto_resolve"),
    findingId: Id,
    reason: z.string().min(1),
  }),
]);

export const CrewProfile = z.object({
  crewId: Id,
  /** latest_change findings against this crew (one per element). */
  missedChanges: z.number().int().nonnegative(),
  /** Agent questions this crew never answered. */
  unansweredQuestions: z.number().int().nonnegative(),
  approvedFixes: z.number().int().nonnegative(),
  risk: z.enum(["normal", "watch"]),
  /** Messages that justify the profile. */
  evidenceMessageIds: z.array(Id),
});

export const TimelineStep = z.object({
  time: ReplayTime,
  /** Actions that ran at this step. */
  actions: z.array(Action),
  /** Actions decided now but held until later (quiet hours). */
  queued: z.array(Action),
});

export type DmReason = z.infer<typeof DmReason>;
export type Action = z.infer<typeof Action>;
export type CrewProfile = z.infer<typeof CrewProfile>;
export type TimelineStep = z.infer<typeof TimelineStep>;
