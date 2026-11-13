import type { CheckName, CrewIntent, Element, Finding, Id, Plan, PlanTask, Scene, Slot, TaskType } from "@site/contracts";
import { inside, knownGeometry, midpoint, moveLabel, sameGeometry, unheardGeometryChanges } from "./geometry";
import {
  DECISION_INSIDE_PLACE,
  HOLD_ON_OPEN_DECISION,
  PREREQUISITES,
  UNSURE_BELOW,
  slotsOverlap,
  strictlyBefore,
  taskLabel,
} from "./rules";

// Owner: C. The four deterministic checks, rehearsal and fix proposals.
// Pure functions of scene + plan (+ intent). No LLM, no randomness, no wall-clock time.

/** One piece of work to check: a crew's intent (live) or a plan task (rehearsal). */
interface Work {
  crewId: Id;
  day: string;
  slot: Slot;
  taskType: TaskType;
  placeId?: Id;
  elementIds: Id[];
  sourceMessageId: Id;
  /** Confidence of the statement or plan task. */
  confidence: number;
  /** Set for plan tasks; undefined for a live intent. */
  taskId?: Id;
  /** Plan tasks this work stands for (the task itself, or the crew's matching tasks for an intent). */
  taskIds: Id[];
}

interface Ctx {
  scene: Scene;
  trigger: Finding["trigger"];
  time: Finding["time"];
  /** Every known non-cancelled task: scene.tasks plus plan.tasks, by id. */
  tasks: PlanTask[];
}

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort();

/**
 * Live trigger: pass the crew's intent. Evening trigger: no intent, check the whole plan.
 * Checks: latest_change, space_clash, order_of_work, open_decision. Output sorted by id, no duplicates.
 */
export function runChecks(scene: Scene, plan: Plan, intent?: CrewIntent): Finding[] {
  const byId = new Map<Id, PlanTask>();
  for (const t of [...scene.tasks, ...plan.tasks]) if (t.status !== "cancelled") byId.set(t.id, t);
  const ctx: Ctx = {
    scene,
    trigger: intent ? "live" : "rehearsal",
    time: intent ? intent.time : scene.time,
    tasks: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };

  const findings: Finding[] = [];
  if (intent) {
    const work: Work = {
      crewId: intent.crewId,
      day: intent.day,
      slot: intent.slot,
      taskType: intent.taskType,
      placeId: intent.placeId,
      elementIds: intent.elementIds,
      sourceMessageId: intent.sourceMessageId,
      confidence: intent.confidence,
      taskIds: plan.tasks
        .filter(
          (t) =>
            t.status !== "cancelled" &&
            t.crewId === intent.crewId &&
            t.day === intent.day &&
            ((intent.placeId !== undefined && t.placeId === intent.placeId) ||
              t.elementIds.some((e) => intent.elementIds.includes(e))),
        )
        .map((t) => t.id),
    };
    findings.push(...checkWork(ctx, work));
    findings.push(...spaceClashLive(ctx, work));
  } else {
    const planTasks = plan.tasks.filter((t) => t.status === "planned");
    for (const t of planTasks) findings.push(...checkWork(ctx, taskToWork(t)));
    findings.push(...spaceClashRehearsal(ctx, planTasks));
  }
  return mergeById(findings);
}

function taskToWork(t: PlanTask): Work {
  return {
    crewId: t.crewId,
    day: t.day,
    slot: t.slot,
    taskType: t.taskType,
    placeId: t.placeId,
    elementIds: t.elementIds,
    sourceMessageId: t.sourceMessageId,
    confidence: t.confidence,
    taskId: t.id,
    taskIds: [t.id],
  };
}

/** Checks that look at one piece of work alone. */
function checkWork(ctx: Ctx, work: Work): Finding[] {
  return [...latestChange(ctx, work), ...orderOfWork(ctx, work), ...openDecision(ctx, work)];
}

function finding(
  ctx: Ctx,
  check: CheckName,
  key: string,
  work: Work,
  fields: Pick<Finding, "severity" | "evidenceMessageIds" | "crewIds" | "elementIds" | "taskIds" | "summary"> & {
    ghost?: Finding["ghost"];
  },
): Finding {
  const f: Finding = {
    id: `f-${check}-${work.sourceMessageId}-${key}`,
    check,
    trigger: ctx.trigger,
    severity: fields.severity,
    time: ctx.time,
    sourceMessageId: work.sourceMessageId,
    evidenceMessageIds: uniqSorted(fields.evidenceMessageIds),
    crewIds: uniqSorted(fields.crewIds),
    elementIds: uniqSorted(fields.elementIds),
    taskIds: uniqSorted(fields.taskIds),
    summary: fields.summary,
  };
  if (fields.ghost) f.ghost = fields.ghost;
  return f;
}

const crewName = (scene: Scene, id: Id) => scene.crews.find((c) => c.id === id)?.name ?? id;
const elementOf = (scene: Scene, id: Id | undefined): Element | undefined =>
  id === undefined ? undefined : scene.elements.find((e) => e.id === id);
