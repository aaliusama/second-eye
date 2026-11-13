import type { Operation, Plan, Scene, Slot } from "@site/contracts";
import { warnOnce } from "../log";

// Owner: A. Scene state, element history, plan.

/**
 * STUB: returns the scene unchanged. Replace with the real engine:
 * apply each operation, bump the element version, append to history
 * (sourceMessageId, thread, confidence), add plan_task to scene.tasks.
 * Must be pure: same scene + operations in, same scene out.
 */
export function applyOperations(scene: Scene, operations: Operation[]): Scene {
  if (operations.length > 0) warnOnce("model.stub", "applyOperations is a stub: operations are not applied yet");
  return scene;
}

const slotOrder: Record<Slot, number> = { morning: 0, full_day: 0, afternoon: 1 };

/** Tomorrow's plan for one day, in work order. */
export function getPlan(scene: Scene, day: string): Plan {
  const tasks = scene.tasks
    .filter((t) => t.day === day && t.status !== "cancelled")
    .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot] || a.order - b.order || a.id.localeCompare(b.id));
  return { day, tasks };
}
