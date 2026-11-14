import type { RuleRef, TaskType } from "@site/contracts";

// Owner: B. Every number the geometric checks use, in one place. Metres and square metres.
// Values come from construction practice, not from the golden cases. Where no code sets a number,
// the line says it is a working assumption. Plain tables, no logic.

export interface TaskGeometry {
  /**
   * Clear floor depth the crew needs in front of the face it works on. It is both the clearance reported
   * as `requiredM` and the depth of the work zone drawn along the face (the zone IS the space needed).
   */
  clearanceM: number;
  /** How far the face may be from where the crew believes before the work no longer fits. */
  toleranceM: number;
  /** One line: why these values. */
  why: string;
}

export const TASK_GEOMETRY: Record<TaskType, TaskGeometry> = {
  layout: {
    clearanceM: 0.3,
    toleranceM: 0.006,
    why: "Chalk line and laser along the floor at the face; partition layout is usually held to about 6 mm (1/4 in).",
  },
  rough_in_plumbing: {
    clearanceM: 0.6,
    toleranceM: 0.013,
    why: "A plumber kneels at the face with pipe and press tool (assumption: 0.6 m); stub-outs are usually set to about 13 mm (1/2 in).",
  },
  rough_in_electrical: {
    clearanceM: 0.6,
    toleranceM: 0.013,
    why: "An electrician works at the face from a step or stool (assumption: 0.6 m); box set-out is usually held to about 13 mm (1/2 in).",
  },
  inspection: {
    clearanceM: 0.6,
    toleranceM: 0.013,
    why: "The inspector stands at the open face (assumption: 0.6 m); checks the same rough-in set-out tolerance.",
  },
  close_wall: {
    clearanceM: 1.2,
    toleranceM: 0.006,
    why: "A 1.2 m (4 ft) board is carried and lifted flat against the face; board joints need the framing within about 6 mm.",
  },
  finish_drywall: {
    clearanceM: 1.2,
    toleranceM: 0.006,
    why: "Taping on stilts or a bench along the face (assumption: same 1.2 m as hanging); finish tolerance about 6 mm.",
  },
  paint: {
    clearanceM: 0.9,
    toleranceM: 0.006,
    why: "Stepladder footprint plus tray at the face (assumption: 0.9 m); paint follows the finished face, about 6 mm.",
  },
  tile: {
    clearanceM: 0.6,
    toleranceM: 0.003,
    why: "Tiler kneels at the face (assumption: 0.6 m); tile setting tolerates about 3 mm (1/8 in) before cuts change.",
  },
  install_fixtures: {
    clearanceM: 0.53,
    toleranceM: 0.013,
    why: "21 in (0.53 m) clear in front of a toilet or lavatory (IPC 405.3.1); fixture set-out about 13 mm (1/2 in).",
  },
  other: {
    clearanceM: 0.6,
    toleranceM: 0.006,
    why: "Unknown task: one person working at the face (assumption: 0.6 m) and the tightest common layout tolerance.",
  },
};

/**
 * Latest change severity from the measured face offset. Beyond tolerance and at or above this distance: hold.
 * 50 mm is more than shims, furring or a thicker finish can take up, so the work is redone, not adjusted.
 * Within tolerance, or beyond it but under this: warn (the crew still has not heard the change).
 */
export const HOLD_FROM_M = 0.05;

/**
 * Space clash needs the two work zones to share at least this much floor.
 * 0.25 m² is about the floor one person needs to stand and work (0.5 m x 0.5 m); less is two crews
 * brushing an edge, not working in the same spot.
 */
export const MIN_OVERLAP_M2 = 0.25;

/** The rule behind a measured space clash, for the "How it decided" trace. */
export const OVERLAP_RULE = {
  id: "space_clash.overlapping_work_zones",
  statement:
    "Two different crews are planned at overlapping times on the same day, and the floor each needs for its work overlaps by more than one person's working space.",
} as const satisfies RuleRef;