const elementName = (scene: Scene, id: Id | undefined) => elementOf(scene, id)?.name ?? id ?? "an unclear place";
/** A place id that is not an element on record is not a place: no clash or order finding on it. */
const knownPlace = (scene: Scene, id: Id | undefined): id is Id => elementOf(scene, id) !== undefined;

const UNSURE_NOTE = " The record is unsure here, so this is a warning to confirm, not a hold.";

/**
 * A finding resting on an unsure entry is never a confident hold: any confidence below UNSURE_BELOW
 * (statement, plan task or change) or any element involved in state "unconfirmed".
 */
function unsure(ctx: Ctx, confidences: number[], elementIds: (Id | undefined)[]): boolean {
  return (
    confidences.some((c) => c < UNSURE_BELOW) ||
    elementIds.some((id) => elementOf(ctx.scene, id)?.state === "unconfirmed")
  );
}

/** Severity and summary, downgraded to a warn with a note when the finding rests on something unsure. */
function sure(severity: Finding["severity"], summary: string, isUnsure: boolean): Pick<Finding, "severity" | "summary"> {
  return isUnsure ? { severity: "warn", summary: summary + UNSURE_NOTE } : { severity, summary };
}

/** Two pieces of work are on the same place: same place id, or a shared element (the 203 wall named either way). */
const samePlace = (t: PlanTask, work: Work) =>
  t.placeId === work.placeId || t.elementIds.some((e) => work.elementIds.includes(e));

/** latest_change: the crew's heard geometry of a touched element differs from the current one. */
function latestChange(ctx: Ctx, work: Work): Finding[] {
  const crew = ctx.scene.crews.find((c) => c.id === work.crewId);
  if (!crew) return [];
  const out: Finding[] = [];
  for (const elementId of uniqSorted(work.elementIds)) {
    const el = elementOf(ctx.scene, elementId);
    if (!el) continue;
    const heard = knownGeometry(el, crew);
    if (sameGeometry(heard, el.geometry)) continue;
    const missed = unheardGeometryChanges(el, crew);
    if (missed.length === 0) continue; // differs without an unheard source: no source, no finding
    const label = moveLabel(heard, el.geometry);
    const threads = uniqSorted(missed.map((m) => m.thread)).join(", ");
    const summary = `Per the record, ${el.name} moved ${label} in the ${threads} thread, which ${crew.name} does not read, so their ${taskLabel(work.taskType)} may follow the old line.`;
    out.push(
      finding(ctx, "latest_change", elementId, work, {
        ...sure("hold", summary, unsure(ctx, [work.confidence, ...missed.map((m) => m.confidence)], [elementId, work.placeId])),
        evidenceMessageIds: missed.map((m) => m.sourceMessageId),
        crewIds: [work.crewId],
        elementIds: [elementId],
        taskIds: work.taskIds,
        ghost: { elementId, geometry: heard, label },
      }),
    );
  }
  return out;
}

/** order_of_work: prerequisites from rules.ts on the same place. */
function orderOfWork(ctx: Ctx, work: Work): Finding[] {
  const rule = PREREQUISITES[work.taskType];
  if (!rule || !knownPlace(ctx.scene, work.placeId)) return [];
  const prereqs = ctx.tasks.filter((t) => samePlace(t, work) && t.taskType === rule.before && t.id !== work.taskId);
  if (prereqs.length === 0 && !rule.mandatory) return [];
  // The crew's own position in the day: the plan task itself, or the lowest order among its matching tasks (live).
  const ownOrders = ctx.tasks
    .filter((t) => work.taskIds.includes(t.id) && t.crewId === work.crewId && t.taskType === work.taskType)
    .map((t) => t.order);
  const ownOrder = ownOrders.length > 0 ? Math.min(...ownOrders) : undefined;
  // Same crew, same day and slot, earlier in its own order: the crew does the prerequisite first itself.
  const sameCrewEarlier = (t: PlanTask) =>
    ownOrder !== undefined && t.crewId === work.crewId && t.day === work.day && t.slot === work.slot && t.order < ownOrder;
  const satisfied = prereqs.some(
    (t) => t.status === "done" || strictlyBefore(t.day, t.slot, work.day, work.slot) || sameCrewEarlier(t),
  );
  if (satisfied) return [];
  const place = elementName(ctx.scene, work.placeId);
  const summary =
    prereqs.length === 0
      ? `Per the record, ${crewName(ctx.scene, work.crewId)} plans to ${taskLabel(work.taskType)} in ${place} with no ${taskLabel(rule.before)} on record for it.`
      : `Per the record, ${crewName(ctx.scene, work.crewId)} plans to ${taskLabel(work.taskType)} in ${place} before the ${taskLabel(rule.before)} there is done.`;
  return [
    finding(ctx, "order_of_work", work.taskId ?? work.placeId, work, {
      ...sure("hold", summary, unsure(ctx, [work.confidence, ...prereqs.map((t) => t.confidence)], [work.placeId])),
      evidenceMessageIds: prereqs.map((t) => t.sourceMessageId),
      crewIds: [work.crewId, ...prereqs.map((t) => t.crewId)],
      elementIds: [work.placeId, ...work.elementIds],
      taskIds: [...work.taskIds, ...prereqs.map((t) => t.id)],
    }),
  ];
}

