import type { Id, Plan, PlanEdge, PlanGraph, PlanTask, Scene, Slot, TaskType } from "@site/contracts";
import { PREREQUISITE_RULES, SLOT_LENGTH, strictlyBefore, taskLabel, type Prerequisite } from "./rules";

// Owner: C. Tomorrow's plan as a dependency graph per place, its critical path and what a slip blocks.
// Pure: same scene and plan, same graph. No wall clock, no randomness.

/** The part of a piece of work the prerequisite rules look at: a plan task, or a crew's live intent. */
export interface Step {
  /** Undefined for a live intent. */
  id?: Id;
  crewId: Id;
  day: string;
  slot: Slot;
  taskType: TaskType;
  placeId?: Id;
  elementIds: Id[];
  /** The crew's own position in its day; undefined when not known. */
  order?: number;
}

/** Same place: same place id, or a shared element (the 203 wall named either way). */
export const onSamePlace = (t: PlanTask, s: Step) =>
  t.placeId === s.placeId || t.elementIds.some((e) => s.elementIds.includes(e));

/** Tasks on record that are the `rule.before` work for step `s` on its place. */
export function prerequisiteCandidates(tasks: PlanTask[], s: Step, rule: Prerequisite): PlanTask[] {
  return tasks.filter(
    (t) =>
      t.taskType === rule.before &&
      t.id !== s.id &&
      t.status !== "cancelled" &&
      onSamePlace(t, s) &&
      (!rule.sameCrew || t.crewId === s.crewId),
  );
}

/**
 * `from` is finished before `to` starts: done, planned in an earlier slot, or the same crew does it
 * first itself (same day and slot, lower order).
 */
export function finishesBefore(from: PlanTask, to: Step): boolean {
  if (from.status === "done") return true;
  if (strictlyBefore(from.day, from.slot, to.day, to.slot)) return true;
  return (
    to.order !== undefined &&
    from.crewId === to.crewId &&
    from.day === to.day &&
    from.slot === to.slot &&
    from.order < to.order
  );
}

const stepOf = (t: PlanTask): Step => ({ ...t });

/**
 * Incoming edges of one task. Per rule: when some candidate finishes in time, the task waits on those
 * (a done one means nothing blocks, so no edge); otherwise every candidate is a violated edge.
 */
function incoming(tasks: PlanTask[], to: PlanTask): PlanEdge[] {
  const out: PlanEdge[] = [];
  for (const rule of PREREQUISITE_RULES) {
    if (rule.after !== to.taskType) continue;
    const candidates = prerequisiteCandidates(tasks, stepOf(to), rule);
    const inTime = candidates.filter((c) => finishesBefore(c, stepOf(to)));
    if (inTime.some((c) => c.status === "done")) continue;
    const violated = inTime.length === 0;
    const reason = `${taskLabel(rule.after)} needs the ${rule.sameCrew ? "same crew's " : ""}${taskLabel(rule.before)} first`;
    for (const from of violated ? candidates : inTime) {
      out.push({ from: from.id, to: to.id, placeId: to.placeId, reason, violated });
    }
  }
  return out;
}

/** Half-day index on a timeline: days by calendar date (no working calendar), morning then afternoon. */
function startOf(t: PlanTask): number {
  const [y, m, d] = t.day.split("-").map(Number);
  const dayNumber = Date.UTC(y!, m! - 1, d!) / 86_400_000;
  return dayNumber * 2 + (t.slot === "afternoon" ? 1 : 0);
}
const endOf = (t: PlanTask) => startOf(t) + SLOT_LENGTH[t.slot];

/**
 * The plan graph for `plan.day`. Nodes: the day's planned tasks plus, transitively, the tasks on other
 * days they wait on. Done and cancelled tasks are not nodes. A place that is not an element on record
 * gets no edges (as in order_of_work).
 *
 * Critical path: the chain with the most half-day slots (morning or afternoon 1, full_day 2), among
 * chains of at least one edge. Ties: at each task the predecessor with the smallest id; overall the
 * end task with the smallest id. No edges, no critical path.
 *
 * Slips: for every node, the tasks that can no longer start as planned if it finishes one slot late,
 * pushed forward along the edges (a pushed task pushes its own successors). Sorted by id.
 */
