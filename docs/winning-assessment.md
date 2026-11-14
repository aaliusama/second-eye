# Site Rehearsal readiness and winning strategy

Assessment: 14 November 2026, local checkout `integration/full-data-demo`, commit `2b00719`. This is an evidence review and proposed plan, not a predicted jury score. No product behavior was changed by this review.

Execution handoff: [WINNING_BRIEF.md](WINNING_BRIEF.md) turns this dated assessment into prioritized tasks, acceptance criteria and a proposed memorable demonstration. Preserve this assessment as the original evidence baseline; report later results separately.

## Recommendation

Keep Site Rehearsal and the ghost wall. Position it as a spatial rehearsal of crew intent: compare the latest recorded geometry with the version available to a crew, reveal the mismatch before work starts, and show how a sourced correction changes the next check. This directly fits Talona's challenge. Additional generic chat, dashboards, agents or 3D polish would dilute the demonstration.

The strongest next improvement is to close the gap between proposing a correction and proving that it resolves the recorded conflict. Separately, sending a message must not be described as confirmed understanding by the crew. Neither software checks nor chat acknowledgements establish physical safety.

## Challenge and rubric

Read the original `Case_Book_01_Systems_for_Built_Space (1).docx` retained in `.claude/worktrees/agent-a06e5bc2dbbac7a7e/`. The document contains draft markers, so organizer announcements remain authoritative for updates. The public [event listing](https://luma.com/rrnm4pul) corroborates the two Talona directions and the 15:00 code freeze on Saturday 14 November.

Talona allows either or both: detect issues before rework; build a live picture of a physical place that people, agents or robots can use. Chats, a live record, immediate issue detection and sourced crew answers are example directions. They are not a requirement to implement every data source.

| Official category | Weight | Evidence already available | What would strengthen it |
|---|---:|---|---|
| Technical implementation | 35 | Typed extraction, provenance, deterministic checks, scene history, replay, HTTP and MCP tests | Unseen evaluation, failure examples, verified clean-start instructions and visual demo |
| Autonomous operation and impact | 30 | Intent checks, rehearsal, silent-crew questions, quiet hours, follow-up and escalation policy | Show one full autonomous sequence; distinguish dispatch from acknowledgement; obtain practitioner feedback |
| Learning loop and vision | 15 | Nickname correction changes run two; crew-on-watch behavior; read-only agent interface | Show both runs and the stored correction; explain that this is explicit memory/rules, not model retraining |
| Demo and presentation | 20 | Presenter mode, ghost reveal, script, submission draft | Reviewed three-minute video, consistent spoken timing, accessible evidence and completed submission |

Talona's detailed rubric cells are blank in the case book. Do not invent official subweights or import Rhomberg's holdout, hotel-operation, or building-design requirements. Novelty is a way to strengthen these categories, not a separate published score.

The case book requires a three-minute working demo video, written submission, runnable code and submission through the form before freeze. Talona has an explicit private-repository/IP exception. Team acceptance, judge access and the correct submission destination still need actual confirmation; do not infer them from repository settings. A live URL and pitch deck are optional in this version.

## Verified progress

Executed during this review using `npm.cmd` because this Windows PowerShell configuration blocks `npm.ps1`:

- Typecheck: passed across workspaces and e2e.
- Root unit suite: 280 passed.
- HTTP demo suite: 19 passed.
- MCP workspace suite: 30 passed.
- Web production build: passed; optional 3D chunk has a size warning.
- Evaluation: 15 caught, 0 missed, 0 false alarms across 190 synthetic replay messages and 15 labelled cases. Live alone: 14 caught, 1 missed. Rehearsal alone: 15 caught, 0 missed. The missed live case is OW3.

Evaluation output was regenerated and produced no tracked diff. These are scenario results, not independent field validation or general extraction accuracy. The extraction report separately records mismatches. Two cache entries were refreshed after observed failures, so the golden set is a development/regression set, not an unseen benchmark.

The core seven-step loop exists: extraction and scene updates, plans, intent checks, four rules, rehearsal, approval/messages, and retained corrections. Extras also exist: sourced queries, briefings/digest, policy agent, MCP tools, a robot-planning demonstration, and a second 3D renderer.

Starting another `npm run demo` failed because ports 5173 and 8787 were already occupied. The existing API reported healthy with live LLM off, and the existing web server returned HTTP 200. This is availability evidence only; it does not identify the running checkout or replace a clean-start or visual rehearsal. No complete browser rehearsal or reviewed recording was performed in this audit.

The local `origin/main` reference points to `7ebe2e8`, before the integration commit. It was not freshly fetched, so this does not establish GitHub's current state. Verify the actual submission revision before release. `TEAM.md` has stale status and unchecked tasks that already have implementations.

## Competitive research and defensible novelty

Primary product sources reviewed on 14 November 2026. Marketing descriptions establish overlap, not exhaustive capability comparisons.

| Product | Publicly described capability | Implication for our pitch |
|---|---|---|
| [Talona](https://talona.ai/) | Unifies site communications; project record, change detection, answers, check-first workflow, crew follow-ups and digests | A chat-based site copilot or change alert alone is not a strong novelty claim |
| [Talona construction](https://talona.ai/construction) | Camera-derived spatial context for crews, equipment, materials and work areas | Present our text-derived intent layer as a possible complement; do not claim a real integration |
| [Buildots Dot](https://buildots.com/blog/dot-construction-generative-ai-assistant-upgrades/) | Construction questions, forecast investigation, progress verification and explanatory analysis | Sourced construction Q&A and proactive analysis already exist |
| [ALICE](https://www.alicetechnologies.com/home) | Construction scheduling and what-if scenario exploration | Rehearsal or simulation alone is not a novel category |
| [OpenSpace](https://www.openspace.ai/blog/openspace-bim-compare-getting-the-most-out-of-bim/) | Field-accessible BIM comparison | A visual overlay alone is not sufficient differentiation |
| [Procore AI agents](https://www.procore.com/ai/agents) | Project-file cross-referencing, risk flags and drafts in review workflows | Adding more generic agents will not establish originality |

Our plausible distinction is the combination of crew intent, thread-specific access to changes, two spatial versions, deterministic conflict checking, and an explicit correction loop before the work starts. This is a positioning hypothesis supported by the inspected implementation, not a claim of patent novelty, market exclusivity, or knowledge of other teams' builds.

Suggested pitch: **“Site Rehearsal turns tomorrow's crew messages into a spatial check against the latest site record. The ghost wall shows where an outdated plan would put the work, with the messages that explain the mismatch.”**

Avoid claiming that we know what a worker thinks. The current proxy is which threads a crew can read. Describe the ghost as the outdated line available to that crew.

## Important implementation limits

1. `server/checks/rehearse.ts` runs the checks against the plan and groups findings into morning and afternoon frames. It does not simulate task completion, construction physics or downstream material changes. Call it a time-slot rehearsal, not a full construction simulator.
2. `server/checks/geometry.ts` infers knowledge from thread membership. `server/api/session.ts` records a sent correction as a geometry-history entry visible to the crew. Dispatch is not receipt, acknowledgement or verified action. The current disappearance of the ghost demonstrates model bookkeeping under that assumption.
3. `mcp/tools.ts` can return `clear` for a known room with no recorded bookings or findings. This means no recorded conflict, not physical clearance or permission for a real robot to enter.
4. Offline extraction requires cached texts; an unseen paraphrase produces no extraction. Clearly separate offline replay from live capability. Do not invite unscripted offline inputs while implying arbitrary language support.
5. `server/extract/result.ts` retains next-day plans. The current demonstration does not establish general scheduling across arbitrary days.
6. The initial floor geometry comes from `data/floor.json`; chat updates that seed. Do not say that arbitrary chat alone reconstructs a complete floor plan.
7. Quiet hours and follow-ups are exercised through replay/session processing. This audit did not establish an independently running production scheduler or real messaging delivery.

## Prioritized work remaining

### First: make the existing submission reliable

- Verify current main/PR status and choose one tested submission revision. Do not merge blindly over other work.
- Rehearse all ten presenter beats from a clean state on the presenting machine. Check source selection, the new phone finding, the matching W-12 approval, unresolved nickname in run one and resolved nickname in run two.
- Record and review the full video. The legacy recorder skips missing controls, so a saved file does not prove a successful take. Reject recordings with skipped beats.
- Align `docs/pitch.md` with `docs/demo-script.md`; their current timing and sequence differ. Replace claims of crew understanding with the actual communication assumption.
- Update `TEAM.md` to distinguish implemented, tested, visually verified and submitted. Fill real team details, video URL and submission destination only from confirmed information.

### Second: strengthen evidence before adding features

- Freeze the golden regression set. Write a separate unseen set before running the system: paraphrases, harmless similar messages, ambiguous locations, contradictory revisions, cancellations and delayed acknowledgement.
- Evaluate extraction and downstream checks separately. Do not count a no-output cache miss as a successful negative. Live-model evaluation needs an explicit controlled run; do not silently overwrite golden caches.
- Use `npm run eval` as the reporting entry point for any new quantitative claims. Extend it explicitly if adding held-out results; keep development and held-out results separate.
- Demonstrate why both triggers matter with OW3: live alone misses this case, evening rehearsal catches it. This is a stronger architectural explanation than presenting only the combined perfect result.
- Ask a superintendent or Talona mentor to review the ghost-wall decision and correction. Record actual feedback, including objections; do not claim a pilot or savings without evidence.

### Third: one bounded product improvement, if time permits

**Preview a correction and recheck it before approval.** For a space clash, compare the original plan with a proposed slot change on a copied scene; run the same four checks on both; show what clears and what remains or newly conflicts. Keep the original unchanged until a supported approval action. Require that any candidate correction remains tied to its source. Never manufacture a successful outcome.

Acceptance: the original clash is visible; preview is reversible; a correction that creates another clash is visibly rejected or still flagged; approved changes are auditable; uncertainty remains visible. This grows scope and should follow the release blockers. Any required frozen-contract change needs an explicit proposal before implementation.

A separate high-value correctness improvement is a visible “correction sent, confirmation pending” state, followed by a sourced crew acknowledgement and recheck. Preserve the original ghost-wall history. Do not let a new wall revision be cleared by an acknowledgement of an older revision. This is more defensible than claiming one dispatch fixes the physical problem.

## Pilot and pitch

Propose a limited shadow-mode trial with a superintendent on one floor. Import authorized records; let the superintendent review all suggestions; send no real work instructions automatically. Track alert usefulness, missed changes, review effort and acknowledged corrections against a manually reviewed record. These are proposed measures, not current results.

The core demo should spend its time on one visible causal story: recorded change, crew intent, ghost and evidence, proposed correction, recheck, then learned nickname on run two. Show one autonomous silent-crew question in the action trail. Keep 3D and MCP as brief supporting evidence or Q&A material.

Do not add cameras, BIM import, real messaging integrations, additional buildings or a new agent framework for this submission. The largest remaining gains are clearer proof, a credible correction boundary, and a complete delivery.
