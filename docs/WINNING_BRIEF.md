# Winning brief for the next agent

Latest challenge interpretation and prioritized gaps: [TALONA_ALIGNMENT.md](TALONA_ALIGNMENT.md). It distinguishes requirements from optional Talona integration, records the newer huddle/pitch/recorder commits, and defines the next shared-record demonstration. Its next-work plan supersedes historical lane assignments below.

Current implementation ownership and completion evidence: `docs/PARALLEL_STATUS.md`. Its assignments supersede the historical parallel table below.

Completed Codex implementation and exact continuation tasks: `docs/CLAUDE_RESUME.md`. Read that before restarting any of the historical tasks below.

## Objective

The user wants Site Rehearsal to win the Talona track through a memorable working demonstration, defensible differentiation, and strong evidence across the actual rubric. They welcome improvements to the product and documentation. They do not want a generic chatbot, a collection of unfinished features, or unsupported claims of a perfect score.

Keep the core product. **See tomorrow's mistake before it gets built.** The judge should remember the red ghost wall, the 40 cm mismatch, and the messages that explain why the crew might use the wrong line.

This file is the execution handoff. `AGENTS.md` remains the project instruction source; `docs/winning-assessment.md` preserves the audit, competitive sources and rationale. `docs/demo-script.md` remains the operational presenter script until an authorized task updates and verifies it. Do not create another competing script.

## Read in this order

1. `AGENTS.md` and this brief.
2. `docs/winning-assessment.md`: research and known limitations.
3. `TEAM.md` and `AGENT_BRIEF.md`: applicable ownership; do not trust stale completion boxes over code.
4. `docs/demo-script.md`, `docs/pitch.md`, `docs/judging-map.md`, `docs/submission.md` for presentation work.
5. `docs/architecture.md`, relevant contracts, and folder instructions before implementation.

The original challenge was found in `.claude/worktrees/agent-a06e5bc2dbbac7a7e/Case_Book_01_Systems_for_Built_Space (1).docx`. That local worktree may not exist on another machine. The challenge summary and provenance are preserved in the assessment. The case book contains draft markers; check organizer updates for changes. Do not mistake another track's detailed rubric for Talona's.

## Verified baseline, not a live status board

Audit date: 14 November 2026. Checkout: `integration/full-data-demo`, `2b00719`.

| Evidence | Result at audit |
|---|---|
| Typecheck | Passed |
| Root unit tests | 280 passed |
| HTTP demo tests | 19 passed |
| MCP tests | 30 passed |
| Web production build | Passed; optional 3D bundle size warning |
| `npm run eval` | 15 caught, 0 missed, 0 false alarms on the synthetic golden set |
| Live-only evaluation | 14 caught, 1 missed; OW3 is caught by rehearsal |
| Combined evaluation scope | 190 synthetic messages, 15 labelled cases |
| Full visual rehearsal and reviewed video | Not verified in this audit |
| Final submission and organizer-confirmed destination | Not found in the inspected documentation |

The full core loop, crew questions, briefings, policy agent, MCP and 3D already exist. Do not rebuild them because `TEAM.md` says otherwise. The local main reference lagged the integration commit; current remote status was not established. Inspect and refresh safely before claiming a merge is needed.

An additional demo start failed because ports 5173 and 8787 were already occupied. Existing services returned healthy/offline API and HTTP 200 web responses. Their checkout identity was not established. Do not kill another agent's process or treat those responses as visual proof.

## Positioning and research conclusions

Talona already describes site records, change detection, crew follow-ups and sourced answers. Buildots offers construction analysis, ALICE offers scheduling scenarios, OpenSpace offers visual BIM comparison, and Procore offers construction agents. Primary source links and the comparison are in `docs/winning-assessment.md`.

Our strongest distinction is the combination of:

- A crew's stated intended work.
- The latest recorded geometry and the older version available through that crew's threads.
- A spatial mismatch shown as a ghost with source messages.
- Deterministic checks before execution, followed by a visible correction and learning loop.

Treat this as a defensible product position, not proof of market exclusivity. Other teams' submissions were not inspected. Say we built a prototype that complements Talona's context layer; do not imply a partnership, integration or deployment.

The useful model has three parts: latest site record, crew-accessible record, and intended work. The difference between them explains the risk. Thread access is a proxy for information availability, not proof of what a person believes or has read.

## Work queue

### Historical parallel assignments (superseded)

These assignments were launched in separate agent tasks after inspecting the checked-out `win/integration` worktree. They are active investigations/implementation tasks, not completed features. Check branch/worktree status and agent reports before changing their files or assigning a duplicate task. Claude Code's other branches (`n/rail`, `o/feed`, `p/phone-slider`) exist locally; inspect their diffs before integrating or redoing their work.

