# Site Rehearsal

Talona track, proximata hackathon '26. The site checks every crew's stated plan against a live model of the building and shows the mistake as a red ghost wall before the work starts.

All site data in this repo is simulated.

## Run

Needs Node 22.12 or newer.

```
npm install
npm run demo
```

Open http://localhost:5173. The demo plays `data/replay.golden.json` with cached LLM output from `data/llm-cache/`, so it needs no API key and no network.

## Environment

Copy `.env.example` to `.env`. `LIVE_LLM=1` calls the extraction model live and needs its key. Never commit `.env`.

## Commands

| Command | What |
|---|---|
| `npm run demo` | server (port 8787) + web (port 5173) from the golden replay |
| `npm run dev` | same, with hot reload |
| `npm test` | all unit tests; `npm test -- server/checks` for one folder |
| `npm run eval` | golden replay vs `data/labels.json`: caught / missed / false alarms |
| `npm run typecheck` | all workspaces |

## API

The server listens on port 8787. The web app reaches it through the Vite proxy at `/api`.

| Route | What |
|---|---|
| `GET /api/health` | liveness check |
| `GET /api/state[?t=]` | scene, findings and fixes; with `t` a fresh replay up to that replay time |
| `POST /api/message` | post a crew message; runs extract, model and checks |
| `GET /api/messages` | all messages in the session |
| `GET /api/rehearsal[?day=]` | rehearsal of one day's plan; defaults to the latest planned day |
| `GET /api/fixes` | proposed and approved fixes |
| `GET /api/unresolved` | messages whose place nobody could tell yet (not a contract shape) |
| `POST /api/fixes/:id/approve` | approve a fix, send its DMs, store the decision |
| `POST /api/corrections` | store a correction (nickname, crew misread, fix decision) for the next run |
| `POST /api/reset` `{keepLearning}` | start a new run; `keepLearning` defaults to `true` |
| `GET /api/eval` | golden replay scored against `data/labels.json` |
| `POST /api/ask` `{crewId?, text}` | a crew asks; the answer comes from the record with sources; design decisions go to the superintendent |
| `GET /api/briefing?crew=[&day=]` | a crew's morning briefing: tasks in order, holds, changes since they last posted |
| `GET /api/digest[?day=]` | the superintendent's evening digest: holds by check, open decisions, silent crews, pending fixes |
| `GET /api/agent/log` | what the site agent did on its own: escalations, DMs, follow-ups, auto-resolves, held until 06:00 |

## Crew phone messages in demo mode

A message posted live gets an id from its words: `live-<10 hex>`, the same for the same text and crew, ignoring case, extra spaces and trailing punctuation. Extraction reads `data/llm-cache/<id>.json`, so a scripted phone message works offline once its cache entry exists. Every post logs `{"kind":"api.message","messageId":...,"cacheId":...}`.

To get the file name for a scripted message:

```
npm run cache-id -- "tomorrow morning we close up the blue room" crew-drywall
```

## Layout

See `docs/architecture.md`. Who owns which folder: `TEAM.md`. Rules for AI coding tools: `AGENTS.md`.

## Assumptions

Listed in `docs/decisions.md`.
