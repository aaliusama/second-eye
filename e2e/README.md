# e2e: the demo story over HTTP

Starts a real server (`npx tsx server/index.ts`, port 8790, `LIVE_LLM=0`) and walks the demo beats through the API. It imports nothing from `server/`, so lanes can change internals freely; only the HTTP shapes in `contracts/` matter.

Run:

```
npx vitest run --config e2e/vitest.config.ts
```

Port in use? `E2E_PORT=8791 npx vitest run --config e2e/vitest.config.ts`.

- `npm test` does not pick these up: the root `vitest.config.ts` includes only `{contracts,server,eval}/**/*.test.ts`.
- Lead: add `"e2e": "vitest run --config e2e/vitest.config.ts"` to the root `package.json` scripts. Plain `vitest run e2e` will NOT work, because it uses the root config, whose include pattern skips `e2e/`.
- Beats that are still being built are `it.todo`. When a lane lands on main, turn its todo into a real assertion.
- The server is killed in `afterAll` (`taskkill /T /F` on Windows, so the npx → tsx → node tree dies).
