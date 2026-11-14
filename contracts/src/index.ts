import { z } from "zod";
export * from "./acknowledgement";
export * from "./sheets";
export * from "./dismissals";

/*
 * DRAFT contracts. Owner: A. Confirm at kickoff; after that this file is FROZEN (see AGENTS.md).
 * Every lane imports types from here. Never redefine a shape locally.
 *
 * Units: metres, top-down floor plan, x to the east, y to the north.
 * Time: replay time, ISO 8601 local site time with seconds ("2026-11-13T17:40:00").
 *       Same format everywhere so strings sort in time order. Never wall-clock time.
 */

// ---------- Basics ----------

export const Id = z.string().min(1);
export const ReplayTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "replay time like 2026-11-13T17:40:00");
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "day like 2026-11-14");
export const Confidence = z.number().min(0).max(1);
/** Work slot within a day. Space clash = same place, same day, same slot. */
export const Slot = z.enum(["morning", "afternoon", "full_day"]);

// ---------- Chat ----------

export const SenderRole = z.enum(["superintendent", "architect", "office", "crew_lead", "crew", "system"]);

export const ChatMessage = z.object({
  id: Id,
  time: ReplayTime,
  /** Where it was said: "site-group", "office", "dm:crew-plumbing". Checks use it to tell who heard a change. */
  thread: z.string().min(1),
  senderName: z.string().min(1),
  senderRole: SenderRole,
  crewId: Id.optional(),
  text: z.string(),
  kind: z.enum(["text", "voice"]),
});

// ---------- Geometry ----------

export const Point = z.tuple([z.number(), z.number()]);

export const Geometry = z.discriminatedUnion("kind", [
  /** Walls: a centre line plus thickness. */
  z.object({ kind: z.literal("segment"), from: Point, to: Point, thickness: z.number().positive() }),
  /** Rooms and zones. */
  z.object({ kind: z.literal("polygon"), points: z.array(Point).min(3) }),
  /** Fixtures, doors as a point. */
  z.object({ kind: z.literal("point"), at: Point }),
]);

// ---------- Scene ----------

export const ElementState = z.enum(["planned", "proposed", "approved", "built", "unconfirmed", "conflict"]);
export const ElementType = z.enum(["wall", "room", "zone", "door", "window", "fixture"]);
export const OperationType = z.enum(["move", "add", "remove", "set_status", "plan_task"]);

/** One entry per change to an element. The starting floor uses a drawing id as source, e.g. "drawing:rev-B". */
export const ElementChange = z.object({
  version: z.number().int().positive(),
  time: ReplayTime,
  sourceMessageId: Id,
  thread: z.string(),
  operationType: OperationType,
  /** Geometry after this change, if it changed. */
  geometry: Geometry.optional(),
  /** State after this change, if it changed. */
  state: ElementState.optional(),
  confidence: Confidence,
});

export const Element = z.object({
  id: Id,
  type: ElementType,
  /** As a superintendent says it: "Unit 204 bathroom east wall". */
  name: z.string(),
  /** Nicknames crews use: "the blue room". Learning adds to these. */
  aliases: z.array(z.string()),
  geometry: Geometry,
  height: z.number().positive().optional(),
  state: ElementState,
  version: z.number().int().positive(),
  history: z.array(ElementChange).min(1),
});

export const Trade = z.enum(["drywall", "plumbing", "electrical", "painting", "tiling", "general"]);

export const Crew = z.object({
  id: Id,
  name: z.string(),
  trade: Trade,
  /** One letter badge, readable without colour. */
  letter: z.string().length(1),
  /** Threads this crew reads. A change said elsewhere has not reached them. */
  threads: z.array(z.string()),
});

export const TaskType = z.enum([
  "layout",
  "rough_in_plumbing",
  "rough_in_electrical",
  "inspection",
  "close_wall",
  "finish_drywall",
  "paint",
  "tile",
  "install_fixtures",
  "other",
]);

export const PlanTask = z.object({
  id: Id,
  crewId: Id,
  day: Day,
  slot: Slot,
  /** Order of this crew's tasks within the day. */
  order: z.number().int().nonnegative(),
  taskType: TaskType,
  description: z.string(),
  /** Room or zone element id. */
  placeId: Id,
  /** Elements the task touches. */
  elementIds: z.array(Id),
  status: z.enum(["planned", "done", "cancelled"]),
  sourceMessageId: Id,
  confidence: Confidence,
});

export const Scene = z.object({
  floorId: Id,
  name: z.string(),
  /** Replay time of the last applied operation. */
  time: ReplayTime,
  elements: z.array(Element),
  crews: z.array(Crew),
  /** All plan tasks across days. Use getPlan(scene, day) for one day. */
  tasks: z.array(PlanTask),
});