/**
 * open_decision: the work touches an element (elementIds or placeId) still "proposed". For tile and fixture work,
 * a proposed fixture or zone inside the place counts too (the 205 tile choice when tiling names only the unit).
 */
function openDecision(ctx: Ctx, work: Work): Finding[] {
  const place = elementOf(ctx.scene, work.placeId);
  const insidePlace =
    place && DECISION_INSIDE_PLACE.has(work.taskType)
      ? ctx.scene.elements
          .filter((e) => e.id !== place.id && (e.type === "fixture" || e.type === "zone") && e.state === "proposed")
          .filter((e) => inside(midpoint(e.geometry), place.geometry))
          .map((e) => e.id)
      : [];
  const touched = uniqSorted([...work.elementIds, ...(work.placeId !== undefined ? [work.placeId] : []), ...insidePlace]);
  const out: Finding[] = [];
  for (const elementId of touched) {
    const el = elementOf(ctx.scene, elementId);
    if (!el || el.state !== "proposed") continue;
    const proposedBy = [...el.history].sort((a, b) => b.version - a.version).find((h) => h.state === "proposed");
    const summary = `Per the record, ${el.name} is still only proposed, and ${crewName(ctx.scene, work.crewId)} plans to ${taskLabel(work.taskType)} on it.`;
    const severity = HOLD_ON_OPEN_DECISION.has(work.taskType) ? "hold" : "warn";
    out.push(
      finding(ctx, "open_decision", elementId, work, {
        ...sure(severity, summary, severity === "hold" && unsure(ctx, [work.confidence], [work.placeId])),
        evidenceMessageIds: proposedBy ? [proposedBy.sourceMessageId] : [],
        crewIds: [work.crewId],
        elementIds: [elementId],
        taskIds: work.taskIds,
      }),
    );
  }
  return out;
}

function clashSummary(ctx: Ctx, crewA: Id, crewB: Id, placeId: Id, day: string): string {
  return `Per the record, ${crewName(ctx.scene, crewA)} and ${crewName(ctx.scene, crewB)} are both planned in ${elementName(ctx.scene, placeId)} at the same time on ${day}.`;
}

/** space_clash (live): the intent against other crews' tasks on the same day, place and overlapping slot. */
function spaceClashLive(ctx: Ctx, work: Work): Finding[] {
  if (!knownPlace(ctx.scene, work.placeId)) return [];
  return ctx.tasks
    .filter(
      (t) => t.status === "planned" && t.crewId !== work.crewId && t.day === work.day && t.placeId === work.placeId && slotsOverlap(t.slot, work.slot),
    )
    .map((t) =>
      finding(ctx, "space_clash", t.id, work, {
        ...sure("hold", clashSummary(ctx, work.crewId, t.crewId, work.placeId!, work.day), unsure(ctx, [work.confidence, t.confidence], [work.placeId])),
        evidenceMessageIds: [t.sourceMessageId],
        crewIds: [work.crewId, t.crewId],
        elementIds: [work.placeId!],
        taskIds: [...work.taskIds, t.id],
      }),
    );
}

/** space_clash (rehearsal): each clashing pair once, sourced from the task with the smaller id. */
function spaceClashRehearsal(ctx: Ctx, tasks: PlanTask[]): Finding[] {
  const sorted = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
  const out: Finding[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.crewId === b.crewId || a.day !== b.day || a.placeId !== b.placeId || !slotsOverlap(a.slot, b.slot)) continue;
      if (!knownPlace(ctx.scene, a.placeId)) continue;
      out.push(
        finding(ctx, "space_clash", b.id, taskToWork(a), {
          ...sure("hold", clashSummary(ctx, a.crewId, b.crewId, a.placeId, a.day), unsure(ctx, [a.confidence, b.confidence], [a.placeId])),
          evidenceMessageIds: [b.sourceMessageId],
          crewIds: [a.crewId, b.crewId],
          elementIds: [a.placeId],
          taskIds: [a.id, b.id],
        }),
      );
    }
  }
  return out;
}

/** Same id twice (e.g. two tasks from one message): keep the first, union the id lists. Sort by id. */
function mergeById(findings: Finding[]): Finding[] {
  const map = new Map<Id, Finding>();
  for (const f of findings) {
    const prev = map.get(f.id);
    if (!prev) {
      map.set(f.id, f);
      continue;
    }
    prev.crewIds = uniqSorted([...prev.crewIds, ...f.crewIds]);
    prev.elementIds = uniqSorted([...prev.elementIds, ...f.elementIds]);
    prev.taskIds = uniqSorted([...prev.taskIds, ...f.taskIds]);
    prev.evidenceMessageIds = uniqSorted([...prev.evidenceMessageIds, ...f.evidenceMessageIds]);
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export { rehearse } from "./rehearse";
export { proposeFixes } from "./fixes";
