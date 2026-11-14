import type { CheckName, CrewIntent, Element, Finding, Id, Plan, PlanTask, Scene, Slot, TaskType } from "@site/contracts";
import { inside, knownGeometry, midpoint, moveLabel, sameGeometry, unheardGeometryChanges } from "./geometry";
import { DEFAULT_RULE, RULE } from "./rule-refs";
import type { Overlap } from "@site/contracts";
import { OVERLAP_RULE } from "./geometry-rules";
import { measureClearance, measureOverlap, workZone } from "./measure";
import {
  DECISION_INSIDE_PLACE,
  HOLD_ON_OPEN_DECISION,
  PREREQUISITES,
  UNSURE_BELOW,
  slotsOverlap,
  taskLabel,
} from "./rules";
import { finishesBefore, prerequisiteCandidates, type Step } from "./graph";

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
    measure?: Finding["measure"];
    /** Defaults to the check's one rule (rule-refs.ts). */
    rule?: Finding["rule"];
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
  if (fields.measure) f.measure = fields.measure;
  const rule = fields.rule ?? DEFAULT_RULE[check];
  if (rule) f.rule = rule;
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

/**
 * latest_change: the crew's heard geometry of a touched element differs from the current one.
 * Walls are measured (measure.ts): the perpendicular offset of the face the crew works on, the outcome
 * (inside the recorded wall, gap, within tolerance) and severity from that distance (geometry-rules.ts).
 * Anything that is not a wall keeps the plain hold.
 */
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
    const measured = measureClearance({
      name: el.name,
      crewName: crew.name,
      taskType: work.taskType,
      believed: heard,
      recorded: el.geometry,
      place: elementOf(ctx.scene, work.placeId)?.geometry,
    });
    const base = `Per the record, ${el.name} moved ${label} in the ${threads} thread, which ${crew.name} does not read, so their ${taskLabel(work.taskType)} may follow the old line`;
    const summary = measured ? `${base} and ${measured.clause}.` : `${base}.`;
    out.push(
      finding(ctx, "latest_change", elementId, work, {
        ...sure(measured?.severity ?? "hold", summary, unsure(ctx, [work.confidence, ...missed.map((m) => m.confidence)], [elementId, work.placeId])),
        evidenceMessageIds: missed.map((m) => m.sourceMessageId),
        crewIds: [work.crewId],
        elementIds: [elementId],
        taskIds: work.taskIds,
        ghost: { elementId, geometry: heard, label },
        ...(measured ? { measure: { clearance: measured.clearance } } : {}),
      }),
    );
  }
  return out;
}

/**
 * order_of_work: prerequisites from rules.ts on the same place. Same edge rule as the plan graph
 * (graph.ts): a finding is a violated prerequisite edge, or a mandatory one with nothing on record.
 */
function orderOfWork(ctx: Ctx, work: Work): Finding[] {
  const rule = PREREQUISITES[work.taskType];
  if (!rule || !knownPlace(ctx.scene, work.placeId)) return [];
  // The crew's own position in the day: the plan task itself, or the lowest order among its matching tasks (live).
  const ownOrders = ctx.tasks
    .filter((t) => work.taskIds.includes(t.id) && t.crewId === work.crewId && t.taskType === work.taskType)
    .map((t) => t.order);
  const step: Step = { ...work, id: work.taskId, order: ownOrders.length > 0 ? Math.min(...ownOrders) : undefined };
  const prereqs = prerequisiteCandidates(ctx.tasks, step, rule);
  if (prereqs.length === 0 && !rule.mandatory) return [];
  const satisfied = prereqs.some((t) => finishesBefore(t, step));
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
      rule: prereqs.length === 0 ? RULE.prerequisiteMissing : RULE.prerequisiteLater,
    }),
  ];
}

/**
 * open_decision: the work touches an element (elementIds or placeId) still "proposed". A task-relevant
 * proposed material or fixture inside the place counts too when the work names only the place or wall.
 */
