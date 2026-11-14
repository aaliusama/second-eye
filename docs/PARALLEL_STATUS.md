# Parallel implementation status

## Lanes B-E of `docs/NEXT_WORK.md` (14 Nov, branch `lanes-bcde/integration`)

- **Lane B, measured geometry:** merged into `lanes-bcde/integration`. Latest-change findings carry `measure.clearance` (work face, perpendicular offset, outcome, required clear depth and tolerance per trade from `server/checks/geometry-rules.ts`); space clash intersects work zones (`measure.overlap`). Golden eval unchanged at 15/0/0.
- **Lane C, plan graph:** merged. `rehearse()` returns `graph` (prerequisite edges, critical path by half-day slots, one-slot slips); order_of_work shares its edge functions.
- **Lane D, web depth:** merged. "How it decided" trace, crew lens in 3D, clearance/overlap drawings, dependency arrows and critical path on the timeline.
- **Lane E, story (branch `lanes-bcde/e-story`):** architecture, README "How it works", demo script, pitch and video README rewritten for the new depth; README screenshots refreshed (`workspace.png`, `who-knows.png`) and added (`how-it-decided.png`, `critical-path.png`). The presenter gained a twelfth beat, "How it decided" (only `web/src/present/` changed). Checked: typecheck, 378 unit tests, eval 15/0/0, web build, e2e 24/24, all twelve beats screenshotted at desktop and phone width without page errors, and a presenter take recorded with a clean log and reviewed frame by frame. The numbers table in the README (lane A) was not edited. Not merged to `main`.

## Second product-design pass: finished by Claude (14 Nov, morning)

Codex started this pass and reached its usage limit about five hours before freeze. At the user's request Claude finished Codex's uncommitted `web/` work, committed it and merged it to `main`. Codex: pull before editing; `web/` is free again. Read `docs/CLAUDE_LANE.md` for the full list.

- **Persona correction:** the user asked for the person *who lives this pain*. This was misheard as "who lives in Spain". `docs/SPAIN_FIELD_RESEARCH.md` was removed and replaced by `docs/SITE_MANAGER_PAIN.md`, a superintendent before 07:00. Do not reintroduce a Spain or Spanish-localisation angle.
- **Kept from Codex:** the incident list (`web/src/IncidentFocus.tsx`), the Earlier / Compare / Latest toggle, the crew chat docked in a desk tab, folded crew plan lanes, the inspector in the desk.
- **Claude's changes:** latest-change incidents rank first. Cards show the planned work (crew, task, day, slot) and a visible primary "Send correction to <crew>". After sending, the card shows an amber "Waiting for reply" note. The header shows "N to settle before <day> <slot>". Duplicate task lines fixed (a React key warning). The compare toolbar no longer carries a subtitle.
- **Verified:** web typecheck and build pass. Headless Edge stepped through all eleven presenter beats with no page errors; the screenshots looked right. Ghost red, then amber after Send, then gone after Confirm. No horizontal overflow at 390 px. New screenshots: `docs/assets/design-review/desk-priorities.png` and `desk-sent.png`. Full tests, e2e and eval were not rerun; the user reruns them at the end.

## Completed Codex work: README and interface redesign

README and web design work is complete; read `docs/DESIGN_REVIEW.md` and the top of `docs/CLAUDE_RESUME.md` before editing. The design ownership reservation is released. All eleven beats were exercised; 311 root tests, 24 HTTP tests, typecheck and build passed. Screenshots are retained in `docs/assets/design-review/`. Preserve the new section navigation, source disclosures and pending-confirmation semantics.

Claude can continue server correctness, live extraction/evaluation and MCP shared-record validation. Other agents' backend changes were preserved; `mcp/tools.ts` was dirty at final review and is excluded from this design commit. Coordinate shared contract/root-script changes before editing. No new Talona integration or backend feature is part of this design pass. Historical completion notices below refer to earlier revisions.

