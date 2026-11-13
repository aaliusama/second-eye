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

## Layout

See `docs/architecture.md`. Who owns which folder: `TEAM.md`. Rules for AI coding tools: `AGENTS.md`.

## Assumptions

Listed in `docs/decisions.md`.
