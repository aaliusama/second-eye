import { CheckName, type EvalCounts, type EvalResults, type Finding, type LabelSet } from "@site/contracts";

// Owner: C. Scoring rule (starting point, change it here and note it in docs/decisions.md):
// a labelled case is caught when some finding has the same check and
// finding.sourceMessageId === case.triggerMessageId. A finding that matches no case is a false alarm.

const zero = (): EvalCounts => ({ caught: 0, missed: 0, falseAlarms: 0 });

export function score(replayId: string, labels: LabelSet, findings: Finding[]): EvalResults {
  const perCheck = Object.fromEntries(CheckName.options.map((c) => [c, zero()])) as EvalResults["perCheck"];
  const matches = (f: Finding, c: LabelSet["cases"][number]) =>
    f.check === c.check && f.sourceMessageId === c.triggerMessageId;

  for (const c of labels.cases) {
    if (findings.some((f) => matches(f, c))) perCheck[c.check].caught++;
    else perCheck[c.check].missed++;
  }
  for (const f of findings) {
    if (!labels.cases.some((c) => matches(f, c))) perCheck[f.check].falseAlarms++;
  }

  const total = zero();
  for (const counts of Object.values(perCheck)) {
    total.caught += counts.caught;
    total.missed += counts.missed;
    total.falseAlarms += counts.falseAlarms;
  }
  return { replayId, cases: labels.cases.length, perCheck, total };
}
