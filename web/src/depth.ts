import type { Clearance, Face, Geometry, PlanEdge, PlanGraph, PlanTask, Scene } from "@site/contracts";
import { crewName, elementById } from "./derive";

// Owner: D. Pure helpers that turn lane B's measured geometry and lane C's plan graph into what the
// plan and the timeline draw. When those fields are absent, every helper answers "nothing to draw".

// ---------- Lane B: measured clearance and overlap ----------

/** A wall face as a hairline segment, so the plan's shape and dimension helpers can draw it. */
export const faceGeometry = (face: Face, thickness = 0.01): Geometry => ({ kind: "segment", from: face[0], to: face[1], thickness });

/** Two short lines for the work-zone note on the plan, worded per the record. */
export function clearanceWords(c: Clearance): [string, string] {
  const m = (v: number) => `${v.toFixed(2)} m`;
  const second =
    c.outcome === "inside_new_wall"
      ? `lands inside the recorded wall (${m(c.offsetM)} ${c.direction})`
      : c.outcome === "gap"
        ? `${m(c.offsetM)} gap · needs ${m(c.requiredM)} clear`
        : `within tolerance (${m(c.offsetM)})`;
  return ["Their work zone", second];
}

/** Redline only for the conflict itself: a clearance within tolerance is drawn soft, a sent correction amber. */
export function clearanceTone(c: Clearance, sent: boolean): "redline" | "pending" | "soft" {
  if (c.outcome === "within_tolerance") return "soft";
  return sent ? "pending" : "redline";
}

/** "6.0 m² shared". */
export const overlapLabel = (areaM2: number) => `${areaM2.toFixed(1)} m² shared`;

// ---------- Lane C: dependency graph on the timeline ----------

export const edgeKey = (e: Pick<PlanEdge, "from" | "to">) => `${e.from}>${e.to}`;

export interface GraphEdgeView extends PlanEdge {
  key: string;
  /** On the critical path: consecutive tasks of it. */
  critical: boolean;
}

export interface GraphView {
  critical: Set<string>;
  /** Edges whose two tasks are both bars on the timeline. */
  drawn: GraphEdgeView[];
  /** Edges with an end that is not on the timeline (an earlier day, a cancelled task): listed, not drawn. */
  offTimeline: GraphEdgeView[];
}

/** What the timeline draws from the plan graph. Undefined when lane C sent no graph. */
export function graphView(graph: PlanGraph | undefined, onTimeline: Set<string>): GraphView | undefined {
  if (!graph) return undefined;
  const path = graph.criticalPath;
  const criticalEdges = new Set(path.slice(1).map((to, i) => edgeKey({ from: path[i]!, to })));
  const edges = graph.edges.map((e): GraphEdgeView => ({ ...e, key: edgeKey(e), critical: criticalEdges.has(edgeKey(e)) }));
  return {
    critical: new Set(path),
    drawn: edges.filter((e) => onTimeline.has(e.from) && onTimeline.has(e.to)),
    offTimeline: edges.filter((e) => !(onTimeline.has(e.from) && onTimeline.has(e.to))),
  };
}

const taskWords = (scene: Scene, t: PlanTask | undefined, id: string) =>
  t ? `${crewName(scene, t.crewId)}, ${t.taskType.replace(/_/g, " ")} in ${elementById(scene, t.placeId)?.name ?? "place not found"}` : `task ${id} (not found in the plan)`;

/** "If this slips, these crews are blocked", for one bar. Only what the plan graph says. */
export function slipReadout(graph: PlanGraph | undefined, taskId: string, scene: Scene): { title: string; lines: string[] } {
  const task = scene.tasks.find((t) => t.id === taskId);
  const title = `If ${taskWords(scene, task, taskId)} slips`;
  if (!graph) return { title, lines: ["No plan graph on record."] };
  if (!graph.taskIds.includes(taskId)) return { title, lines: ["This task is not in the plan graph."] };
  const slip = graph.slips.find((s) => s.taskId === taskId);
  if (!slip || slip.blocks.length === 0) return { title, lines: ["Nothing else on the plan waits on it, per the plan graph."] };
  const crews = slip.crewIds.map((id) => crewName(scene, id));
  return {
    title,
    lines: [
      `${crews.join(" and ")} cannot start as planned:`,
      ...slip.blocks.map((id) => taskWords(scene, scene.tasks.find((t) => t.id === id), id)),
    ],
  };
}

/** One line for the critical path: "Critical path: Electrical → Drywall → Painting (3 tasks)". */
export function criticalPathLine(graph: PlanGraph | undefined, scene: Scene): string | undefined {
  if (!graph || graph.criticalPath.length === 0) return undefined;
  const names = graph.criticalPath.map((id) => {
    const t = scene.tasks.find((x) => x.id === id);
    return t ? crewName(scene, t.crewId) : "not found";
  });
  return `Critical path: ${names.join(" → ")} (${names.length} ${names.length === 1 ? "task" : "tasks"})`;
}

/** Slider steps a slot covers: morning 0-10, afternoon 10-20, all day 0-20. */
export const slotSpan = (slot: string): [number, number] => (slot === "morning" ? [0, 10] : slot === "afternoon" ? [10, 20] : [0, 20]);

/**
 * Sub-rows for one crew's bars so two tasks in the same slot sit one above the other instead of on
 * top of each other (an arrow must land on the bar it means). Greedy, in plan order; pure.
 */
export function stackBars(tasks: PlanTask[]): { row: Map<string, number>; rows: number } {
  const ends: number[] = [];
  const row = new Map<string, number>();
  const ordered = [...tasks].sort((a, b) => slotSpan(a.slot)[0] - slotSpan(b.slot)[0] || a.order - b.order || a.id.localeCompare(b.id));
  for (const t of ordered) {
    const [a, b] = slotSpan(t.slot);
    let i = ends.findIndex((end) => end <= a);
    if (i < 0) i = ends.push(0) - 1;
    ends[i] = b;
    row.set(t.id, i);
  }
  return { row, rows: Math.max(1, ends.length) };
}

/**
 * A crew restating a plan already on record gives two tasks with the same crew, place, work and slot:
 * one bar on the timeline, carrying every task id (so flags and arrows on either land on it).
 */
export function mergeRestated(tasks: PlanTask[]): { task: PlanTask; ids: string[] }[] {
  const groups = new Map<string, { task: PlanTask; ids: string[] }>();
  for (const t of tasks) {
    const k = `${t.crewId}|${t.day}|${t.slot}|${t.placeId}|${t.taskType}`;
    const g = groups.get(k);
    if (g) g.ids.push(t.id);
    else groups.set(k, { task: t, ids: [t.id] });
  }
  return [...groups.values()];
}