| Lane | Assigned outcome | Ownership / boundary |
|---|---|---|
| Ghost reveal | Clean reveal, large readable 40 cm mismatch, resolve apparent fix/UI timing contradiction | `web/`; coordinate with existing N/O/P branch changes; do not rewrite another branch blindly |
| Live input + evaluation | Diagnose paraphrase cache miss, honest offline UX or opt-in live demo, separately scored unseen paraphrases | `server/extract/`, `eval/`, narrowly scoped `data/`; preserve golden labels/cache and offline demo; no contract edits |
| Huddle + messages | Rank top three urgent next-day issues, deduplicate queue, improve sourced crew text | Inspect `server/checks/` and `web/`; coordinate with ghost lane if UI paths overlap; no contract edits |

**Not assigned yet:** acknowledgement/receipt, learning from dismissed alerts, and text-only sheet revisions. The first two can change message/finding/learning semantics; sheet revisions explicitly extend the frozen data model and prior scope decision. Inspect required contracts and propose the smallest changes before assigning. The user says winning takes priority and authorizes reconsidering earlier kill decisions; still preserve auditability, source IDs, uncertainty and a working demo.

**Submission / eligibility:** still open. No agent has been asked to contact organizers, team size eligibility is unclear, and there is no verified form destination or final video. Prepare a concrete status/checklist in docs; never claim those external steps are complete without evidence.

Work on the first applicable unfinished task inside the assigned scope. Before freeze, prioritize the existing demonstration and correctness. After freeze, preserve the submitted revision and identify any further work as post-submission. Do not begin optional features merely because this file lists them.

### P0: establish a release that can be demonstrated

**Inspect first:** branch status, current main/PR state, `docs/demo-script.md`, presenter code, cache entries, video setup and submission draft.

**Deliver:** one selected revision; full visual rehearsal; reviewed three-minute recording; current run instructions; accurate submission checklist. Align the spoken pitch with the operational script rather than maintaining conflicting timings.

**Acceptance:**

- Start clean and demonstrate all ten beats without fixture fallback.
- Build selects the correct wall and source. Sending the scripted phone text produces its own sourced finding, not merely an unexplained pre-existing ghost.
- Fix targets the displayed W-12 issue. The resulting state and message match the actual implementation.
- The nickname is unresolved on run one, mapped explicitly, and resolved from the same words on run two.
- The video shows readable sources, the synthetic-data label and measured results. Review the entire take; skipped recorder controls are failures.
- Confirm team details, private repository access and the actual form destination. Never mark submission complete without confirmation of the submitted artifact/form.

### P1: correct claims and expose uncertainty

**Inspect:** `server/checks/rehearse.ts`, `server/checks/geometry.ts`, `server/api/session.ts`, `server/query/answer.ts`, `mcp/tools.ts`, presenter wording and pitch.

**Deliver:** consistent explanations of what the system knows and does.

**Acceptance:**

- Rehearsal is described as time-slot checks, not construction physics or simulated task completion.
- Sending a correction is not described as a crew acknowledgement or verified physical resolution.
- CLEAR means no conflict found in the available record, not physical safety or robot entry permission.
- Seeded floor geometry is disclosed; chat updates the model rather than reconstructing a floor from nothing.
- Offline cached replay and live extraction are distinguished. Unknown uncached text has an honest outcome.
- Learning is stored correction/memory and rules, not retraining or demonstrated general intelligence.
- Autonomous follow-ups are described according to actual replay/session execution; do not claim a production scheduler or real messaging delivery without implementation and evidence.

### P2: strengthen evidence beyond the tuned scenario

**Inspect:** `eval/`, `data/labels.json`, cache provenance, extraction report and tests. Golden cases were used during development; do not rename them a holdout.

**Deliver:** a separately labelled challenge set written before running the system. Keep original labels and golden caches intact. Extend the existing evaluation entry point explicitly if adding reports.

**Cases:** unseen phrasing; an unambiguous harmless look-alike; ambiguous room nickname; a cancellation; a second revision after an earlier correction; an already informed crew; an uncertain move; a plan correction that creates a different clash.

**Acceptance:** report actual catches, misses, false alarms and extraction failures separately. An offline cache miss is not a successful negative. New evaluation results remain separate from the golden regression results. Do not tune on a holdout and continue calling it unseen. No invented savings, latency or accuracy figures.

**Judge-visible evidence:** show that live-only misses OW3 and the evening check catches it. This explains the value of two triggers more convincingly than a single perfect aggregate.

### P3: make correction confirmation honest and visible

This is proposed, not implemented. Scope the smallest compatible change before coding; propose any required frozen-contract change rather than bypassing it with local types.

**Desired flow:** risk detected -> correction approved -> message sent -> confirmation pending -> sourced crew acknowledgement -> recheck.

**Acceptance:** a dispatched message is not an acknowledgement; an acknowledgement identifies the relevant revision; a late acknowledgement cannot clear a newer change; duplicates are idempotent; uncertainty remains visible; the original incident and messages remain inspectable. Rechecking the record never certifies physical work.

**Demo effect:** after one tap the judge sees that the correction was sent. The crew confirms the new line, and the record updates. Use only if implemented and rehearsed; otherwise describe the current dispatch assumption explicitly.

### P4: preview a correction and recheck its consequences

