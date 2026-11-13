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

A match requires the check and trigger message plus every labelled crew and element. Empty crew/element lists are wildcards. Live and rehearsal findings for the same incident count once; clashes use both source messages so the two triggers can name the pair in either order. The existing repeat rule lists unlabelled restatements with the same check, crews and elements as a caught incident without counting them as false alarms.

The current main dataset is `golden-slice-1`: two messages and one labelled latest-change case. The full scenario, all four planted demo incidents and false-alarm performance on the full labelled set cannot be validated from this slice. Fixture tests cover all four checks, rehearsal, fixes and cases that should raise no finding; they are not labelled-dataset results.

Handoff needed from B: the complete golden replay, matching offline extraction caches and the independently written labels (including the other three demo incidents and the broader test set). Do not alter labels to fit the checks. Once those land, run the commands above, inspect every missed case and false alarm in the detail file, and pass the generated results to A and D for the README, UI and pitch.
