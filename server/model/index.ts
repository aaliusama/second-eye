import type { Element, ElementChange, Operation, Plan, Scene, Slot } from "@site/contracts";
import { logLine } from "../log";

// Owner: A. Scene state, element history, plan.

function change(op: Operation, version: number, extra: Partial<ElementChange>): ElementChange {
  return {
    version,
    time: op.time,
    sourceMessageId: op.sourceMessageId,
    thread: op.thread,
    operationType: op.type,
    confidence: op.confidence,
    ...extra,
  };
}

function skip(op: Operation, reason: string): void {
  logLine({ kind: "operation.skipped", operationId: op.id, reason });
}

/** Apply one operation. Returns a new scene; never mutates the input. */
function applyOne(scene: Scene, op: Operation): Scene {
  const time = op.time > scene.time ? op.time : scene.time;
  const find = (id: string) => scene.elements.find((e) => e.id === id);
  const replace = (next: Element): Element[] => scene.elements.map((e) => (e.id === next.id ? next : e));

  switch (op.type) {
    case "move": {
      const el = find(op.elementId);
      if (!el) return skip(op, `unknown element ${op.elementId}`), scene;
      const version = el.version + 1;
      const next: Element = {
        ...el,
        geometry: op.to,
        version,
        history: [...el.history, change(op, version, { geometry: op.to })],
      };
      return { ...scene, time, elements: replace(next) };
    }
    case "add": {
      if (find(op.element.id)) return skip(op, `element ${op.element.id} already exists`), scene;
      const next: Element = {
        ...op.element,
        version: 1,
        history: [change(op, 1, { geometry: op.element.geometry, state: op.element.state })],
      };
      return { ...scene, time, elements: [...scene.elements, next] };
    }
    case "remove": {
      if (!find(op.elementId)) return skip(op, `unknown element ${op.elementId}`), scene;
      return { ...scene, time, elements: scene.elements.filter((e) => e.id !== op.elementId) };
    }
    case "set_status": {
      const el = find(op.elementId);
      if (!el) return skip(op, `unknown element ${op.elementId}`), scene;
      const version = el.version + 1;
      const next: Element = {
        ...el,
        state: op.state,
        version,
        history: [...el.history, change(op, version, { state: op.state })],
      };
      return { ...scene, time, elements: replace(next) };
    }
    case "plan_task": {
      const others = scene.tasks.filter((t) => t.id !== op.task.id);
      return { ...scene, time, tasks: [...others, op.task] };
    }
  }
}

/**
 * Apply operations in order. Each change bumps the element version and appends to its
 * history (sourceMessageId, thread, confidence). plan_task adds to scene.tasks.
 * Pure: same scene + operations in, same scene out. Unknown or duplicate targets are
 * skipped and logged, never guessed.
 */
export function applyOperations(scene: Scene, operations: Operation[]): Scene {
  return operations.reduce(applyOne, scene);
}

const slotOrder: Record<Slot, number> = { morning: 0, full_day: 0, afternoon: 1 };

/** Tomorrow's plan for one day, in work order. */
export function getPlan(scene: Scene, day: string): Plan {
  const tasks = scene.tasks
    .filter((t) => t.day === day && t.status !== "cancelled")
    .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot] || a.order - b.order || a.id.localeCompare(b.id));
  return { day, tasks };
}