Optional scope growth. Begin only when release blockers and the correctness boundary are handled and there is time before freeze.

**Desired flow:** choose a proposed slot correction for a space clash -> check a copied scene with the existing four rules -> compare original and proposed findings -> commit only through an implemented, approved path.

**Acceptance:** preview does not mutate the live scene; sources survive; a candidate that creates another conflict shows it; unresolved issues remain visible; discard restores the original view; approved changes have an audit trail. No magic “all clear” animation or fabricated counterfactual outcome.

Prefer one supported correction to a new optimizer, new dependency or generalized planning framework. This is a narrow comparison of recorded plans, not a claim to simulate the physical future.

## A demonstration judges can remember

The story is **one wall, two recorded versions, one avoidable mistake**. Use “40 cm” as the visual anchor; it is geometry from the scenario, not an impact metric.

Suggested creative direction for the next authorized presentation pass:

1. Open with the floor and the line **“Tomorrow's mistake. Visible tonight.”** State that this is simulated site data immediately.
2. Show the architect's message and the plumber's intended work. Let the audience understand the disagreement before introducing architecture.
3. Reveal the red old line next to the latest recorded line. Hold the frame briefly so the judge can see the 40 cm gap. Show both source messages alongside it.
4. Explain the risk in one sentence: “The change is in the office thread; this crew's available record still has the old line.”
5. Show the actual correction flow. If confirmation or preview has not shipped, do not narrate it as shipped.
6. Show one autonomous question for a silent crew, then the same nickname failing and succeeding across the learning loop.
7. Close with actual evaluation results and return to the same wall: **“See tomorrow's mistake before it gets built.”**

This is a creative proposal, not a replacement timed script. Fold only verified beats into `docs/demo-script.md` and time the complete run before recording. Avoid fitting every optional feature into three minutes. Keep 3D, full MCP tooling and architecture detail for questions unless they make the central story clearer.

Additional memorable proof, if it can be demonstrated with existing capabilities: show an ambiguous nickname and the system declining to guess. A short, visible example of uncertainty makes the later confident geometry finding more credible. Use captions large enough to read in the actual recording; show the evidence in the product rather than covering it with narration.

For the robot vision, describe the same sourced record being queried by another client. Do not imply a physical robot has been controlled or that absence of recorded bookings proves a route is safe.

## Impact and rubric evidence

| Category | Points | Proof to put in front of judges |
|---|---:|---|
| Technical implementation | 35 | Real phone-to-scene-to-check path, evidence, repeatable tests and honest unseen-case results |
| Autonomous operation and impact | 30 | Triggered detection, selective questions, escalation/approval boundary and a useful correction |
| Learning loop and vision | 15 | Same input before/after an explicit correction; inspectable memory; shared record for other clients |
| Demo and presentation | 20 | Readable ghost reveal, causal story, reviewed video, accurate claims and runnable submission |

Talona's detailed rubric cells were blank in the inspected case book. No official subweights or guaranteed scoring thresholds are known. Rhomberg's hotel holdout and feedback requirements are not Talona requirements.

Proposed pilot: one floor, one superintendent, shadow mode, authorized records, human review before real instructions. Obtain actual mentor/practitioner feedback. Record useful versus unhelpful alerts, missed changes, review effort and acknowledged corrections; these are future measures, not claimed results. Do not claim a customer, pilot agreement or money saved without evidence.

## Verification and agent handoff

Use appropriate checks for the changes made. Full release gate:

```text
npm run typecheck
npm test
npm run test -w @site/mcp
npm run eval
npm run e2e
npm run build -w @site/web
npm run demo
```

On this Windows host, use `npm.cmd` if PowerShell blocks `npm.ps1`. Do not weaken system execution policy. A live server already occupying a port is not a reason to terminate it without identifying ownership.

Automated tests do not replace browser rehearsal. Do not call the video done because the recorder created a file. Document any checks that could not be run and what remains uncertain. Documentation-only edits need link/content and diff checks, not an invented claim that the application was retested.

At the end of each task, record:

- Completed behavior and changed files.
- Tests and visual evidence actually observed.
- Remaining limits and any metric changes.
- Next applicable task, and whether a proposal remains unimplemented.

Keep `TEAM.md` for current delivery status, `docs/judging-map.md` for criterion-to-evidence mapping, `docs/submission.md` for the final submission text, and `docs/decisions.md` for decisions made. Update them when their facts change. Do not rewrite the dated assessment as if later results were observed during the original audit.

## Copyable prompt for the next agent

> Read AGENTS.md, docs/WINNING_BRIEF.md and docs/winning-assessment.md. Inspect the current branch and implementation before relying on TEAM.md. Our goal is a memorable, evidence-backed Talona submission centered on the ghost wall and an honest correction loop. State the highest-priority unfinished task within my assigned scope, then execute it with appropriate verification. Preserve the working offline demo and frozen contracts. Distinguish proposals from implemented features and record remaining work. Do not invent scores, impact, competitor exclusivity, or completed submission steps.
