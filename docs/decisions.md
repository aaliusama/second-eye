# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, I: e2e/ tests the demo story over HTTP against a spawned server (port 8790); it imports no server internals and is excluded from `npm test` by the root include pattern. Run with `npx vitest run --config e2e/vitest.config.ts`.
- 2026-11-13, I: submission and pitch carry no numbers; every figure is a `[[from npm run eval]]` placeholder filled from the final eval run. The $1.85T figure is quoted only as the case book states it.
