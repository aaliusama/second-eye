# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, E: crews ask the record via `server/query` (POST /api/ask, GET /api/briefing, GET /api/digest). An LLM (Groq `openai/gpt-oss-120b`, JSON mode, temperature 0) only turns the question into a structured query; the answer is computed by rules from scene, plan, findings and messages.
- 2026-11-13, E: question parse order: cache `server/query/cache/` -> live Groq if LIVE_LLM=1 -> deterministic keyword parser -> not found (forwarded to the superintendent). Unknown ids in any parse become not found, never guessed.
- 2026-11-13, E: any question asking to change the design, choose a material or decide is escalated to the superintendent, whatever the parser said. The system never decides.
- 2026-11-13, E: "can I start" runs the four checks on a synthetic intent and answers HOLD or CLEAR. With no own task in that place, it checks the elements inside the place.
- 2026-11-13, E: shapes (Question, StructuredQuery, Answer) live in `server/query/schema.ts` until A lifts them into contracts.
