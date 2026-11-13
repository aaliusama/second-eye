import type { Slot, TaskType } from "@site/contracts";

// Owner: C. Construction rules used by the checks. Plain tables, no logic beyond lookups.

/**
 * Order of work: a task type and the task type that must come before it on the same place.
 * - close_wall needs an inspection that is done or planned in an earlier slot. Mandatory: no inspection at all is a finding.
 * - finish_drywall needs close_wall, paint needs finish_drywall, tile needs rough_in_plumbing.
 *   These only flag when the prerequisite exists for that place and is planned later or in the same slot.
 */
export const PREREQUISITES: Partial<Record<TaskType, { before: TaskType; mandatory: boolean }>> = {
  close_wall: { before: "inspection", mandatory: true },
  finish_drywall: { before: "close_wall", mandatory: false },
  paint: { before: "finish_drywall", mandatory: false },
  tile: { before: "rough_in_plumbing", mandatory: false },
};

/** Work that cannot be undone cheaply: an open decision on what it touches is a hold, otherwise a warn. */
export const HOLD_ON_OPEN_DECISION: ReadonlySet<TaskType> = new Set<TaskType>(["tile", "close_wall", "install_fixtures"]);

/** full_day overlaps both halves. */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a === b || a === "full_day" || b === "full_day";
}

/** Whether slot a (on day a) ends before slot b (on day b) starts. Days compare as ISO strings. */
export function strictlyBefore(dayA: string, slotA: Slot, dayB: string, slotB: Slot): boolean {
  if (dayA !== dayB) return dayA < dayB;
  return slotA === "morning" && slotB === "afternoon";
}

export const taskLabel = (t: TaskType) => t.replace(/_/g, " ");
