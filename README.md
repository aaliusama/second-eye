# Site Rehearsal

Talona track, proximata hackathon '26. On a building site, crews plan tomorrow's work in chat, and a change made in one thread often never reaches the crew it affects. Site Rehearsal turns the site chat into a live model of one floor, checks every crew's stated plan against it the moment they say it and again the evening before, and shows the mistake as a red ghost wall before the work starts. The superintendent approves the fix with one tap and the crew gets the message.

All site data is simulated. Every screen says so.

## Run

Needs Node 22.12 or newer.

```
npm install
npm run demo
```

Open http://localhost:5173. The demo plays `data/replay.golden.json` with cached LLM output from `data/llm-cache/`, so it needs no API key and no network.

- Presenter mode: http://localhost:5173/?present=1 (or press P). One key per demo beat: → next beat, ← back, R reset, H hide the bar.
- Crew phone: http://localhost:5173/phone, sized for a real phone. Send a message as a crew and it is checked live.

## Environment

The demo needs none of this. Copy `.env.example` to `.env` to use the LLM; never commit `.env` (it is gitignored).

| Variable | What |
|---|---|
| `GROQ_API_KEY` | Groq key (https://console.groq.com/keys). Needed only to build caches or run live. |
| `GROQ_MODEL` | model for extraction and question parsing; default `openai/gpt-oss-120b` |
| `LIVE_LLM` | `0` (default): read the caches only. `1`: call Groq for any message or question with no cache entry, and write the result to the cache |
| `PORT` | site server port, default 8787 |
| `SITE_API` | where the MCP server finds the site API, default `http://127.0.0.1:8787` |

## Commands

| Command | What |
|---|---|
| `npm run demo` | server (port 8787) + web (port 5173) from the golden replay |
| `npm run dev` | same, with hot reload |
| `npm test` | unit tests; `npm test -- server/checks` for one folder |
| `npm run e2e` | the demo story over HTTP against a spawned server on port 8790 (`E2E_PORT` to change) |
| `npm run eval` | golden replay vs `data/labels.json`: caught / missed / false alarms per check, written to `eval/results.json` |
| `npm run typecheck` | all workspaces and `e2e/` |
| `npm run cache-id -- "<text>" <crewId>` | the cache id a live phone message gets |
| `node --import tsx server/extract/build-cache.ts [--force] [--phone <file>]` | extract every replay message (and scripted phone texts) with Groq into `data/llm-cache/`; same as `npx tsx server/extract/build-cache.ts` |
| `node --import tsx server/query/build-cache.ts [--force]` | parse the demo crew questions with Groq into `server/query/cache/` |
| `npm run start -w @site/mcp` | MCP server on stdio for agents and robots (see `mcp/README.md`) |
| `npm run robot -w @site/mcp` | demo robot planner that knows the site only through MCP |

Both cache builders need `GROQ_API_KEY` and keep existing entries unless `--force`. On Windows `npx` is slow (30-45 s per call); `node --import tsx` starts at once.

The demo video recorder lives in `video/` (standalone, see `video/README.md`).

## How the LLM is used

**The LLM extracts facts. Rules decide.**

The LLM (Groq, JSON mode, temperature 0) does exactly two jobs:

1. Extraction (`server/extract/`): one chat message becomes operations on the scene and crew intents, validated with zod against `contracts/`. Ids come from the message, not the model; anything naming an unknown element or crew is dropped, never guessed.
2. Question parsing (`server/query/`): a crew's question becomes a structured query. The answer is computed by rules from the record.

The four checks (`server/checks/`), rehearsal, fixes and the site agent contain no LLM call. They are pure functions of scene, plan and messages on the replay clock: same input, same output. A finding that rests on something unsure (low confidence, or a place still `unconfirmed`) is a warning to confirm, never a hold.

## API

The server listens on port 8787. The web app reaches it through the Vite proxy at `/api`.

| Route | What |
|---|---|
| `GET /api/health` | liveness check, and whether `LIVE_LLM` is on |
| `GET /api/state[?t=]` | scene, findings and fixes; with `t` a fresh replay up to that replay time |
| `POST /api/message` | post a crew message; runs extract, model and checks |
| `GET /api/messages` | all messages in the session |
| `GET /api/rehearsal[?day=]` | rehearsal of one day's plan; defaults to the latest planned day |
| `GET /api/fixes` | proposed and approved fixes |
| `POST /api/fixes/:id/approve` | approve a fix, send its DMs, store the decision |
| `GET /api/unresolved` | messages whose place nobody could tell yet |
| `POST /api/corrections` | store a correction (nickname, crew misread, fix decision) for the next run |
| `POST /api/reset` `{keepLearning}` | start a new run; `keepLearning` defaults to `true` |
| `GET /api/eval` | `eval/results.json`, or 404 until `npm run eval` has run |
| `POST /api/ask` `{crewId?, text}` | a crew asks; the answer comes from the record with sources; design decisions go to the superintendent |
| `GET /api/briefing?crew=[&day=]` | a crew's morning briefing: tasks in order, holds, changes since they last posted |
| `GET /api/digest[?day=]` | the superintendent's evening digest: holds by check, open decisions, silent crews, pending fixes |
| `GET /api/agent/log` | what the site agent did on its own: escalations, DMs, follow-ups, auto-resolves, held until 06:00 |

## Live phone messages and the cache

A message posted live gets an id from its words: `live-<10 hex of sha256(normalised text + crewId)>`, ignoring case, extra spaces and trailing punctuation (`server/api/live-id.ts`). Extraction reads `data/llm-cache/<id>.json`, so a scripted phone message works offline once its cache entry exists. The same words twice in one session are stored as `<id>-2` but read the same entry. A message with no entry extracts nothing in demo mode (logged as `extract.cache_miss`). Every post logs `{"kind":"api.message","messageId":...,"cacheId":...}`.

To get the file name for a scripted message:

```
npm run cache-id -- "tomorrow morning we close up the blue room" crew-drywall
```

## Limitations

- One floor, one building. Input is chat text only (no photos, voice, drawings or BIM files).
- All site data is simulated. The model reflects what was said in the record, not what was built.
- The full simulated chat and its labels are still being written; the golden replay on main is a short slice.
- Live extraction (`LIVE_LLM=1`) is built and unit-tested with a mocked Groq, but has not yet been run against real Groq; the cache entries on main are hand-written for the first slice.
- Learning is kept in server memory: a server restart forgets it. Use `POST /api/reset {keepLearning:true}` for run 2.

## More

- `docs/architecture.md`: how the pieces fit, folder by folder.
- `docs/decisions.md`: every design decision and assumption.
- `TEAM.md`: who owns which folder. `AGENTS.md`: rules for AI coding tools.
