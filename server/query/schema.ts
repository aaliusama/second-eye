import { z } from "zod";
import { Day, Finding, Id, ReplayTime, Slot, TaskType } from "@site/contracts";

// Owner: E. Shapes for "crews text the system and get answers from the record".
// Local to server/query until A lifts them into contracts/ (contracts are frozen during this run).

/** A crew (or anyone) texting the system. */
export const Question = z.object({
  id: Id,
  time: ReplayTime,
  crewId: Id.optional(),
  text: z.string().min(1),
});

/**
 * What the question asks, as facts the rules can answer. The LLM (or the keyword fallback) only
 * fills this in; every answer is computed by rules from the record.
 */
export const StructuredQuery = z.discriminatedUnion("kind", [
  /** "What's planned in 204 tomorrow?" */
  z.object({ kind: z.literal("whats_planned"), placeId: Id.optional(), day: Day.optional(), crewId: Id.optional() }),
  /** "Where is the 204 bath east wall now?" */
  z.object({ kind: z.literal("where_is"), elementId: Id }),
  /** "Anything changed in 204 since Wednesday?" */
  z.object({
    kind: z.literal("what_changed"),
    elementId: Id.optional(),
    placeId: Id.optional(),
    since: ReplayTime.optional(),
  }),
  /** "Who's in 206 Saturday morning?" */
  z.object({ kind: z.literal("who_is_in"), placeId: Id, day: Day, slot: Slot.optional() }),
  /** "Can we start roughing in 204 tomorrow morning?" Answered HOLD or CLEAR by the four checks. */
  z.object({ kind: z.literal("can_i_start"), crewId: Id, taskType: TaskType, placeId: Id, day: Day, slot: Slot }),
  /** Anything that needs someone to decide (design change, tile choice). Always escalated, never decided. */
  z.object({ kind: z.literal("decision_needed"), topic: z.string().min(1) }),
]);

export const Answer = z.object({
  questionId: Id,
  kind: z.enum(["answer", "escalated", "not_found"]),
  /** For the crew's phone. Leads with HOLD or CLEAR for can_i_start. Worded "per the record". */
  text: z.string(),
  /** Messages the answer rests on. Empty only for not_found and escalations with no record. */
  sourceMessageIds: z.array(Id),
  elementIds: z.array(Id),
  /** The query the answer was computed from, so a judge can see what was understood. */
  query: StructuredQuery.optional(),
  /** Findings from the checks (can_i_start). */
  findings: z.array(Finding).optional(),
  escalation: z.object({ to: z.literal("superintendent"), reason: z.string() }).optional(),
});

/** One file in server/query/cache/<key>.json. `query: null` means the parser could not tell what was asked. */
export const QueryCacheEntry = z.object({
  key: z.string().regex(/^[0-9a-f]{10}$/),
  text: z.string(),
  crewId: Id.optional(),
  query: StructuredQuery.nullable(),
  /** "llm": written by a real model call. "hand": written by a person; say so wherever it is shown. */
  source: z.enum(["llm", "hand"]),
  model: z.string().optional(),
});

/** POST /api/ask body. */
export const AskRequest = z.object({ crewId: Id.optional(), text: z.string().min(1).max(500) });

export type Question = z.infer<typeof Question>;
export type StructuredQuery = z.infer<typeof StructuredQuery>;
export type Answer = z.infer<typeof Answer>;
export type QueryCacheEntry = z.infer<typeof QueryCacheEntry>;
export type AskRequest = z.infer<typeof AskRequest>;
