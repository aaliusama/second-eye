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
- The pipeline runs in `server/model/replay.ts` (golden replay) and `server/api/session.ts` (live posts). Both pass the scene the message lands on to extraction.

## Extraction (`server/extract/`)

- Demo mode reads `data/llm-cache/<messageId>.json` only. No entry: empty result, logged `extract.cache_miss`.
- `LIVE_LLM=1`: a cache entry still wins. Otherwise one Groq call (`llm.ts`, plain `fetch`, JSON mode, temperature 0, waits and retries on 429). The prompt is `prompts/extract.md`, filled with the scene's elements, learned nicknames and crews.
- `validate.ts` turns the raw reply into an `ExtractResult` checked by the zod schemas in `contracts/`. The model gives facts only: ids (`op-<msg>-<n>`, `task-<msg>-<n>`, `intent-<msg>-<n>`), time, thread and `sourceMessageId` are forced from the message, and an intent takes the sender's crew.
- Operations on unknown elements or crews are dropped and an unknown intent place is left out, each logged as `extract.rejected`. Never guessed.
- Invalid JSON or schema: one retry with the error. Still invalid: empty result and `extract.error`, never a throw.
- A good live result is written to `data/llm-cache/`. `build-cache.ts` does this for every replay message in order (each on the scene the earlier ones built) and for scripted phone texts under their live id.

## Checks (`server/checks/`)

- Four pure checks in `index.ts`: latest change, space clash, order of work, open decision. No LLM, no wall clock.
- Unsure means warn, not hold: a finding resting on a confidence below 0.7 (`UNSURE_BELOW` in `rules.ts`) or on an element in state `unconfirmed` is a `warn` with a note asking to confirm.
- A place id that is not an element on record gives no space clash or order-of-work finding.
- `rehearse.ts` steps one day's plan in order for the slider. `fixes.ts` proposes one fix per finding with the crew message.
- Listen step (`fixes.ts`): on a live finding, every other crew on it that has posted nothing since the statement gets a question (reply before 07:00) instead of a HOLD. In the evening, a finding whose crews have all been silent since the change, or whose plan tasks are all low confidence, becomes an `ask_crew` question.

## Session and learning

- `server/api/session.ts` holds one session. The first request plays the golden replay and keeps the result. Live messages are added on top.
- `POST /api/corrections` stores a correction in `server/learning`. It does not change the current run.
- `POST /api/reset` drops the session. With `keepLearning` (default `true`) the stored corrections stay.
- The next run starts from `learning.applyToScene(startScene)`: each stored nickname is added to its element's `aliases`. Extraction gets `learning.getContext()` (nicknames and crew notes).
- Right after extraction, `learning.resolvePlaces` fills the place of any intent that has none when the message names exactly one known nickname (element aliases plus stored nicknames, word-boundary match). No match or several: the intent keeps no place and the message is listed by `GET /api/unresolved` until a `location_alias` correction answers it. A rule, not the LLM, so the cached demo shows learning too.
- `GET /api/state?t=` replays from the start scene with stored corrections applied, like a new run.
- Live messages get a word-based id, `live-<10 hex of sha256(normalised text + crewId)>` (`server/api/live-id.ts`), and extraction reads `data/llm-cache/<that id>.json`. A repeat in one session is stored as `<id>-2` but reads the same cache entry.
- Approving a `notify_crew` fix for a `latest_change` finding applies a `move` to the element's current geometry, sourced from the sent DM in thread `dm:<crewId>`. The crew has then heard the latest version, so checks and rehearsal stop flagging it. Other fix kinds do not change the model.
- Live findings re-check themselves after every message (`server/model/resolve.ts`, replay and live posts): a finding the checks no longer reproduce, or whose crew tasks are all cancelled, leaves `findings` together with its pending fix and logs `finding.resolved`. Findings with an approved or rejected fix are left alone. Resolved items stay in server-only lists so the site agent can still send CLEAR.

## Crew questions (`server/query/`, lanes E and J)

- `POST /api/ask`, `GET /api/briefing`, `GET /api/digest`, mounted from `server/api/index.ts` via `handleQueryRoute`.
- Parse order: cache `server/query/cache/` -> live Groq if `LIVE_LLM=1` -> deterministic keyword parser -> not found (forwarded to the superintendent). Every parse goes through `guard`: unknown ids become not found.
- The LLM only turns the question into a structured query; `answer.ts` computes the answer by rules from scene, plan, findings and messages, with sources. "Can I start" runs the four checks on a synthetic intent and answers HOLD or CLEAR.
- Any question asking to change the design, choose a material or decide is escalated to the superintendent.
- Lane J: `parse.ts` (`matchElements`) names walls by token overlap (unit number, direction, kind word, synonyms, one typo); a tie or no match is not found and says what was missing.

## Site agent (`server/agent/`, lane G)

- `policy.ts`: pure `decide(input) -> Action[]` on the replay clock (send_dm, escalate, follow_up, auto_resolve). No LLM. It never approves a HOLD.
- `runner.ts` steps it; `server/api/session.ts` runs it after the replay, after each live post and after each approval. Its DMs join the chat as `agent-<action id>` in `dm:<crewId>`. Timeline: `GET /api/agent/log`.
- Quiet hours 21:00-06:00: crew DMs wait until 06:00. A silent crew is asked, followed up at 07:00, then escalated 60 min later.
- `profiles.ts`: a crew that missed a change or left a question unanswered goes on watch; `POST /api/reset {keepLearning:true}` stores it as a `crew_misread` correction for run 2.

## MCP (`mcp/`, lane F)

- Own workspace, stdio transport, `@modelcontextprotocol/sdk`. Reads the site only over HTTP (`SITE_API`), never imports server code.
- Read-only tools (`tools.ts`): state, plans, findings, rehearsal, element history, `check_plan`, `is_place_clear`, `ask_site`. No tool approves or posts. `demo-robot.ts` is a route planner that knows the site only through MCP. Details: `mcp/README.md`.

## Web (`web/`)

- Flat SVG plan is the default and the fallback (lane D). With the server down on first load it draws the contract fixtures with a banner.
- 3D view (lane H): `web/src/three/ModelView3D.tsx`, lazy-loaded behind a Flat | 3D toggle; a second renderer of the same scene.
- Crew phone: `/phone` route (`web/src/Phone.tsx`) and an inset on the main screen; posts to `POST /api/message`.
- Presenter mode (lane L): `?present=1` or key P, `web/src/present/`. Each beat calls the same store actions and the phone's own send path.

## Tests, e2e, video (lane M)

- `npm test`: unit tests in `contracts`, `server`, `eval` (root `vitest.config.ts`); `mcp` has its own.
- `e2e/`: `npm run e2e` spawns a real server (`node --import tsx server/index.ts`, port 8790, `LIVE_LLM=0`) and the MCP robot, and walks the demo beats in order over HTTP. Imports no server code. Beats waiting on lane B's data are `it.todo`.
- `video/record.mjs`: standalone (not a workspace), drives the real UI with playwright-core and Edge against a running `npm run demo`; placeholder phone texts are skipped.

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
| `mcp` | `tsx` | MCP server over stdio, talks to the server over HTTP |

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
