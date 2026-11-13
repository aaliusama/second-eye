# Architecture

Owner: A. Read before adding a module or a dependency.

## One loop, one engine, two triggers

```
chat message -> server/extract -> operations + intents -> server/model -> scene + plan -> server/checks -> findings + fixes -> server/api -> web
                    ^                                                                                   |
                    +---------------- server/learning (approved fixes, nicknames, crews that misread) <--+
```

- Live trigger: a crew states an intent, `runChecks(scene, plan, intent)` runs at once.
- Evening trigger: a `rehearse` event in the replay steps tomorrow's plan, `rehearse(scene, plan)`.

## Rules that shape the code

- The LLM extracts facts (`server/extract/`). Rules decide (`server/checks/`). No LLM call in checks.
- `npm run demo` plays `data/replay.golden.json` with `data/llm-cache/`. Live calls only with `LIVE_LLM=1`.
- Replay time only. Same input, same output.
- Every operation and finding carries `sourceMessageId` and is logged as one JSON line.
- The flat SVG view and the 3D view render the same scene from `contracts/`.

## Workspaces

| Workspace | Runs with | Notes |
|---|---|---|
| `contracts` | imported as `@site/contracts` | zod schemas + types, fixtures at `@site/contracts/fixtures` |
| `server` | `tsx` | plain `node:http`, port 8787 |
| `eval` | `tsx` | imports the replay from `@site/server/replay` |
| `web` | Vite | proxies `/api` to the server |

## Dependencies

| Package | Where | Licence |
|---|---|---|
| zod | contracts | MIT |
| react, react-dom | web | MIT |
| three, @react-three/fiber, @react-three/drei | web | MIT |
| zustand | web | MIT |
| @fontsource-variable/archivo | web | OFL-1.1 (font) |
| vite, @vitejs/plugin-react, vitest, tsx, typescript, concurrently | dev | MIT / Apache-2.0 |
