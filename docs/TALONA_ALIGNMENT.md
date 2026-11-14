# Talona alignment and next evidence

Updated 14 November 2026. Documentation review against the original case book, public challenge, and current branch through `a26c680`. This is a requirements interpretation and work plan, not a new test run or a predicted score.

## What the challenge asks

The problem is missing, stale and fragmented physical-world context: who intends to do what, what changed, and whether the affected crew has the relevant information before acting. Understanding a sentence alone does not establish that context.

The brief permits either or both directions: prevent construction rework/delays; build a live picture of a place that people, agents or robots can use. Connecting existing site channels, maintaining a live record, flagging issues and answering sourced questions are example directions, not a requirement to implement every channel.

No requirement to integrate a Talona API was found in the inspected brief. We have a standalone prototype with HTTP/MCP interfaces. A future Talona connection needs a confirmed interface, access and data mapping; neither a Talona logo nor a simulated adapter establishes an integration. Do not invent an API or describe a partnership.

The published categories are technical implementation (35), autonomous operation and impact (30), learning loop and vision (15), demo and presentation (20). Detailed scoring cells in the case book are blank. Do not import the Rhomberg track's year-long hotel simulation or building-design feedback requirements.

## Product position

**Site Rehearsal checks tomorrow's intended work against today's recorded site context, and shows the mistake before it gets built.**

The useful distinction is the combination of intended work, latest recorded geometry, crew-accessible information, spatial mismatch and a sourced correction/confirmation loop. Talona already describes site information aggregation, change detection and sourced answers. Rehearsal plus confirmation is our positioning hypothesis, not proof of uniqueness.

Long-term direction (our interpretation): site evidence -> shared evolving record -> intended work -> predicted conflict -> approved correction -> explicit confirmation -> retained learning. Humans and software agents consume the same record. Observations, reported facts, plans and unknowns must remain distinguishable; the record is not verified physical reality.

## Current fit and weaknesses

| Capability | Current evidence | Gap and acceptance for next work |
|---|---|---|
| Evolving context | Sourced scene operations/history and crew plans | Synthetic text-derived model; show the source and uncertainty for one complete incident |
| Prevent work on old information | Ghost geometry, deterministic checks, rehearsal | Visually prove clean start, one readable mismatch and correct transitions across all eleven beats |
| Confirmation | Send keeps latest-change risk open; explicit simulated reply rechecks; stale replies rejected | Show Send and Confirm separately; receipt does not establish understanding, inspection or completed work |
| Drawing revision awareness | Explicit issued revision versus crew-stated revision parsed from text | No attachment reading or drawing geometry extraction; make that boundary visible |
| Existing workflows | Replay/chat simulator and opt-in live extraction | No real messaging connector; live service and unfamiliar-text accuracy remain unverified |
| Machine-usable context | Existing HTTP/MCP query tools | Demonstrate the same incident before send, after send and after confirmation; return source-backed recorded constraints, not physical permission |
| Learning | Nickname corrections and reversible exact-incident review memory | Show before/after and Undo; no retraining or broad generalization claim |
| Manageable attention | Top-three huddle; commit `0163fa6` groups by check/crews/elements | Grouping is a heuristic, not task/time-aware incident identity or complete approval-queue deduplication |
| Evidence | Last recorded implementation checks: 310 root, 24 HTTP and 30 MCP tests; golden eval 15/0/0 | These results predate the three later commits; rerun appropriate checks for the release. Golden data is development/regression evidence, not a blind test or field performance |
| Delivery | Updated eleven-beat pitch/submission and presenter-driven recorder in `02bb5f9`/`a26c680` | Recorder implementation is not a reviewed video. Submission destination, eligibility and final recording still need verification |

## Next coordinated work

1. **Visual/demo lane (`web/`, `docs/demo-script.md`):** capture the eleven beats, verify initial reveal and Send/Confirm, then make only screenshot-supported layout improvements. Preserve existing N/O/P worktrees.
2. **Extraction/evidence lane (`server/extract/`, `eval/`, separate challenge fixtures):** establish service availability, test paraphrases, ambiguity and negatives, retain failed/unavailable results, and score independently from golden replay. Known failed examples are development cases, not unseen holdouts.
3. **Context-consumer lane (`mcp/`, scoped integration tests):** first exercise the existing tools for one incident before/after dispatch/confirmation; prove they agree with the UI's shared record. Do not build a second scene, robot controller or speculative Talona adapter. Coordinate any shared server/contract changes with the integrator.

Integrator owns shared contracts/routes, handoffs and final verification. Presentation work should use the newly updated pitch/recorder rather than recreate it. These lanes are proposed, not started by this documentation update.

Judge-facing acceptance: one sourced change -> incompatible crew intent -> ghost -> approved message (still pending) -> explicit simulated confirmation -> recheck -> same updated constraint visible to an agent. Show stored learning separately if it does not fit this incident. Recheck other unresolved findings before describing any place as clear.

## Sources and open questions

- Original case book: `.claude/worktrees/agent-a06e5bc2dbbac7a7e/Case_Book_01_Systems_for_Built_Space (1).docx`, Talona section. It contains draft markers; organizer updates take precedence. This local source may not travel with a clone.
- [Public challenge](https://luma.com/rrnm4pul): corroborates the two directions.
- [Talona product](https://talona.ai/): describes site inputs, change records and sourced answers; establishes product overlap, not integration documentation.
- [Talona construction](https://talona.ai/construction): describes camera-derived spatial context; our text/intent model is a possible complement, not an implemented connection.

Useful mentor questions to prepare, not messages sent: Is a partner interface or sample event feed available? Which pre-work decision is most valuable to a superintendent? What evidence would make the crew-context mismatch credible? Confirm current submission/eligibility terms through the organizer channel before relying on the draft case book.

Do not quote marketing savings as our measured impact. Do not promise a perfect rubric score. No external outreach, integration, recording or submission is claimed by this update.