export const Plan = z.object({ day: Day, tasks: z.array(PlanTask) });

// ---------- Operations (the only five types; do not add one) ----------

const operationBase = {
  id: Id,
  time: ReplayTime,
  sourceMessageId: Id,
  /** Thread of the source message. */
  thread: z.string(),
  confidence: Confidence,
};

/** Fields a new element needs. History and version are set by the model. */
export const NewElement = Element.pick({ id: true, type: true, name: true, aliases: true, geometry: true, height: true, state: true });

/**
 * If extraction is unsure, it emits set_status "unconfirmed" with the confidence.
 * It never guesses a location or a direction.
 */
export const Operation = z.discriminatedUnion("type", [
  z.object({ ...operationBase, type: z.literal("move"), elementId: Id, to: Geometry, note: z.string().optional() }),
  z.object({ ...operationBase, type: z.literal("add"), element: NewElement }),
  z.object({ ...operationBase, type: z.literal("remove"), elementId: Id }),
  z.object({ ...operationBase, type: z.literal("set_status"), elementId: Id, state: ElementState }),
  z.object({ ...operationBase, type: z.literal("plan_task"), task: PlanTask }),
]);

/** What a crew says it will do. Every statement of intent is checked. */
export const CrewIntent = z.object({
  id: Id,
  crewId: Id,
  time: ReplayTime,
  sourceMessageId: Id,
  confidence: Confidence,
  day: Day,
  slot: Slot,
  taskType: TaskType,
  description: z.string(),
  /** Missing when the place is not clear. Never guessed. */
  placeId: Id.optional(),
  elementIds: z.array(Id),
});

/** One cache entry in data/llm-cache/<messageId>.json. */
export const ExtractResult = z.object({
  messageId: Id,
  operations: z.array(Operation),
  intents: z.array(CrewIntent),
});

// ---------- Findings and fixes ----------

export const CheckName = z.enum(["latest_change", "space_clash", "order_of_work", "open_decision"]);

/** Where the crew thinks the element is. The web draws it in redline next to the true element. */
export const Ghost = z.object({
  elementId: Id,
  geometry: Geometry,
  /** Dimension label between ghost and true element: "0.4 m east". */
  label: z.string(),
});

export const Finding = z.object({
  id: Id,
  check: CheckName,
  trigger: z.enum(["live", "rehearsal"]),
  severity: z.enum(["hold", "warn"]),
  time: ReplayTime,
  /** The message that triggered the finding (the crew's statement). No source, no finding. */
  sourceMessageId: Id,
  /** Messages that prove it, e.g. the change the crew missed. */
  evidenceMessageIds: z.array(Id),
  crewIds: z.array(Id).min(1),
  elementIds: z.array(Id),
  taskIds: z.array(Id),
  /** One sentence, worded "per the record", never as verified reality. */
  summary: z.string(),
  ghost: Ghost.optional(),
});

export const Fix = z.object({
  id: Id,
  findingId: Id,
  /** ask_crew: the crew is at risk and has said nothing. */
  kind: z.enum(["notify_crew", "reorder", "hold", "ask_crew"]),
  description: z.string(),
  /** Sent to crews once the superintendent approves. */
  messages: z.array(z.object({ crewId: Id, text: z.string() })).min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  sourceMessageId: Id,
});

// ---------- Rehearsal ----------

export const RehearsalFrame = z.object({
  step: z.number().int().nonnegative(),
  time: ReplayTime,
  activeTaskIds: z.array(Id),
  findings: z.array(Finding),
});

export const Rehearsal = z.object({ day: Day, frames: z.array(RehearsalFrame) });

// ---------- Learning ----------

const correctionBase = { id: Id, time: ReplayTime, sourceMessageId: Id };

export const Correction = z.discriminatedUnion("kind", [
  z.object({ ...correctionBase, kind: z.literal("location_alias"), alias: z.string(), elementId: Id }),
  z.object({ ...correctionBase, kind: z.literal("crew_misread"), crewId: Id, note: z.string() }),
  z.object({ ...correctionBase, kind: z.literal("fix_decision"), fixId: Id, approved: z.boolean() }),
]);

/** What extraction and checks receive from stored corrections. Alias keys are lower case. */
export const LearningContext = z.object({
  locationAliases: z.record(z.string(), Id),
  crewNotes: z.record(z.string(), z.array(z.string())),
});

// ---------- Replay ----------

export const ReplayEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), message: ChatMessage }),
  /** The evening rehearsal of a day's plan. */
  z.object({ kind: z.literal("rehearse"), time: ReplayTime, day: Day }),
]);

/** data/replay.golden.json. Events in time order. */
export const GoldenReplay = z.object({ id: Id, events: z.array(ReplayEvent) });

// ---------- Evaluation ----------