function openDecision(ctx: Ctx, work: Work): Finding[] {
  const place = elementOf(ctx.scene, work.placeId);
  const decisionName = DECISION_INSIDE_PLACE[work.taskType];
  // Installing one named fixture does not depend on every other fixture in the unit.
  const namedFixture = work.taskType === "install_fixtures" &&
    work.elementIds.some((id) => elementOf(ctx.scene, id)?.type === "fixture");
  const insidePlace =
    place && decisionName && !namedFixture
      ? ctx.scene.elements
          .filter((e) => e.id !== place.id && (e.type === "fixture" || e.type === "zone") && e.state === "proposed")
          .filter((e) => decisionName.test(e.name))
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
        ...sure(severity, summary, unsure(ctx, [work.confidence, ...(proposedBy ? [proposedBy.confidence] : [])], [elementId, work.placeId])),
        evidenceMessageIds: proposedBy ? [proposedBy.sourceMessageId] : [],
        crewIds: [work.crewId],
        elementIds: [elementId],
        taskIds: work.taskIds,
      }),
    );
  }
  return out;
}

function clashSummary(ctx: Ctx, crewA: Id, crewB: Id, placeIds: Id[], day: string, areaM2?: number): string {
  const places = uniqSorted(placeIds).map((id) => elementName(ctx.scene, id)).join(" and ");
  const area = areaM2 === undefined ? "" : `, and their work zones overlap by ${areaM2.toFixed(2)} m²`;
  return `Per the record, ${crewName(ctx.scene, crewA)} and ${crewName(ctx.scene, crewB)} are both planned in ${places} at the same time on ${day}${area}.`;
}

/**
 * Whether two pieces of work clash in space (owner B). Both work zones known: they must overlap by at least
 * MIN_OVERLAP_M2 (measure.ts), whatever their place ids. A zone that cannot be drawn: fall back to the same
 * place id, unmeasured. Undefined: no clash.
 */
function spaceClash(ctx: Ctx, a: Work, b: Work): { overlap?: Overlap } | undefined {
  const za = workZone(ctx.scene.elements, ctx.scene.crews, a);
  const zb = workZone(ctx.scene.elements, ctx.scene.crews, b);
  if (!za || !zb) return a.placeId === b.placeId ? {} : undefined;
  const side = (w: Work, zone: NonNullable<typeof za>) => ({
    crewId: w.crewId,
    crewName: crewName(ctx.scene, w.crewId),
    // A live intent has no task id: use the crew's matching plan task, else its source message.
    taskId: w.taskId ?? w.taskIds[0] ?? w.sourceMessageId,
    zone,
  });
  const overlap = measureOverlap(side(a, za), side(b, zb), `on ${a.day}`);
  return overlap ? { overlap } : undefined;
}

function clashFinding(ctx: Ctx, key: string, a: Work, b: PlanTask, clash: NonNullable<ReturnType<typeof spaceClash>>): Finding {
  const places = [a.placeId!, b.placeId];
  return finding(ctx, "space_clash", key, a, {
    ...sure(
      "hold",
      clashSummary(ctx, a.crewId, b.crewId, places, a.day, clash.overlap?.areaM2),
      unsure(ctx, [a.confidence, b.confidence], uniqSorted(places)),
    ),
    evidenceMessageIds: [b.sourceMessageId],
    crewIds: [a.crewId, b.crewId],
    elementIds: places,
    taskIds: [...a.taskIds, b.id],
    ...(clash.overlap ? { measure: { overlap: clash.overlap }, rule: OVERLAP_RULE } : {}),
  });
}

/** space_clash (live): the intent against other crews' tasks on the same day and overlapping slot whose work zones overlap. */
function spaceClashLive(ctx: Ctx, work: Work): Finding[] {
  if (!knownPlace(ctx.scene, work.placeId)) return [];
  return ctx.tasks
    .filter(
      (t) => t.status === "planned" && t.crewId !== work.crewId && t.day === work.day && knownPlace(ctx.scene, t.placeId) && slotsOverlap(t.slot, work.slot),
    )
    .flatMap((t) => {
      const clash = spaceClash(ctx, work, taskToWork(t));
      return clash ? [clashFinding(ctx, t.id, work, t, clash)] : [];
    });
}

/** space_clash (rehearsal): each clashing pair once, sourced from the task with the smaller id. */
function spaceClashRehearsal(ctx: Ctx, tasks: PlanTask[]): Finding[] {
  const sorted = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
  const out: Finding[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.crewId === b.crewId || a.day !== b.day || !slotsOverlap(a.slot, b.slot)) continue;
      if (!knownPlace(ctx.scene, a.placeId) || !knownPlace(ctx.scene, b.placeId)) continue;
      const clash = spaceClash(ctx, taskToWork(a), taskToWork(b));
      if (clash) out.push(clashFinding(ctx, b.id, taskToWork(a), b, clash));
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
