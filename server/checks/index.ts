import type { CheckName, CrewIntent, Element, Finding, Id, Plan, PlanTask, Scene, Slot, TaskType } from "@site/contracts";
import { knownGeometry, moveLabel, sameGeometry, unheardGeometryChanges } from "./geometry";
import { HOLD_ON_OPEN_DECISION, PREREQUISITES, slotsOverlap, strictlyBefore, taskLabel } from "./rules";

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
    out.push(
      finding(ctx, "latest_change", elementId, work, {
        severity: "hold",
        evidenceMessageIds: missed.map((m) => m.sourceMessageId),
        crewIds: [work.crewId],
        elementIds: [elementId],
        taskIds: work.taskIds,
        summary: `Per the record, ${el.name} moved ${label} in the ${threads} thread, which ${crew.name} does not read, so their ${taskLabel(work.taskType)} may follow the old line.`,
        ghost: { elementId, geometry: heard, label },
      }),
    );
  }
  return out;
}

/** order_of_work: prerequisites from rules.ts on the same place. */
function orderOfWork(ctx: Ctx, work: Work): Finding[] {
  const rule = PREREQUISITES[work.taskType];
  if (!rule || work.placeId === undefined) return [];
  const prereqs = ctx.tasks.filter((t) => t.placeId === work.placeId && t.taskType === rule.before && t.id !== work.taskId);
  if (prereqs.length === 0 && !rule.mandatory) return [];
  const satisfied = prereqs.some((t) => t.status === "done" || strictlyBefore(t.day, t.slot, work.day, work.slot));
  if (satisfied) return [];
  const place = elementName(ctx.scene, work.placeId);
  const summary =
    prereqs.length === 0
      ? `Per the record, ${crewName(ctx.scene, work.crewId)} plans to ${taskLabel(work.taskType)} in ${place} with no ${taskLabel(rule.before)} on record for it.`
      : `Per the record, ${crewName(ctx.scene, work.crewId)} plans to ${taskLabel(work.taskType)} in ${place} before the ${taskLabel(rule.before)} there is done.`;
  return [
    finding(ctx, "order_of_work", work.taskId ?? work.placeId, work, {
      severity: "hold",
      evidenceMessageIds: prereqs.map((t) => t.sourceMessageId),
      crewIds: [work.crewId, ...prereqs.map((t) => t.crewId)],
      elementIds: [work.placeId, ...work.elementIds],
      taskIds: [...work.taskIds, ...prereqs.map((t) => t.id)],
      summary,
    }),
  ];
}

/** open_decision: the work touches an element (elementIds or placeId) still "proposed". */
function openDecision(ctx: Ctx, work: Work): Finding[] {
  const touched = uniqSorted([...work.elementIds, ...(work.placeId !== undefined ? [work.placeId] : [])]);
  const out: Finding[] = [];
  for (const elementId of touched) {
    const el = elementOf(ctx.scene, elementId);
    if (!el || el.state !== "proposed") continue;
    const proposedBy = [...el.history].sort((a, b) => b.version - a.version).find((h) => h.state === "proposed");
    out.push(
      finding(ctx, "open_decision", elementId, work, {
        severity: HOLD_ON_OPEN_DECISION.has(work.taskType) ? "hold" : "warn",
        evidenceMessageIds: proposedBy ? [proposedBy.sourceMessageId] : [],
        crewIds: [work.crewId],
        elementIds: [elementId],
        taskIds: work.taskIds,
        summary: `Per the record, ${el.name} is still only proposed, and ${crewName(ctx.scene, work.crewId)} plans to ${taskLabel(work.taskType)} on it.`,
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
  if (work.placeId === undefined) return [];
  return ctx.tasks
    .filter(
      (t) => t.status === "planned" && t.crewId !== work.crewId && t.day === work.day && t.placeId === work.placeId && slotsOverlap(t.slot, work.slot),
    )
    .map((t) =>
      finding(ctx, "space_clash", t.id, work, {
        severity: "hold",
        evidenceMessageIds: [t.sourceMessageId],
        crewIds: [work.crewId, t.crewId],
        elementIds: [work.placeId!],
        taskIds: [...work.taskIds, t.id],
        summary: clashSummary(ctx, work.crewId, t.crewId, work.placeId!, work.day),
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
      out.push(
        finding(ctx, "space_clash", b.id, taskToWork(a), {
          severity: "hold",
          evidenceMessageIds: [b.sourceMessageId],
          crewIds: [a.crewId, b.crewId],
          elementIds: [a.placeId],
          taskIds: [a.id, b.id],
          summary: clashSummary(ctx, a.crewId, b.crewId, a.placeId, a.day),
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