/** One case in data/labels.json. Written from the scenario sheet before checks run. */
export const LabelledCase = z.object({
  id: Id,
  check: CheckName,
  /** The message that should trigger a finding. */
  triggerMessageId: Id,
  crewIds: z.array(Id),
  elementIds: z.array(Id),
  note: z.string(),
});

export const LabelSet = z.object({ cases: z.array(LabelledCase) });

export const EvalCounts = z.object({
  caught: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  falseAlarms: z.number().int().nonnegative(),
});

/** eval/results.json, written only by npm run eval. */
export const EvalResults = z.object({
  replayId: Id,
  cases: z.number().int().nonnegative(),
  perCheck: z.record(CheckName, EvalCounts),
  total: EvalCounts,
});

// ---------- HTTP API ----------

/**
 * Bump when a route or a response shape changes. The server reports the value it started with
 * (GET /api/health); the web app compares it with its own copy and says so when the server is older,
 * instead of failing route by route.
 */
export const API_VERSION = 3;

export const HealthResponse = z.object({ ok: z.literal(true), liveLlm: z.boolean(), apiVersion: z.number().int().optional() });

/** GET /api/state?t=<ReplayTime> */
export const StateResponse = z.object({
  t: ReplayTime,
  scene: Scene,
  findings: z.array(Finding),
  fixes: z.array(Fix),
});

/** POST /api/message. The server sets id and replay time. */
export const PostMessageRequest = ChatMessage.omit({ id: true, time: true });
export const PostMessageResponse = z.object({
  message: ChatMessage,
  operations: z.array(Operation),
  intents: z.array(CrewIntent),
  findings: z.array(Finding),
  fixes: z.array(Fix),
});

/** GET /api/rehearsal?day=<Day> */
export const RehearsalResponse = Rehearsal;
/** GET /api/fixes */
export const FixesResponse = z.object({ fixes: z.array(Fix) });
/** POST /api/fixes/:id/approve */
export const ApproveFixResponse = z.object({ fix: Fix, sent: z.array(ChatMessage) });
export const ApiError = z.object({ error: z.string() });

// ---------- Crew questions (server/query) ----------

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

/** A crew's morning briefing for one day. Every line cites its source. */
export const CrewBriefing = z.object({
  crewId: Id,
  day: z.string(),
  tasks: z.array(
    z.object({
      taskId: Id,
      slot: z.string(),
      order: z.number(),
      description: z.string(),
      placeId: Id,
      sourceMessageId: Id,
      holds: z.array(
        z.object({
          findingId: Id,
          check: CheckName,
          severity: Finding.shape.severity,
          summary: z.string(),
          sourceMessageIds: z.array(Id),
        }),
      ),
    }),
  ),
  /** Changes to elements their tasks touch, after the crew last posted. `heard` = said in a thread they read. */
  changes: z.array(
    z.object({
      elementId: Id,
      name: z.string(),
      version: z.number(),
      time: z.string(),
      sourceMessageId: Id,
      thread: z.string(),
      heard: z.boolean(),
    }),
  ),
  /** When the crew last posted, if ever. */
  lastPosted: z.string().optional(),
  text: z.string(),
});

/** The superintendent's evening digest for one day. */
export const Digest = z.object({
  day: z.string(),
  counts: z.record(CheckName, z.object({ hold: z.number(), warn: z.number() })),
  openDecisions: z.array(z.object({ elementId: Id, name: z.string(), sourceMessageId: Id.optional() })),
  /** Crews with a finding on this day who have posted nothing since the risk entered the record. */
  silentCrews: z.array(z.object({ crewId: Id, name: z.string(), since: z.string() })),
  pendingFixes: z.array(z.object({ fixId: Id, kind: Fix.shape.kind, description: z.string() })),
  text: z.string(),
});

// ---------- Site agent (server/agent) ----------
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

export const EscalateAction = z.object({
  ...actionBase,
  kind: z.literal("escalate"),
  to: z.literal("superintendent"),
  findingId: Id.optional(),
  fixId: Id.optional(),
  text: z.string().min(1),
  urgency: z.enum(["now", "tonight"]),
});

