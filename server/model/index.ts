import type { Crew, Element, ElementChange, Geometry, Operation, Plan, Scene, Slot } from "@site/contracts";
import { logLine } from "../log";

// Owner: A. Scene state, element history, plan.

/**
 * Apply operations in array order. Pure: the input scene is never mutated,
 * same scene + operations in, same scene out. Unknown element ids are skipped and logged.
 */
export function applyOperations(scene: Scene, operations: Operation[]): Scene {
  const next: Scene = structuredClone(scene);

  for (const op of operations) {
    if (op.time > next.time) next.time = op.time;
    const base = { time: op.time, sourceMessageId: op.sourceMessageId, thread: op.thread, confidence: op.confidence };

    switch (op.type) {
      case "plan_task": {
        const task = structuredClone(op.task);
        const i = next.tasks.findIndex((t) => t.id === task.id);
        if (i >= 0) next.tasks[i] = task;
        else next.tasks.push(task);
        break;
      }
      case "add": {
        const el = structuredClone(op.element);
        const existing = next.elements.find((e) => e.id === el.id);
        if (existing) {
          existing.geometry = el.geometry;
          existing.state = el.state;
          existing.version += 1;
          existing.history.push({
            ...base,
            version: existing.version,
            operationType: "add",
            geometry: el.geometry,
            state: el.state,
          });
        } else {
          next.elements.push({
            ...el,
            version: 1,
            history: [{ ...base, version: 1, operationType: "add", geometry: el.geometry, state: el.state }],
          });
        }
        break;
      }
      case "remove": {
        const i = next.elements.findIndex((e) => e.id === op.elementId);
        if (i < 0) {
          notFound(op.id, op.elementId);
          break;
        }
        next.elements.splice(i, 1);
        break;
      }
      case "move": {
        const el = next.elements.find((e) => e.id === op.elementId);
        if (!el) {
          notFound(op.id, op.elementId);
          break;
        }
        const geometry = structuredClone(op.to);
        el.geometry = geometry;
        el.version += 1;
        el.history.push({ ...base, version: el.version, operationType: "move", geometry: structuredClone(geometry) });
        break;
      }
      case "set_status": {
        const el = next.elements.find((e) => e.id === op.elementId);
        if (!el) {
          notFound(op.id, op.elementId);
          break;
        }
        el.state = op.state;
        el.version += 1;
        el.history.push({ ...base, version: el.version, operationType: "set_status", state: op.state });
        break;
      }
    }
  }

  return next;
}

function notFound(operationId: string, elementId: string): void {
  logLine({ kind: "model.not_found", operationId, elementId });
}

/** Whether a crew has heard a change said in this thread. "drawing" is the shared baseline. */
function heard(thread: string, crew: Crew): boolean {
  return thread === "drawing" || crew.threads.includes(thread) || thread === `dm:${crew.id}`;
}

/** The latest history entry the crew has heard. Falls back to the first entry. */
export function knownVersion(element: Element, crew: Crew): ElementChange {
  for (let i = element.history.length - 1; i >= 0; i--) {
    if (heard(element.history[i].thread, crew)) return element.history[i];
  }
  return element.history[0];
}

/** Where the crew thinks the element is: geometry of the latest heard entry that has one. */
export function knownGeometry(element: Element, crew: Crew): Geometry {
  for (let i = element.history.length - 1; i >= 0; i--) {
    const h = element.history[i];
    if (h.geometry && heard(h.thread, crew)) return h.geometry;
  }
  return element.history.find((h) => h.geometry)?.geometry ?? element.geometry;
}

const slotOrder: Record<Slot, number> = { morning: 0, full_day: 0, afternoon: 1 };

/** Tomorrow's plan for one day, in work order. */
export function getPlan(scene: Scene, day: string): Plan {
  const tasks = scene.tasks
    .filter((t) => t.day === day && t.status !== "cancelled")
    .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot] || a.order - b.order || a.id.localeCompare(b.id));
  return { day, tasks };
}
