# Resume after Codex parallel implementation

## Latest completed batch: acknowledgement, sheet text and dismissal memory

This section supersedes the earlier remaining-lanes list below. Both implementation batches are committed as `5a9fd3b` and pushed to `origin/win/integration`. They are not merged into main. No Codex agent is still editing these files. Fetch and inspect branch/worktree status before resuming; preserve any later local edits.

### Proposed next parallel batch (not started)

- **Visual/demo lane:** own `web/` and `docs/demo-script.md`; rehearse all eleven beats, verify clean start and amber-to-confirmed transition, improve ghost zoom/readability, and review N/O/P selectively. Produce screenshots before claiming visual completion.
- **Extraction/evidence lane:** own `server/extract/`, `eval/`, and separately named challenge fixtures in `data/`; diagnose live service availability, score new paraphrases and negatives, and report unavailable cases separately. Do not tune against golden labels or call the known-failure development set a blind holdout.
- **Pitch/submission lane:** own `docs/pitch.md` and submission documentation; align the story with actual confirmation and sheet-text behavior, prepare the recording shot list, verify official form/eligibility requirements, and map demonstrated evidence to rubric criteria. No submission or external messages without authorization.
- **Integrator:** reserve shared contracts, routes, root scripts and handoff docs; review lane changes and run combined checks. Queue grouping is a subsequent scoped change after the visual lane identifies actual clutter, not an overlapping fourth UI implementation.

These are recommendations awaiting the user's next instruction, not active assignments. No score or win is guaranteed. Read the limitations below before making claims.

### Implemented behavior

1. **Acknowledgement and receipt:** dispatch creates an amber awaiting-confirmation receipt for confirmed latest-change geometry corrections. It no longer marks the crew as informed. The explicitly labelled simulated crew reply creates a sourced message and rechecks the scene; duplicate replies are idempotent. A newer substantive revision, even with identical geometry but a new source, rejects stale acknowledgement with HTTP 409. Receipts expose source, dispatch and acknowledgement messages. They are session-local. This does not certify inspection, completion or physical safety.
2. **Sheet revisions:** office/architect/superintendent issuance and explicit crew revision statements are compared in a new panel. The parser works on uncached recorded text with live extraction off. Future/proposed/negated/question/unauthorized text is not promoted; contradictory simultaneous issues and withdrawals remain uncertain. The UI can simulate issuing A-201 rev C then a crew stating rev B. No attachments are read; this is a separate sourced comparison, not a fifth core CheckName or verified drawing geometry.
3. **Reversible learning:** the review-memory panel stores an explicit reason for an exact incident and offers Undo. Fingerprints include sources, crew, check, geometry/version and task context. New evidence or changed work reappears for review. Underlying safety findings, approval queue and eval stay intact; this is deliberately narrow review memory, not retraining or global suppression. Configured persistence uses `<LEARNING_FILE>.dismissals.json`; keepLearning retains it, clean reset clears it.
4. **Shared integration:** mounted all endpoints, exported the scoped new contract schemas, inserted panels, kept latest-change risks visible to MCP/agent briefings after dispatch, added amber queue status, and added a separate Confirm presenter beat. Presenter is now eleven beats: Problem, Build, Ghost wall, Why, Rehearse, Send, Confirm, Ask, Learn, Run 2, Numbers. Confirm is an explicit simulator action; do not narrate it as automatic real-world delivery verification.

### Changed-file map for this batch

- Contracts: `contracts/src/{acknowledgement,sheets,dismissals}.ts` and entry-point exports.
- Acknowledgement: `server/api/session.ts`, `server/api/acknowledgement.ts`, `web/src/Acknowledgements.tsx`, `web/src/derive.ts` and session/e2e assertions.
- Sheets: `server/sheets/`, `server/api/sheets.ts`, `web/src/Sheets.tsx`.
- Dismissals: `server/learning/dismissals.ts`, its tests, `server/api/dismissals.ts`, `web/src/Dismissals.tsx`.
- Integration: `server/api/index.ts`, `server/index.ts`, `server/api/winning-flows.test.ts`, `server/agent/policy.ts`, `mcp/tools.ts` and tests, `web/src/App.tsx`, `api.ts`, `panels.tsx`, `index.css`, presenter files, `eval/presenter-contract.test.ts`.

### Final evidence and limitations

- Full typecheck passes.
- 310 tests pass in 32 root test files, including combined HTTP acknowledgement/sheet/dismissal flows.
- 24 HTTP demo tests pass; 30 MCP tests pass.
- Web production build passes with the existing optional 3D chunk-size warning.
- Golden evaluation remains 15 caught, zero missed, zero false alarms; live alone catches 14. Golden labels/cache unchanged.
- `npm run demo` started successfully on isolated ports 8793 API and 5176 web, LIVE_LLM=0. This dedicated preview was left running; default demo ports/processes were not terminated.
- Browser attempt failed because the browser access host is unavailable. No full visual rehearsal, screenshot validation, or final video is claimed.
- Live paraphrase service availability/accuracy remains unverified; earlier unavailable result is not an accuracy score.

### Claude's next work