export function planGraph(scene: Scene, plan: Plan): PlanGraph {
  const byId = new Map<Id, PlanTask>();
  for (const t of [...scene.tasks, ...plan.tasks]) byId.set(t.id, t);
  // Done tasks can satisfy a rule (so nothing blocks); only planned tasks become nodes.
  const known = [...byId.values()].filter((t) => t.status !== "cancelled").sort((a, b) => a.id.localeCompare(b.id));
  const tasks = known.filter((t) => t.status === "planned");
  const places = new Set(scene.elements.map((e) => e.id));

  const nodes = new Map<Id, PlanTask>();
  const edges: PlanEdge[] = [];
  const queue = tasks.filter((t) => t.day === plan.day && plan.tasks.some((p) => p.id === t.id));
  for (const t of queue) nodes.set(t.id, t);
  while (queue.length > 0) {
    const to = queue.shift()!;
    if (!places.has(to.placeId)) continue;
    for (const e of incoming(known, to)) {
      edges.push(e);
      if (!nodes.has(e.from)) {
        const from = byId.get(e.from)!;
        nodes.set(from.id, from);
        queue.push(from);
      }
    }
  }
  edges.sort((a, b) => a.to.localeCompare(b.to) || a.from.localeCompare(b.from));
  const taskIds = [...nodes.keys()].sort();

  const preds = new Map<Id, Id[]>(taskIds.map((id) => [id, []]));
  const succs = new Map<Id, Id[]>(taskIds.map((id) => [id, []]));
  for (const e of edges) {
    preds.get(e.to)!.push(e.from);
    succs.get(e.from)!.push(e.to);
  }
  const order = topological(taskIds, preds, succs);

  return { taskIds, edges, criticalPath: criticalPath(order, nodes, preds), slips: slips(order, nodes, succs) };
}

/** Kahn's algorithm, ready tasks taken by smallest id. The rules order task types, so there is no cycle. */
function topological(ids: Id[], preds: Map<Id, Id[]>, succs: Map<Id, Id[]>): Id[] {
  const waiting = new Map(ids.map((id) => [id, new Set(preds.get(id))]));
  const ready = ids.filter((id) => waiting.get(id)!.size === 0);
  const out: Id[] = [];
  while (ready.length > 0) {
    ready.sort();
    const id = ready.shift()!;
    out.push(id);
    for (const s of succs.get(id)!) {
      const w = waiting.get(s)!;
      w.delete(id);
      if (w.size === 0) ready.push(s);
    }
  }
  return out;
}

function criticalPath(order: Id[], nodes: Map<Id, PlanTask>, preds: Map<Id, Id[]>): Id[] {
  const best = new Map<Id, { length: number; via?: Id }>();
  for (const id of order) {
    let via: Id | undefined;
    for (const p of [...preds.get(id)!].sort()) if (via === undefined || best.get(p)!.length > best.get(via)!.length) via = p;
    best.set(id, { length: SLOT_LENGTH[nodes.get(id)!.slot] + (via === undefined ? 0 : best.get(via)!.length), via });
  }
  let end: Id | undefined;
  for (const id of [...order].sort()) {
    const b = best.get(id)!;
    if (b.via !== undefined && (end === undefined || b.length > best.get(end)!.length)) end = id;
  }
  const path: Id[] = [];
  for (let id = end; id !== undefined; id = best.get(id)!.via) path.unshift(id);
  return path;
}

function slips(order: Id[], nodes: Map<Id, PlanTask>, succs: Map<Id, Id[]>): PlanGraph["slips"] {
  return [...order].sort().map((taskId) => {
    const task = nodes.get(taskId)!;
    // New end of each pushed task, in half-day slots.
    const pushedEnd = new Map<Id, number>([[taskId, endOf(task) + 1]]);
    for (const id of order.slice(order.indexOf(taskId))) {
      const end = pushedEnd.get(id);
      if (end === undefined) continue;
      for (const s of succs.get(id)!) {
        const next = nodes.get(s)!;
        if (end <= startOf(next)) continue;
        const nextEnd = end + SLOT_LENGTH[next.slot];
        pushedEnd.set(s, Math.max(pushedEnd.get(s) ?? 0, nextEnd));
      }
    }
    pushedEnd.delete(taskId);
    const blocks = [...pushedEnd.keys()].sort();
    const crewIds = [...new Set(blocks.map((id) => nodes.get(id)!.crewId))].sort();
    return { taskId, blocks, crewIds };
  });
}
