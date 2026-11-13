# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, C: eval pools live and evening rehearsal findings and counts one per incident: (check, source message, sorted elementIds); for space_clash the message part is the sorted source + evidence pair, because a clash is symmetric. Repeated alerts for one incident count once. Detail (trigger per case, per crew, confidence thresholds 0.5/0.7/0.9) goes to eval/results.detail.json; eval/results.json keeps the contract shape.
- 2026-11-13, C: confidence threshold = lowest confidence of the plan tasks behind an incident; an incident with no plan task on record is kept at every threshold.
- 2026-11-13, C: live and rehearsal findings can share an id (same check, source message and key) with a different trigger. Clients key findings by (id, trigger). Ids unchanged because fix ids and the evening fix dedupe in server/model/replay.ts rely on them.
- 2026-11-13, C: rehearsal findings keep the time they were found (scene time), not the frame time; a full_day finding shows in two frames and must stay one finding. The slider uses frame.time.
- 2026-11-13, C: order_of_work is satisfied when the same crew does the prerequisite earlier in its own order in the same day and slot (close wall, then finish drywall, in one morning).
- 2026-11-13, A: live message ids come from the words (sha256 of normalised text + crewId), so scripted phone messages hit data/llm-cache offline; a repeat in one session is stored as `-2` and reads the same entry.
- 2026-11-13, A: learning resolves an unclear place by rule after extraction (exactly one known nickname in the text), so run 2 differs from run 1 with cached LLM output; unresolved messages go to GET /api/unresolved, a non-contract route until A adds it to contracts.
- 2026-11-13, A: approving a notify_crew fix for a latest_change finding records a move to the current geometry from the sent DM, so the crew has heard it; other fix kinds change nothing in the model.
- 2026-11-13, A: GET /api/state?t= applies stored corrections like a new run; docs changed to match the code.
