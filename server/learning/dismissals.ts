import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { Finding, Scene } from "@site/contracts";
import { DismissalRule, type DismissalsResponse } from "../../contracts/src/dismissals";
import { REPO_ROOT } from "../paths";

let rules: DismissalRule[] = [];
let file: string | undefined;
const sorted = (xs: string[]) => [...new Set(xs)].sort();

/** Exact recorded incident, not a general permission to ignore this check. */
export function dismissalFingerprint(finding: Finding, scene: Scene): string {
  const value = {
    check: finding.check, severity: finding.severity, source: finding.sourceMessageId,
    evidence: sorted(finding.evidenceMessageIds), crews: sorted(finding.crewIds),
    elements: sorted(finding.elementIds).map((id) => {
      const element = scene.elements.find((e) => e.id === id);
      return [id, element?.version, element?.state, element?.geometry];
    }),
    tasks: sorted(finding.taskIds).map((id) => {
      const t = scene.tasks.find((task) => task.id === id);
      return [id, t?.sourceMessageId, t?.day, t?.slot, t?.taskType, t?.status, t?.placeId];
    }),
  };
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function save(next: DismissalRule[]): void {
  if (file) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2) + "\n");
    renameSync(`${file}.tmp`, file);
  }
  rules = next;
}

/** Companion file keeps the existing correction-store format intact. */
export function configureDismissals(learningFile?: string): void {
  rules = [];
  file = learningFile ? `${isAbsolute(learningFile) ? learningFile : join(REPO_ROOT, learningFile)}.dismissals.json` : undefined;
  if (!file) return;
  try { rules = DismissalRule.array().parse(JSON.parse(readFileSync(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

export function resetDismissals(keepLearning: boolean): void {
  if (!keepLearning) save([]);
}

export function dismissalState(findings: Finding[], scene: Scene): DismissalsResponse {
  return {
    rules: structuredClone(rules),
    matches: findings.flatMap((finding) => {
      const fingerprint = dismissalFingerprint(finding, scene);
      const rule = rules.find((r) => r.active && r.fingerprint === fingerprint);
      return rule ? [{ findingId: finding.id, ruleId: rule.id }] : [];
    }),
  };
}

export function dismissFinding(finding: Finding, scene: Scene, reason: string, time: string): DismissalRule {
  const fingerprint = dismissalFingerprint(finding, scene);
  const existing = rules.find((r) => r.active && r.fingerprint === fingerprint);
  if (existing) return structuredClone(existing);
  const rule = DismissalRule.parse({ id: `dismiss-${fingerprint.slice(0, 16)}-${rules.length + 1}`, fingerprint,
    findingId: finding.id, sourceMessageId: finding.sourceMessageId, summary: finding.summary,
    reason, time, active: true });
  save([...rules, rule]);
  return structuredClone(rule);
}

export function undoDismissal(id: string, time: string): boolean {
  if (!rules.some((r) => r.id === id)) return false;
  save(rules.map((r) => r.id === id && r.active ? { ...r, active: false, undoneAt: time } : r));
  return true;
}
