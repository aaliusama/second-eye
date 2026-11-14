import { z } from "zod";
import { ElementState, Slot, TaskType } from "@site/contracts";

// Owner: B. What the LLM is allowed to say about one message: facts only, no ids it invents,
// no coordinates. toResult (result.ts) turns facts into contract operations and intents by rule.
// Internal to server/extract; the contract shape the rest of the system sees is ExtractResult.

const Conf = z.number().min(0).max(1);

export const PlanFact = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: Slot,
  taskType: TaskType,
  /** Room or zone id from the floor list, or null when the words do not name one (nicknames included). */
  placeId: z.string().nullable(),
  /** The place as the crew said it, e.g. "the blue room". */
  placeSaid: z.string().nullable().optional(),
  elementIds: z.array(z.string()).default([]),
  description: z.string(),
  /** "cancelled": the crew drops or moves away from a plan it stated before. */
  status: z.enum(["planned", "cancelled"]).optional(),
  confidence: Conf,
});

export const MoveFact = z.object({
  kind: z.literal("move"),
  elementId: z.string(),
  /** null when the message does not say which way. Never guessed. */
  direction: z.enum(["north", "south", "east", "west"]).nullable(),
  metres: z.number().positive().nullable(),
  confidence: Conf,
});

export const StatusFact = z.object({
  kind: z.literal("status"),
  elementId: z.string(),
  state: ElementState.exclude(["planned", "conflict"]),
  confidence: Conf,
});

export const MessageFacts = z.object({
  id: z.string(),
  plans: z.array(PlanFact).default([]),
  changes: z.array(z.discriminatedUnion("kind", [MoveFact, StatusFact])).default([]),
});

export const BatchReply = z.object({ results: z.array(MessageFacts) });

export type PlanFact = z.infer<typeof PlanFact>;
export type MessageFacts = z.infer<typeof MessageFacts>;