1. Visually rehearse the eleven beats, especially Send (still held/amber), Confirm (explicit reply), then Ask. Review clutter, zoom and first-load exposure. The small previous Clean fix requires R/start and is not a complete reveal redesign.
2. Review N/O/P branches selectively. They were preserved, not merged. Do not overwrite the new panels or revert confirmation semantics while merging.
3. Improve demonstration layout after seeing screenshots. All new panels currently use existing side-panel styles; no polished visual review has occurred.
4. Consider semantic incident grouping in the approval queue; review-memory learning currently marks the exact incident reviewed only in its dedicated panel and does not silence the underlying safety queue.
5. Validate live extraction with service access and a clearly separated challenge report; record real results and failures.
6. Update/record the final video, align the pitch with eleven beats, and confirm organizer eligibility/form destination. Nothing was submitted or published by Codex.

## Historical first-batch handoff (retained for context)

Work is present as uncommitted edits on `win/integration` (base `4c97266`). Preserve these edits. Existing Claude worktrees and `n/rail`, `o/feed`, `p/phone-slider` were not merged or overwritten. No Codex implementation lane remains active after this handoff.

## Implemented

- `web/src/present/Presenter.tsx`: Clean/reset/back-to-Clean displays the real replay one second before m-001. Build advances to that recorded change. This removes the pre-existing W-12 ghost from the clean beat without deleting findings. Requires R or advancing to the Clean beat; initial app loading was not redesigned.
- `web/src/store.ts`: refresh sequence guard prevents older asynchronous responses replacing the newer approval/replay state. This addresses a possible stale-state race, but the exact screenshot delay has not been visually reproduced or proven fixed.
- `scripts/demo-live.mjs`, root `package.json`, README: `npm run demo:live` checks for a Groq key and starts the existing demo with LIVE_LLM=1. Cached replay stays cached; new text uses existing live extraction. No claim that arbitrary text always works. No new dependency.
- `web/src/Phone.tsx`: zero extraction now explicitly says the message has not been cleared and explains prepared offline messages versus live extraction. This is explanatory copy, not a new structured extraction-status response.
- `data/paraphrase-eval.json`, `eval/paraphrase.ts`, root script `eval:paraphrase`: separate three-case development challenge set, including the reported failing paraphrase and a harmless delivery contrast. Cases run through uncached extraction without writing golden caches. Each case applies extracted operations before checking. Missing credentials or service failure produces unavailable status rather than a successful negative or accuracy claim. Do not describe this as a blind holdout: one case comes from a known failure.
- `server/query/briefing.ts`: existing digest text contains a deterministic top-three huddle, HOLD before WARN, then work order, latest change, open decision, space clash. Dedupe uses finding ID; this is not complete semantic incident deduplication of the approval queue.
- `web/src/Huddle.tsx`, App insertion: visible huddle panel using the existing digest endpoint, readable source sender/thread/time, explicit errors and simulation label. Hidden while viewing historical record to avoid showing future risks in the Clean/Build beats. No new API contract.
- `server/checks/fixes.ts`: retains human source citations when available, replaces raw source-ID fallback with a pointer to the incident source record, retains ghost distance/direction. Updated focused assertions.

## Verification actually completed

- `npm.cmd run typecheck`: passed after final implementation edits.
- `npm.cmd test`: 290 passed (29 files).
- Targeted huddle/fix suite: 54 passed.
- `npm.cmd run e2e`: 24 passed.
- `npm.cmd run eval`: 15 caught, zero missed, zero false alarms on the golden synthetic set; 14 caught live, 15 in rehearsal. Existing eval files unchanged.
- `npm.cmd run build -w @site/web`: passed; existing optional 3D chunk-size warning remains.
- `node --check scripts/demo-live.mjs` and `git diff --check`: passed.
- Live paraphrase attempt: extraction service unavailable; no accuracy result claimed. Launcher reviewed/syntax-checked, not demonstrated against Groq during this pass.

Full browser rehearsal and video are still outstanding. Do not equate HTTP tests/build with screenshot verification. In particular, recheck Clean -> Build -> Ghost -> Fix -> Ask, first-load ghost exposure, readable zoom, focus on a single issue, and the acknowledgement semantics below.

## Continue without duplicating completed code

1. Review these diffs and reconcile historical N/O/P UI branches selectively; do not wholesale overwrite the current web files.
2. Run the presenter in the browser. The Clean change is deliberately small; the full zoom/clutter/black-dot cleanup and one-red-thing reveal are not complete. Verify the refresh race guard under repeated clicks.
3. Add true acknowledgement plus incident receipt. Current approval still treats sent as heard. Amber sent/unconfirmed and revision-specific crew acknowledgement are NOT implemented. This needs coherent model/API/UI work, not just recoloring the ghost.
4. Finish semantic queue deduplication and avoid hiding distinct incidents. Huddle cap does not reduce the underlying pending-fix queue.
5. Implement text-only sheet revisions and reversible dismissal learning; neither is implemented here. User authorizes reconsidering the old KILL scope, but coordinate contract extensions explicitly and preserve sources/history.
6. Improve live input experience with actual mode/status feedback and controlled live validation; current empty-result explanation does not distinguish network failure from valid no-intent output. Never reveal .env values.
7. Verify eligibility/form destination and create/review the final video. These external outcomes remain unverified.

User intent: execute in parallel with exclusive files, preserve Claude's work, strengthen a memorable real demonstration, and report implemented/verified/outstanding work accurately. Never stop at assigning agents and claim implementation is complete.
