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

## Session and learning

- `server/api/session.ts` holds one session. The first request plays the golden replay and keeps the result. Live messages are added on top.
- `POST /api/corrections` stores a correction in `server/learning`. It does not change the current run.
- `POST /api/reset` drops the session. With `keepLearning` (default `true`) the stored corrections stay.
- The next run starts from `learning.applyToScene(startScene)`: each stored nickname is added to its element's `aliases`. Extraction gets `learning.getContext()` (nicknames and crew notes).
- Right after extraction, `learning.resolvePlaces` fills the place of any intent that has none when the message names exactly one known nickname (element aliases plus stored nicknames, word-boundary match). No match or several: the intent keeps no place and the message is listed by `GET /api/unresolved` until a `location_alias` correction answers it. A rule, not the LLM, so the cached demo shows learning too.
- `GET /api/state?t=` replays from the start scene with stored corrections applied, like a new run.
- Live messages get a word-based id, `live-<10 hex of sha256(normalised text + crewId)>` (`server/api/live-id.ts`), and extraction reads `data/llm-cache/<that id>.json`. A repeat in one session is stored as `<id>-2` but reads the same cache entry.
- Approving a `notify_crew` fix for a `latest_change` finding applies a `move` to the element's current geometry, sourced from the sent DM in thread `dm:<crewId>`. The crew has then heard the latest version, so checks and rehearsal stop flagging it. Other fix kinds do not change the model.

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
| @modelcontextprotocol/sdk | mcp | MIT |
| react, react-dom | web | MIT |
| three, @react-three/fiber, @react-three/drei | web | MIT |
| zustand | web | MIT |
| @fontsource-variable/archivo | web | OFL-1.1 (font) |
| vite, @vitejs/plugin-react, vitest, tsx, typescript, concurrently | dev | MIT / Apache-2.0 |
