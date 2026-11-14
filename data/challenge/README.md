# Challenge set (simulated site data)

A second, separate run on the same floor, crews and threads as the golden replay: Monday 16 to Wednesday 18 November 2026, 64 messages, 14 labelled cases and 7 planted non-cases.

- `build.mjs` is the source. It writes `replay.json`, `labels.json` and `expected.json`.
- The set was written before the system was run on it. The messages and labels were committed on their own, before any extraction or scoring; the git history shows that order.
- Nothing in the labels may be changed to match what the system produces. A wrong extraction is reported as an extraction failure, not corrected.
- Live extraction outputs go to `llm-cache/` in this folder, each with its provenance. The golden `data/llm-cache/` is never read or written by the challenge run.

What it covers: unseen phrasing and shorthand ("2moro arvo", "tmrw am") for all four checks, a second revision after an earlier correction, an already informed crew, a cancellation, an ambiguous room nickname ("the corner unit"), an uncertain move ("will probably have to shift ... tbc"), harmless look-alikes, and a plan correction that creates a different clash.

Run: `npm run eval:challenge` (needs `GROQ_API_KEY` the first time; later runs read the stored outputs).
