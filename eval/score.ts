import {
  CheckName,
  type EvalCounts,
  type EvalResults,
  type Finding,
  type LabelSet,
  type LabelledCase,
  type PlanTask,
  type Rehearsal,
} from "@site/contracts";

// Owner: C. Scoring rules (change them here and note it in docs/decisions.md).
//
// 1. Findings from both triggers (live and evening rehearsal) are pooled and folded into incidents.
//    One incident = (check, messages, sorted elementIds). messages is the sourceMessageId, except for
//    space_clash, which is symmetric: there it is the sorted pair source + evidence, so the live finding
//    (sourced from the second crew) and the rehearsal finding (sourced from the smaller task id) are one incident.
//    Repeated alerts for one incident count once.
// 2. A labelled case is caught when an incident has the same check and its messages include the
//    case's triggerMessageId. An incident that matches no case is one false alarm.

const zero = (): EvalCounts => ({ caught: 0, missed: 0, falseAlarms: 0 });
const uniqSorted = (xs: string[]) => [...new Set(xs)].sort();

export type Trigger = Finding["trigger"];

export interface Incident {
  key: string;
  check: CheckName;
  messageIds: string[];
  elementIds: string[];
  crewIds: string[];
  triggers: Trigger[];
  findingIds: string[];
  /** Lowest confidence among the plan tasks behind it; undefined when no task is on record. */
  confidence?: number;
}

export interface CaseResult {
  id: string;
  check: CheckName;
  triggerMessageId: string;
  caught: boolean;
  /** live, rehearsal, both, or none. */
  caughtBy: "live" | "rehearsal" | "both" | "none";
  incidentKeys: string[];
  findingIds: string[];
}

export interface EvalDetail {
  replayId: string;
  rule: string;
  findings: { live: number; rehearsal: number; incidents: number };
  perTrigger: { live: EvalCounts; rehearsal: EvalCounts };
  perCrew: Record<string, EvalCounts>;
  cases: CaseResult[];
  falseAlarms: Incident[];
  thresholds: { threshold: number; total: EvalCounts; perCheck: Record<CheckName, EvalCounts> }[];
}

function incidentMessages(f: Finding): string[] {
  return f.check === "space_clash" ? uniqSorted([f.sourceMessageId, ...f.evidenceMessageIds]) : [f.sourceMessageId];
}

function incidentKey(f: Finding): string {
  return `${f.check}|${incidentMessages(f).join(",")}|${uniqSorted(f.elementIds).join(",")}`;
}

/** Every rehearsal finding once per rehearsal (full_day findings repeat across frames). */
export function rehearsalFindings(rehearsals: Rehearsal[]): Finding[] {
  const out: Finding[] = [];
  for (const r of rehearsals) {
    const seen = new Set<string>();
    for (const frame of r.frames) {
      for (const f of frame.findings) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        out.push(f);
      }
    }
  }
  return out;
}

/** Fold findings into incidents, in key order. */
export function toIncidents(findings: Finding[], tasks: PlanTask[] = []): Incident[] {
  const byKey = new Map<string, Incident>();
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  for (const f of findings) {
    const key = incidentKey(f);
    const confs = f.taskIds.map((id) => taskById.get(id)?.confidence).filter((c): c is number => c !== undefined);
    const conf = confs.length > 0 ? Math.min(...confs) : undefined;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        key,
        check: f.check,
        messageIds: incidentMessages(f),
        elementIds: uniqSorted(f.elementIds),
        crewIds: uniqSorted(f.crewIds),
        triggers: [f.trigger],
        findingIds: [f.id],
        confidence: conf,
      });
      continue;
    }
    prev.crewIds = uniqSorted([...prev.crewIds, ...f.crewIds]);
    prev.triggers = uniqSorted([...prev.triggers, f.trigger]) as Trigger[];
    prev.findingIds = uniqSorted([...prev.findingIds, f.id]);
    if (conf !== undefined) prev.confidence = prev.confidence === undefined ? conf : Math.min(prev.confidence, conf);
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const matches = (i: Incident, c: LabelledCase) => i.check === c.check && i.messageIds.includes(c.triggerMessageId);

