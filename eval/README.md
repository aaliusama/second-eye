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
| Space clash | 4 | 0 | 0 |
| Order of work | 3 | 0 | 0 |
| Open decision | 4 | 0 | 0 |
| Total | 15 | 0 | 0 |

All four core demo cases (LC1, SC1, OW1, OD1) are caught. `demo-checks.test.ts` protects them on the real cached replay, including the W-12 ghost geometry and sourced fixes. These results measure this synthetic labelled set, not field performance or extraction accuracy. Confidence threshold diagnostics use final recorded task confidence, not immutable confidence snapshots for each alert.

The earlier OD2 and SC3 misses were missing extracted facts. B refreshed `m-043` (kitchen-light proposal) and `m-177` (drywall layout plan) through real Groq calls after adding general prompt guidance. The cache entries retain genuine provenance and raw facts; independent labels are unchanged. The final evaluation catches both cases without a hand-written cache substitution.

A integration now guards warning approvals from generating confidence-1 geometry, while preserving the HOLD ghost-wall approval. All five former HTTP e2e TODOs have real assertions, including live phone intent and nickname learning across runs. D's presenter now has the cached blue-room text and targets the W-12 source and fix instead of arbitrary first entries in the full dataset. The UI retains warning findings after sending a confirmation request.

Remaining release work: review and integrate this branch, visually rehearse every presenter beat and record/verify the submission video. Browser inspection was blocked when Computer Use could not verify the current Edge URL. No visual QA or completed recording is claimed from that attempt. Submission identity fields and final upload/form actions require the team's real information and human completion.

Rule limitation: the frozen element contract has no decision-category field. Interior dependency inference therefore uses conservative whole-word material/fixture categories in recorded element names; unfamiliar names are not inferred. Explicitly named proposed dependencies always count. Only a person's messages count as crew replies, not system DMs. Mixed-crew fixes ask each silent crew while retaining the responding crew's correction.

Repository visibility was checked with GitHub CLI and is private. Confirmation of Talona's required submission location with organizers on Discord is still a human handoff; it was not established by the code audit. Rerun the commands above whenever data, extraction, model or checks change.
