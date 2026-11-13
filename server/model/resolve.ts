import type { CrewIntent, Finding, Fix, Scene } from "@site/contracts";
import { runChecks } from "../checks/index";
import { logLine } from "../log";
import { getPlan } from "./index";

// Owner: A. Live findings a later message fixed. After each applied message the open live findings
// are re-checked with the pure checks (same intent, current scene and plan). Not reproduced = resolved:
// the finding leaves the active list and its pending fix leaves the queue. Decided fixes are untouched.

export interface LiveRecord {
  scene: Scene;
  findings: Finding[];
  fixes: Fix[];
  /** The crew intent behind each open live finding, by finding id. */
  liveIntents: Record<string, CrewIntent>;
  /** Live findings a later message fixed. Kept so the site agent can still say CLEAR and eval can count them. */
  resolvedFindings: Finding[];
  /** Pending fixes taken off the queue with their finding. */
  resolvedFixes: Fix[];
}

/** Whether the checks still produce this live finding for its intent on the current scene. */
export function reproduces(scene: Scene, finding: Finding, intent: CrewIntent): boolean {
  // The crew's own tasks behind the finding are all cancelled: the stated work is withdrawn.
  const own = scene.tasks.filter((t) => finding.taskIds.includes(t.id) && t.crewId === intent.crewId);
  if (own.length > 0 && own.every((t) => t.status === "cancelled")) return false;
  return runChecks(scene, getPlan(scene, intent.day), intent).some((f) => f.id === finding.id);
}

/** Re-checks the open live findings after message `byMessageId` was applied. Mutates `r`; returns the resolved ones. */
export function resolveLiveFindings(r: LiveRecord, byMessageId: string): Finding[] {
  const decided = new Set(r.fixes.filter((x) => x.status !== "pending").map((x) => x.findingId));
  const gone = r.findings.filter((f) => {
    const intent = r.liveIntents[f.id];
    return f.trigger === "live" && intent !== undefined && !decided.has(f.id) && !reproduces(r.scene, f, intent);
  });
  if (gone.length === 0) return [];
  const ids = new Set(gone.map((f) => f.id));
  const dropped = r.fixes.filter((x) => ids.has(x.findingId));
  r.findings = r.findings.filter((f) => !ids.has(f.id));
  r.fixes = r.fixes.filter((x) => !ids.has(x.findingId));
  r.resolvedFindings.push(...gone);
  r.resolvedFixes.push(...dropped);
  for (const f of gone) {
    delete r.liveIntents[f.id];
    logLine({
      kind: "finding.resolved",
      findingId: f.id,
      byMessageId,
      fixIds: dropped.filter((x) => x.findingId === f.id).map((x) => x.id),
    });
  }
  return gone;
}
