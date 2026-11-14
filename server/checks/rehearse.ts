import type { Finding, Plan, PlanTask, Rehearsal, RehearsalFrame, Scene } from "@site/contracts";
import { planGraph } from "./graph";
import { runChecks } from "./index";

// Owner: C. Evening rehearsal for the time slider. Pure and deterministic.

export type Checker = (scene: Scene, plan: Plan) => Finding[];

const SLOTS = [
  { slot: "morning", clock: "07:00:00" },
  { slot: "afternoon", clock: "12:00:00" },
] as const;

const isActiveIn = (task: PlanTask, slot: "morning" | "afternoon") =>
  task.status === "planned" && (task.slot === slot || task.slot === "full_day");

/**
 * One frame per slot that has planned tasks: morning (07:00), then afternoon (12:00).
 * full_day tasks are active in both. Each frame carries the checker's findings that
 * touch an active task, re-tagged as rehearsal findings. Done and cancelled tasks are not active.
 * With any frame, `graph` is the day's dependency graph, critical path and slips (graph.ts).
 */
export function rehearse(scene: Scene, plan: Plan, check: Checker = runChecks): Rehearsal {
  const frames: RehearsalFrame[] = [];
  let findings: Finding[] | undefined;

  for (const { slot, clock } of SLOTS) {
    const activeTaskIds = plan.tasks
      .filter((t) => isActiveIn(t, slot))
      .map((t) => t.id)
      .sort();
    if (activeTaskIds.length === 0) continue;

    findings ??= check(scene, plan);
    const active = new Set(activeTaskIds);
    frames.push({
      step: frames.length,
      time: `${plan.day}T${clock}`,
      activeTaskIds,
      findings: findings
        .filter((f) => f.taskIds.some((id) => active.has(id)))
        .map((f) => ({ ...f, trigger: "rehearsal" as const })),
    });
  }

  return frames.length === 0 ? { day: plan.day, frames } : { day: plan.day, frames, graph: planGraph(scene, plan) };
}