Latest documentation-only review: see `docs/TALONA_ALIGNMENT.md` and the top of `docs/CLAUDE_RESUME.md`. The checkout includes subsequent commits through `a26c680`; preserve them. Next proposed lanes are visual demonstration, live extraction evidence and an existing MCP consumer of the shared incident record. No new lane was launched during this review.

Final status: both batches committed as `5a9fd3b` and pushed to `origin/win/integration`; not merged into main. Read the TOP of `docs/CLAUDE_RESUME.md` for completed features, final checks and proposed next lanes. All agents finished; no exclusive edit locks remain. Proposed lanes have not started. Historical in-progress notes below are retained as history, not current assignments.

## Second implementation batch in progress

User approved acknowledgement/receipt, text-only sheets and reversible dismissal learning together with coordinated contract changes. Root integrates contract exports, route mounts, App insertions and presenter changes. Exclusive lanes: acknowledgement owns session.ts, acknowledgement modules/component and derive.ts; sheets owns new sheets contracts/server/API/component; dismissals owns new dismissals contracts/learning/API/component. Do not start competing Claude edits on these files until final handoff. The first-batch handoff below is historical.

Latest handoff: `docs/CLAUDE_RESUME.md`. The three Codex implementation lanes have finished their scoped edits; the earlier active-status table below is historical. Combined checks: 290 unit tests, 24 HTTP tests, full typecheck and web build passed. Remaining product lanes and visual/live validation are explicitly listed in the handoff. No claim that all six original Claude lanes are complete.

This is the current coordination handoff for Codex and Claude Code. Check this file and the working tree before resuming. Earlier conversation updates overstated ongoing implementation; use actual diffs and validation reports as evidence.

## User direction

Implement the Claude review suggestions in parallel, keep work ownership distinct, preserve progress for Claude when its limit resets, and provide a final copyable handoff after implementation. The user has authorized reconsidering previous scope exclusions, including text-only sheet revision checks. Do not stop merely because an old UI branch contains overlapping historical work. Do not present unfinished investigations as completed features.

## Verified workspace

- Current branch: `win/integration`, base commit `4c97266` at this check.
- `n/rail`, `o/feed`, and `p/phone-slider` do exist locally. A previous response incorrectly said they were absent.
- Existing Claude worktrees are preserved. Their presence does not establish that their agents are still running.
- Codex agents below work on the shared integration checkout with exclusive file ownership. Claude should inspect these changes and wait for their completion/handoff before editing the same files.

## Exclusive assignments

| Agent | Files | Observed status |
|---|---|---|
| Codex ui_reveal | `web/` | Reassigned to implement on current checkout; earlier pass investigated only. Historical branches will not be overwritten or blindly merged. |
| Codex eval_paraphrase | `eval/paraphrase.ts`, `data/paraphrase-eval.json`, related evaluation documentation/tests | New files exist; agent finishing validation. No live-model results claimed yet. |
| Codex huddle_msgs | `server/query/briefing.ts`, `server/checks/fixes.ts`, their targeted tests | Code edits exist; initial targeted run had three failures. Agent assigned to resolve and validate. |
| Codex root | Coordination documents and integration review | Correcting status and recording verified evidence. |

The duplicate huddle_copy and earlier live_eval tasks are inactive. Do not restart them on these files.

## Remaining Claude lanes after coordination

- Live mode launcher and explicit offline/cache-miss feedback: current live extraction exists, but launcher/UI changes are not completed by the evaluation lane. Coordinate any web changes with ui_reveal first.
- Acknowledgement and incident receipt: not implemented by these lanes. Sent must not imply acknowledgement; newer revisions must not be cleared by old replies.
- Text-only sheet revisions: authorized for consideration by the user's latest scope override, not implemented. Coordinate required contract changes centrally.
- Reversible learning from dismissals: not implemented. Preserve evidence and avoid suppressing genuinely new incidents.
- Submission eligibility, destination and final reviewed video: still unverified; do not claim external completion.

## Completion rules

For each lane record implemented behavior, exact changed files, checks actually run, and unresolved limitations. Update this file when the lane finishes. A handoff must distinguish code present, automated checks passed, browser verified and submitted. No agent may claim a task is complete only because it was assigned.
