import type { CrewIntent, Finding, Fix, Plan, Rehearsal, Scene } from "@site/contracts";

// Owner: C. The four deterministic checks, rehearsal and fix proposals.
// Pure functions of scene + plan (+ intent). No LLM, no randomness, no wall-clock time.

/**
 * STUB. Live trigger: pass the crew's intent. Evening trigger: no intent, check the whole plan.
 * Checks: latest_change, space_clash, order_of_work, open_decision.
 */
export function runChecks(_scene: Scene, _plan: Plan, _intent?: CrewIntent): Finding[] {
  return [];
}

/** STUB. Step the plan in order; findings per step feed the time slider. */
export function rehearse(_scene: Scene, plan: Plan): Rehearsal {
  return { day: plan.day, frames: [] };
}

/** STUB. One correction per finding, with the message sent to the crew after approval. */
export function proposeFixes(_findings: Finding[], _scene: Scene): Fix[] {
  return [];
}
