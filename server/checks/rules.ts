import type { Slot, TaskType } from "@site/contracts";

// Owner: C. Construction rules used by the checks. Plain tables, no logic beyond lookups.

/** One prerequisite: work of type `after` on a place cannot start before work of type `before` there is done. */
export interface Prerequisite {
  before: TaskType;
  after: TaskType;
  /** No `before` on record at all for the place is itself an order-of-work finding. */
  mandatory: boolean;
  /** Feeds order_of_work findings. False: the rule only shapes the plan graph and critical path. */
  findings: boolean;
  /** Only a `before` task by the same crew counts (an inspection a crew booked inspects that crew's rough-in). */
  sameCrew: boolean;
}

/**
 * Order of work, rough-in, then inspection, then close wall, then finish, then paint; tile after the plumbing rough-in.
 * - close_wall needs an inspection that is done or planned in an earlier slot. Mandatory: no inspection at all is a finding.
 * - finish_drywall needs close_wall, paint needs finish_drywall, tile needs rough_in_plumbing.
 *   These only flag when the prerequisite exists for that place and is planned later or in the same slot.
 * - Graph only (no finding): an inspection needs the rough-in of the crew that booked it. Inspections are per trade,
 *   and the task type does not say which trade, so only the booking crew's own rough-in is a prerequisite.
 */
export const PREREQUISITE_RULES: readonly Prerequisite[] = [
  { before: "rough_in_plumbing", after: "inspection", mandatory: false, findings: false, sameCrew: true },
  { before: "rough_in_electrical", after: "inspection", mandatory: false, findings: false, sameCrew: true },
  { before: "inspection", after: "close_wall", mandatory: true, findings: true, sameCrew: false },
  { before: "close_wall", after: "finish_drywall", mandatory: false, findings: true, sameCrew: false },
  { before: "finish_drywall", after: "paint", mandatory: false, findings: true, sameCrew: false },
  { before: "rough_in_plumbing", after: "tile", mandatory: false, findings: true, sameCrew: false },
];

/** The prerequisite behind order_of_work findings, by the type of the later work (at most one per type). */
export const PREREQUISITES: Partial<Record<TaskType, Prerequisite>> = Object.fromEntries(
  PREREQUISITE_RULES.filter((r) => r.findings).map((r) => [r.after, r]),
);

/** Half-day slots a task takes: morning or afternoon 1, full_day 2. */
export const SLOT_LENGTH: Record<Slot, number> = { morning: 1, afternoon: 1, full_day: 2 };

/** Work that cannot be undone cheaply: an open decision on what it touches is a hold, otherwise a warn. */
export const HOLD_ON_OPEN_DECISION: ReadonlySet<TaskType> = new Set<TaskType>(["tile", "close_wall", "install_fixtures"]);

/**
 * Infer a dependency inside a place only when the recorded decision name describes the task's material
 * or fixture. Element has no decision-category field, so use conservative whole-word categories;
 * unknown names are not inferred. Explicitly named elements do not need this inference.
 */
export const DECISION_INSIDE_PLACE: Partial<Record<TaskType, RegExp>> = {
  tile: /\b(tiles?|tiling|grout)\b/i,
  paint: /\b(paint|colou?r|primer)\b/i,
  install_fixtures: /\b(fixtures?|lights?|lighting|vanity|vanities|basins?|sinks?|toilets?|taps?|faucets?|fittings?)\b/i,
};

/** Below this confidence a statement, task or change is unsure: a finding resting on it is a warn, never a hold. */
export const UNSURE_BELOW = 0.7;

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
