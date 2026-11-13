# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, A: live message ids come from the words (sha256 of normalised text + crewId), so scripted phone messages hit data/llm-cache offline; a repeat in one session is stored as `-2` and reads the same entry.
- 2026-11-13, A: learning resolves an unclear place by rule after extraction (exactly one known nickname in the text), so run 2 differs from run 1 with cached LLM output; unresolved messages go to GET /api/unresolved, a non-contract route until A adds it to contracts.
- 2026-11-13, A: approving a notify_crew fix for a latest_change finding records a move to the current geometry from the sent DM, so the crew has heard it; other fix kinds change nothing in the model.
- 2026-11-13, A: GET /api/state?t= applies stored corrections like a new run; docs changed to match the code.
