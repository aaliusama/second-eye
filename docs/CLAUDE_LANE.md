# Claude lane status (for Codex and other agents)

Updated 14 November 2026, morning, on `win/integration` after `91de1ce`. Claude edits only the paths listed under "Claude owns". It does not edit `web/`, `README.md`, `docs/assets/`, or the top sections of `docs/PARALLEL_STATUS.md` and `docs/CLAUDE_RESUME.md` while the Codex design pass is active. Codex: read this file instead of expecting Claude notes in those documents.

## Update: Claude finished Codex's design pass

Codex reached its usage limit, so the user asked Claude to finish its uncommitted `web/` design pass and merge everything to `main`. See the top of `docs/PARALLEL_STATUS.md` for exactly what changed and how it was verified. The persona is the superintendent who lives this pain (`docs/SITE_MANAGER_PAIN.md`); the earlier "Spain" research was a mishearing and was removed. `web/` ownership is free again; whoever edits next should pull first and note it here.

## Claude owns now

- `mcp/` (tools, tests, README)
- server correctness, extraction and evaluation, once a task is picked: `server/` (except shared routes and contracts, which need coordination), `eval/`, separately named challenge fixtures in `data/`
- append-only entries in `docs/decisions.md`; the status section of `docs/TALONA_ALIGNMENT.md`; this file

## Done and committed: MCP shared-record validation

- `mcp/shared-record.test.ts` hosts the real HTTP API in-process (golden replay, `LIVE_LLM=0`) and follows the W-12 ghost (`f-latest_change-m-002-W-12`) before send, after send and after the simulated crew reply. At each step the MCP latest-change findings (id, source, evidence, ghost) must equal what the web reads from `/api/state` and `/api/rehearsal`.
- `get_site_state`, `get_findings` and `is_place_clear` now expose `awaitingConfirmation` for a latest-change finding whose fix is approved but still open. Text answers append "correction sent, awaiting crew confirmation". The robot's skip line shows this between the Send and Confirm beats. This is derived from existing API data; no contract or server change.
- Bug fixed: in demo mode `check_plan` passed the `/api/ask` reply "I could not tell what you asked" on as its answer. The keyword parser does not match the generated "Can <crew> <task> in <place> on <day>" sentence. The tool now falls back to bookings and findings and states why (`data.note`).
- Checks run: the MCP tests pass (35) and the `@site/mcp` typecheck passes. The full suite, e2e and eval were not rerun; the user will rerun them at the end.

## UI hooks Codex may use (optional, no obligation)

- If the presenter or agent panel shows MCP or robot output, the Send beat can now show "awaiting crew confirmation" from the agent's side, matching the amber ghost.

## Not done by Claude

- Screenshot rehearsal, N/O/P branch review, video and submission details belong to Codex or the user.
- `/api/ask` still does not parse "Can <crew name> <task> …" questions. Fixing that is a `server/query/` change; it is not started. Tell Claude before anyone else takes it.
