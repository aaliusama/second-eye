# Next work: making Site Rehearsal technically extraordinary

Written 14 Nov 2026 for a fresh Claude Code session that will run parallel agents. Read this whole file before planning.
The team does not care about the time limit for this work. Quality, visible depth and honesty matter most.

## 1. What the product is (one paragraph)

Site Rehearsal reads a construction site's chat messages, keeps a sourced model of one floor, and works out **what each crew knows**: every change keeps the thread it was said in, and each crew only reads some threads. Four deterministic checks (latest change, space clash, order of work, open decision) compare each crew's stated plan with the record. A mismatch is drawn as a red **ghost wall**: where the crew believes the wall is versus where the record says it is. The superintendent sends a correction in one tap; it stays amber until the crew confirms that exact revision. **The LLM extracts facts; rules decide.** Start with `README.md`, then `docs/architecture.md` and `docs/demo-script.md`.

## 2. Current state (verified on `main` at commit de42516)

- `npm test`: 323 tests pass. `npm run typecheck`: clean. Web build passes.
- Golden evaluation (`npm run eval`): 15/15 caught, 0 missed, 0 false alarms. Results files unchanged by recent work.
- Challenge set (`npm run eval:challenge`): run 1 6/14 (5 false alarms), run 2 8/14 (4), run 3 9/14 (2). Runs 2 and 3 are **not unseen**: fixes were made after seeing run 1.
- New today, in the UI: "See the floor as" lens (the plan redraws as a chosen crew believes it) and the "Who knows what" matrix (`web/src/Knowledge.tsx`, logic in `web/src/derive.ts`, tested in `web/src/derive.test.ts`). The presenter "Why" beat uses the lens.
- New today, in extraction (`server/extract/`): cancelled plans, unit grounding (an element of a unit the message never names is dropped), trade terms, and a **second look** (`missedCues` in `llm.ts`): when a message has a distance+direction or decision cue but the model returned no such fact, that message is re-asked alone. **The second look is unit-tested but has not been scored on the challenge set.**
- `server/model/index.ts`: a cancelled `plan_task` now cancels the matching planned task.

## 3. Rules every agent must follow

1. **Honesty is scored.** Report only numbers produced by `npm run eval` / `npm run eval:challenge`. Never edit labels, expected facts or stored LLM outputs to improve a score. Every new challenge run goes in a new `--run=N` folder and is labelled "not unseen" if anything was changed after seeing an earlier run.
2. **Protect the demo.** `npm run demo` must keep working offline from `data/replay.golden.json` + `data/llm-cache/`. Never rewrite `data/llm-cache/`. `server/extract/golden-rebuild.test.ts` must stay green: it proves rule changes do not alter any stored golden extraction.
3. **LLM extracts, rules decide.** No LLM call inside `server/checks/`. Same input, same output. No wall-clock time in logic.
4. **Fail closed.** Unsure extraction is "unconfirmed" / "not checked", never "clear". Never guess a place, direction or distance.
5. **Every finding and operation keeps `sourceMessageId`.** No source, no output.
6. Keep the visual language in `web/AGENTS.md` and `web/src/tokens.ts` (construction drawing, Archivo, redline only for conflicts). New colours or shadows go in `tokens.ts`.
7. Before saying a lane is done: `npm run typecheck`, `npm test`, `npm run eval` (must stay 15/15), and look at a screenshot of anything visible. Windows: use `npm.cmd` if PowerShell blocks `npm`.
8. Commit messages are plain. Work on branches/worktrees; merge to `main` only when all checks pass.
9. Contracts in `contracts/` may be extended when a lane needs it, but say so in the commit and keep old data valid.

## 4. Work lanes (run in parallel; each lane owns its files)