export const Action = z.discriminatedUnion("kind", [
  z.object({
    ...actionBase,
    kind: z.literal("send_dm"),
    crewId: Id,
    text: z.string().min(1),
    reason: DmReason,
    findingId: Id.optional(),
  }),
  EscalateAction,
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

// ---------- Learning: places the record could not tell ----------

/** A message whose place could not be resolved; the superintendent maps the nickname. */
export const Unresolved = z.object({
  messageId: Id,
  crewId: Id.optional(),
  text: z.string(),
});

// ---------- HTTP API (added routes) ----------

/** GET /api/unresolved */
export const UnresolvedResponse = z.object({ items: z.array(Unresolved) });
/** GET /api/corrections: what the system has learned, oldest first. Read only. */
export const CorrectionsResponse = z.object({ corrections: z.array(Correction) });
/** GET /api/agent/log */
export const AgentLogResponse = z.object({ timeline: z.array(TimelineStep), escalations: z.array(EscalateAction) });
/** POST /api/ask body. */
export const AskRequest = z.object({ crewId: Id.optional(), text: z.string().min(1).max(500) });
/** POST /api/ask */
export const AskResponse = Answer;
/** GET /api/briefing?crew=&day= */
export const BriefingResponse = CrewBriefing;
/** GET /api/digest?day= */
export const DigestResponse = Digest;
/** POST /api/reset {keepLearning} */
export const ResetResponse = z.object({
  ok: z.literal(true),
  keepLearning: z.boolean(),
  /** crew_misread corrections stored from the run that just ended. */
  learnedCrews: z.number().int().nonnegative(),
  t: ReplayTime,
});

// ---------- Types ----------

export type Id = z.infer<typeof Id>;
export type ReplayTime = z.infer<typeof ReplayTime>;
export type Day = z.infer<typeof Day>;
export type Slot = z.infer<typeof Slot>;
export type SenderRole = z.infer<typeof SenderRole>;
export type ChatMessage = z.infer<typeof ChatMessage>;
export type Point = z.infer<typeof Point>;
export type Geometry = z.infer<typeof Geometry>;
export type ElementState = z.infer<typeof ElementState>;
export type ElementType = z.infer<typeof ElementType>;
export type OperationType = z.infer<typeof OperationType>;
export type ElementChange = z.infer<typeof ElementChange>;
export type Element = z.infer<typeof Element>;
export type Trade = z.infer<typeof Trade>;
export type Crew = z.infer<typeof Crew>;
export type TaskType = z.infer<typeof TaskType>;
export type PlanTask = z.infer<typeof PlanTask>;
export type Scene = z.infer<typeof Scene>;
export type Plan = z.infer<typeof Plan>;
export type NewElement = z.infer<typeof NewElement>;
export type Operation = z.infer<typeof Operation>;
export type CrewIntent = z.infer<typeof CrewIntent>;
export type ExtractResult = z.infer<typeof ExtractResult>;
export type CheckName = z.infer<typeof CheckName>;
export type Ghost = z.infer<typeof Ghost>;
export type Finding = z.infer<typeof Finding>;
export type Fix = z.infer<typeof Fix>;
export type RehearsalFrame = z.infer<typeof RehearsalFrame>;
export type Rehearsal = z.infer<typeof Rehearsal>;
export type Correction = z.infer<typeof Correction>;
export type LearningContext = z.infer<typeof LearningContext>;
export type ReplayEvent = z.infer<typeof ReplayEvent>;
export type GoldenReplay = z.infer<typeof GoldenReplay>;
export type LabelledCase = z.infer<typeof LabelledCase>;
export type LabelSet = z.infer<typeof LabelSet>;
export type EvalCounts = z.infer<typeof EvalCounts>;
export type EvalResults = z.infer<typeof EvalResults>;
export type HealthResponse = z.infer<typeof HealthResponse>;
export type StateResponse = z.infer<typeof StateResponse>;
export type PostMessageRequest = z.infer<typeof PostMessageRequest>;
export type PostMessageResponse = z.infer<typeof PostMessageResponse>;
export type RehearsalResponse = z.infer<typeof RehearsalResponse>;
export type FixesResponse = z.infer<typeof FixesResponse>;
export type ApproveFixResponse = z.infer<typeof ApproveFixResponse>;
export type ApiError = z.infer<typeof ApiError>;
export type Question = z.infer<typeof Question>;
export type StructuredQuery = z.infer<typeof StructuredQuery>;
export type Answer = z.infer<typeof Answer>;
export type CrewBriefing = z.infer<typeof CrewBriefing>;
export type Digest = z.infer<typeof Digest>;
export type DmReason = z.infer<typeof DmReason>;
export type EscalateAction = z.infer<typeof EscalateAction>;
export type Action = z.infer<typeof Action>;
export type CrewProfile = z.infer<typeof CrewProfile>;
export type TimelineStep = z.infer<typeof TimelineStep>;
export type Unresolved = z.infer<typeof Unresolved>;
export type UnresolvedResponse = z.infer<typeof UnresolvedResponse>;
export type CorrectionsResponse = z.infer<typeof CorrectionsResponse>;
export type AgentLogResponse = z.infer<typeof AgentLogResponse>;
export type AskRequest = z.infer<typeof AskRequest>;
export type AskResponse = z.infer<typeof AskResponse>;
export type BriefingResponse = z.infer<typeof BriefingResponse>;
export type DigestResponse = z.infer<typeof DigestResponse>;
export type ResetResponse = z.infer<typeof ResetResponse>;