function countIncidents(labels: LabelSet, incidents: Incident[]): { perCheck: EvalResults["perCheck"]; total: EvalCounts } {
  const perCheck = Object.fromEntries(CheckName.options.map((c) => [c, zero()])) as EvalResults["perCheck"];
  for (const c of labels.cases) {
    if (incidents.some((i) => matches(i, c))) perCheck[c.check].caught++;
    else perCheck[c.check].missed++;
  }
  for (const i of incidents) {
    if (!labels.cases.some((c) => matches(i, c))) perCheck[i.check].falseAlarms++;
  }
  const total = zero();
  for (const counts of Object.values(perCheck)) {
    total.caught += counts.caught;
    total.missed += counts.missed;
    total.falseAlarms += counts.falseAlarms;
  }
  return { perCheck, total };
}

/** The contract result (eval/results.json): both triggers pooled, one count per incident. */
export function score(replayId: string, labels: LabelSet, findings: Finding[]): EvalResults {
  const { perCheck, total } = countIncidents(labels, toIncidents(findings));
  return { replayId, cases: labels.cases.length, perCheck, total };
}

export const THRESHOLDS = [0.5, 0.7, 0.9] as const;

/**
 * The detail file (eval/results.detail.json): which trigger caught each case, per-crew and per-trigger
 * counts, the false alarms, and the counts when only incidents whose plan tasks all reach a confidence
 * threshold are kept. An incident with no plan task on record is kept at every threshold.
 */
export function scoreDetail(
  replayId: string,
  labels: LabelSet,
  live: Finding[],
  rehearsal: Finding[],
  tasks: PlanTask[],
): EvalDetail {
  const incidents = toIncidents([...live, ...rehearsal], tasks);

  const cases: CaseResult[] = labels.cases.map((c) => {
    const hit = incidents.filter((i) => matches(i, c));
    const trig = new Set(hit.flatMap((i) => i.triggers));
    const caughtBy = trig.has("live") && trig.has("rehearsal") ? "both" : trig.has("live") ? "live" : trig.has("rehearsal") ? "rehearsal" : "none";
    return {
      id: c.id,
      check: c.check,
      triggerMessageId: c.triggerMessageId,
      caught: hit.length > 0,
      caughtBy,
      incidentKeys: hit.map((i) => i.key),
      findingIds: uniqSorted(hit.flatMap((i) => i.findingIds)),
    };
  });

  const falseAlarms = incidents.filter((i) => !labels.cases.some((c) => matches(i, c)));

  const perCrew: Record<string, EvalCounts> = {};
  const crew = (id: string) => (perCrew[id] ??= zero());
  labels.cases.forEach((c, n) => {
    for (const id of c.crewIds) cases[n]!.caught ? crew(id).caught++ : crew(id).missed++;
  });
  for (const i of falseAlarms) for (const id of i.crewIds) crew(id).falseAlarms++;

  const perTrigger = {
    live: countIncidents(labels, toIncidents(live, tasks)).total,
    rehearsal: countIncidents(labels, toIncidents(rehearsal, tasks)).total,
  };

  const thresholds = THRESHOLDS.map((threshold) => {
    const kept = incidents.filter((i) => i.confidence === undefined || i.confidence >= threshold);
    const { perCheck, total } = countIncidents(labels, kept);
    return { threshold, total, perCheck };
  });

  return {
    replayId,
    rule: "live + rehearsal pooled; one count per incident (check, source message or clash pair, elements)",
    findings: { live: live.length, rehearsal: rehearsal.length, incidents: incidents.length },
    perTrigger,
    perCrew: Object.fromEntries(Object.entries(perCrew).sort(([a], [b]) => (a < b ? -1 : 1))),
    cases,
    falseAlarms,
    thresholds,
  };
}
