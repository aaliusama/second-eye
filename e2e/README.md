# e2e: the demo story over HTTP

Starts a real server (`node --import tsx server/index.ts`, not `npx`, which takes ~40 s per call on Windows; port 8790, `LIVE_LLM=0`) and walks the demo beats through the API. It imports nothing from `server/`, so lanes can change internals freely; only the HTTP shapes in `contracts/` matter.

Run:

```
npx vitest run --config e2e/vitest.config.ts
```

Port in use? `E2E_PORT=8791 npx vitest run --config e2e/vitest.config.ts`.

- `npm test` does not pick these up: the root `vitest.config.ts` includes only `{contracts,server,eval}/**/*.test.ts`.
- Run with `npm run e2e` (root script: `vitest run --config e2e/vitest.config.ts`). Plain `vitest run e2e` will NOT work, because it uses the root config, whose include pattern skips `e2e/`.
- Three blocks: the golden-replay story (state, rehearsal, ask, briefing, digest, agent, MCP robot, fix approval, run 2); the phone beats (beat 3 live: plumbing's scripted text gives the W-12 ghost and a HOLD DM; beats 8-9: "the blue room" unresolved on run 1, mapped to `room-204`, resolved on run 2 - lane A's "Done when"); and the planted cases from `data/labels.json` (every case `eval/results.detail.json` reports caught must have a finding with its check and trigger message over `/api/state` + `/api/rehearsal`; missed cases are skipped, not hidden).
- Each later block starts with `POST /api/reset {keepLearning:false}`, so it does not depend on what earlier tests approved.
- New beats that are still being built go in as `it.todo`; turn each into a real assertion when its lane lands on main.
- The server is killed in `afterAll` (`taskkill /T /F` on Windows, so the npx → tsx → node tree dies).