### Lane A: Measure and improve extraction honestly (owns `server/extract/`, `eval/`, `data/challenge*/`)
1. Score the second look: `npm run eval:challenge -- --run=4` (needs `GROQ_API_KEY` in `.env`; delete any partial `data/challenge/llm-cache-run4/` first). Add the row to the README table with an honest note.
2. **Write a brand-new unseen challenge set** (`data/challenge2/`), authored by a sub-agent that is NOT shown `server/extract/llm.ts` or earlier failures: same floor and crews, new phrasing, new cases for all four checks, planted non-cases. Commit messages and labels **before** the first run (the git history is the proof). Then run it once and report the result as the true unseen score. Mirror `data/challenge/build.mjs` and `eval/challenge.ts`.
3. Known remaining misses (run 3): "cut in" read as layout, "board up the 204 corridor wall" with no place, plans said more than one day ahead are dropped by design (see `extract.test.ts` and golden m-150/m-151: changing that rule changes golden extractions, so do not, unless you re-label nothing and the golden rebuild test stays green).
4. Optional: self-consistency for low-confidence facts (two readings must agree, otherwise "unconfirmed"). Measure before and after.

### Lane B: Real geometry in the checks (owns `server/checks/geometry.ts`, new files under `server/checks/`, their tests)
Today geometry is midpoints and point-in-polygon. Make the latest-change and space checks geometric:
- Walls as thick segments, rooms as polygons. Compute the actual offset between the crew's believed wall face and the recorded face, perpendicular to the wall, and the **clearance** a trade needs (for example a pipe run within N cm of the believed face lands inside the new wall or leaves a gap). Severity from the measured distance, with thresholds defined in one rules file.
- Space clash by overlapping work zones (polygon intersection of where each crew works), not just "same room id".
- Expose the computed numbers in each finding's text so the UI can draw them. Keep every function pure and tested; keep the 15/15.

### Lane C: Dependency graph and critical path in the rehearsal (owns `server/checks/rehearse.ts`, `server/checks/rules.ts`, Slider/timeline UI pieces after Lane D agrees)
- Build tomorrow's plan as a DAG from `PREREQUISITES` (rough-in, then inspection, then close wall, then finish, then paint/tile) per room. Detect order-of-work problems as graph violations; compute the **critical path** and which delays push other crews.
- Show it on the timeline: arrows between dependent crew bars, the critical path emphasised, and "if this slips, these crews are blocked".

### Lane D: Make the depth visible to judges (owns `web/`)
1. **"How it decided" trace** for every finding: message, then extracted fact (with confidence), then the rule that fired, then the finding, then the fix and its confirmation. One click from an incident card. This shows "LLM reads, rules decide" on screen.
2. **Lens in 3D**: `web/src/three/` should support the same "See the floor as" crew lens (walls glide to the crew's belief) and the ghost reveal.
3. Draw Lane B's clearance zones and Lane C's dependency arrows when they land.
4. Keep the flat SVG view working without WebGL. Respect reduced motion. Screenshot every presenter beat (headless Edge works: see `video/record-present.mjs` for driving the presenter with playwright-core).

### Lane E: Story, docs and recording (owns `README.md`, `docs/`, `video/`)
- After lanes land: update `docs/architecture.md` (add the per-crew belief model, second look, geometry, DAG), the README diagram and numbers, and `docs/demo-script.md`.
- Re-record the demo with `video/record-present.mjs`; refresh `docs/assets/readme/*.png`.
- Write a 90-second pitch and a 3-minute talk track that only uses measured numbers.

## 5. Order and coordination

- Lanes A, B, C, D can start at once. E starts once a lane merges.
- B and C both touch `server/checks/`: B owns geometry and the latest-change/space checks; C owns rehearsal, rules and order-of-work. Agree on any shared type first.
- D consumes B's and C's output; until then it builds the trace view and the 3D lens.
- After each merge to `main`: `npm run typecheck`, `npm test`, `npm run eval` (15/15), `npm run demo` starts, presenter beats screenshot without page errors.

## 6. Definition of done for the whole push

- A judge sees, in under 90 seconds: the ghost wall, "See the floor as" a crew, the "How it decided" trace, and the critical path on tomorrow's timeline.
- README states the golden score, every challenge run honestly labelled, and the new unseen challenge2 score.
- All checks green; the offline demo unchanged in behaviour except for the new visible features.
