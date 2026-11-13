# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, F: MCP server in its own workspace `mcp/`, stdio transport, `@modelcontextprotocol/sdk` pinned at 1.32.2. It reads the site only over HTTP (`SITE_API`), never imports server code.
- 2026-11-13, F: MCP tools are read-only. No tool approves fixes or posts crew messages; decisions stay with the superintendent.
- 2026-11-13, F: `is_place_clear` returns `clear` only when the place is on record, nothing is planned in an overlapping slot and no open finding touches it. Unknown place is `unknown`; a server error is a tool error. Findings whose fix is approved count as handled.
- 2026-11-13, F: `check_plan` asks `POST /api/ask` when it exists; on 404 it answers from bookings and existing findings only and says it did not re-check.
