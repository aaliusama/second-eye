# Checks and evaluation handoff (C)

Simulated site data. The checks describe the record, not verified construction.

Run from the repository root:

```sh
npm test -- server/checks eval
npm run eval
```

`npm run eval` replays `data/replay.golden.json` against `data/labels.json` and writes:

- `eval/results.json`: caught, missed and false alarms per check and in total, for the UI and README.
- `eval/results.detail.json`: case matches, live/rehearsal breakdowns, false alarms, repeats and missing label sources. Confidence thresholds use recorded task confidence, not extraction accuracy.

A match requires the check and trigger message plus every labelled crew and element. Empty crew/element lists are wildcards. Active and resolved live alerts are both scored: correcting a risk must not erase a catch or a false alarm from history. Live and rehearsal findings for the same incident count once; clashes use both source messages so the two triggers can name the pair in either order. An unlabelled restatement is excluded from false alarms only when its check, crews, elements and nonempty risk evidence match a caught incident. Distinct clash message pairs remain distinct incidents.

The full simulated dataset is now available: replay `golden`, 190 messages, 15 labelled cases. The latest `npm run eval` on this C branch produced:

| Check | Caught | Missed | False alarms |
|---|---:|---:|---:|
| Latest change | 4 | 0 | 0 |
| Space clash | 3 | 1 | 0 |
| Order of work | 3 | 0 | 0 |
| Open decision | 3 | 1 | 0 |
| Total | 13 | 2 | 0 |

All four core demo cases (LC1, SC1, OW1, OD1) are caught. `demo-checks.test.ts` protects them on the real cached replay, including the W-12 ghost geometry and sourced fixes. These results measure this synthetic labelled set, not field performance or extraction accuracy. Confidence threshold diagnostics use final recorded task confidence, not immutable confidence snapshots for each alert.

Remaining full-set misses are missing extracted facts, not licence to invent a finding:

```text
CHANGE REQUEST -> B
Where: data/llm-cache/m-043.json, server/extract/
What and why: OD2 is missed because the proposed light-202-kitchen decision in m-043 has no cached change/operation. Correct extraction and regenerate the cache with honest provenance; retain the independent labels.
Blocking me: yes for full labelled-set sign-off. Meanwhile C's rule and demo regressions pass.

CHANGE REQUEST -> B
Where: data/llm-cache/m-177.json, server/extract/
What and why: SC3 is missed because m-177's drywall layout plan for Unit 201 Saturday afternoon is absent from cached plans/operations/intents. The electrical plan in m-181 is present. Correct extraction and regenerate the cache with honest provenance; retain the independent labels.
Blocking me: yes for full labelled-set sign-off. Meanwhile C's clash fixtures pass.
```

For A: merge C's branch and consume the generated results for the README. `server/api/session.ts` currently applies a confidence-1 heard-position operation for any approved `notify_crew` latest-change fix; ensure approving a WARN confirmation cannot promote an uncertain position to confirmed reality. The C warning draft asks for confirmation rather than instructing work. Update the root README's obsolete slice-only/data-missing status. Turn the five full-data e2e TODOs into assertions when integrating; C's acceptance tests cover the four check outcomes but do not replace the phone/learning HTTP lifecycle.

For D: consume `eval/results.json` for numbers, refresh the obsolete slice-only demo/judging notes, and replace `PHONE.blueRoom`'s placeholder in `web/src/present/beats.ts` with B's cached script: `tmrw afternoon we start boarding the blue room, ceiling first` (Walsh Drywall). Finish the written submission placeholders and demo video, then rehearse all beats. No changes to D's files were made by C.

Rule limitation: the frozen element contract has no decision-category field. Interior dependency inference therefore uses conservative whole-word material/fixture categories in recorded element names; unfamiliar names are not inferred. Explicitly named proposed dependencies always count. Only a person's messages count as crew replies, not system DMs. Mixed-crew fixes ask each silent crew while retaining the responding crew's correction.

Repository visibility was checked with GitHub CLI and is private. Confirmation of Talona's required submission location with organizers on Discord is still a human handoff; it was not established by the code audit. Once B's corrected extraction lands, rerun the commands above and review every remaining miss and false alarm before making a full-set claim.
