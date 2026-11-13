# Judging map

Talona track jury. Each criterion → what proves it → when the judge sees it → evidence they can check.
Demo times refer to the 3-minute script (`docs/demo-script.md`). "Lane" = who builds it (`TEAM.md`).
Every number on screen or in the pitch comes from `npm run eval`. This map describes the full-data integration branch; merge and verify it before claiming the same state on main.

## Technical implementation (35)

| Feature that proves it | Lane | Demo moment | Evidence | Status |
|---|---|---|---|---|
| Chat → operations on a JSON scene, each with `sourceMessageId` and confidence | A, B | 0:20 "Build" | `server/model/model.test.ts`, element history in the inspector | on main |
| Real LLM extraction (Groq, model `openai/gpt-oss-120b`), zod-validated, cached; demo runs offline from cache | B | mention at 0:20 | `server/extract/` tests; raw facts and provenance in `data/llm-cache/`; `LIVE_LLM=1` path | full real Groq cache available; final scoped corrections retained with provenance |
| Four deterministic checks, no LLM inside (`server/checks/`) | C | 0:45–1:45 | `server/checks/checks.test.ts`, `rehearse-fixes.test.ts` | on main |
| "Who heard which change" from chat threads → ghost geometry + dimension label | A, C | 0:45 ghost wall | `GET /api/state` finding `f-latest_change-m-002-W-12`, label "0.4 m east"; `e2e/demo-story.e2e.test.ts` | on main |
| Same input, same output (replay clock, no wall time, no randomness) | all | not shown; say it once | replay tests; e2e run is repeatable | on main |
| One JSON log line per operation and finding | A | open the server log if asked | `server/log.ts`, server stdout | on main |
| Flat SVG view + 3D cut-away as a second renderer of the same scene | D, H | 0:45 / 2:20 | `web/`; one scene JSON drives both | on main |
| MCP server: agents and robots query the live record | F | 2:30 | `is_place_clear` tool, demo robot planner | on main (e2e robot tests pass) |

## Autonomous operation & impact (30)

| Feature that proves it | Lane | Demo moment | Evidence | Status |
|---|---|---|---|---|
| Live check: every crew statement of intent is checked as it is said | A, C | 0:45 phone message → ghost | `POST /api/message` returns a newly sourced W-12 ghost; full-data e2e live-phone assertion | cached plumbing text available; presenter reveal implemented |
| Evening rehearsal of tomorrow with no one asking | C | 1:15 time slider | `GET /api/rehearsal?day=2026-11-14`; e2e "beat 4" | on main |
| Listen step: a crew at risk that has gone silent gets a question, not an order | C, G | 1:45 queue item reads as a question | `ask_crew` fixes in `rehearse-fixes.test.ts` | on main |
| One-tap approval sends the crew the HOLD message with its source | A, D | 1:50 | `POST /api/fixes/:id/approve`; e2e "beat 5" | on main (API) |
| Approval clears the problem in the model | A | 1:55 ghost disappears | e2e "beat 5: approving the W-12 fix clears the ghost" | on main (e2e beat 5 passes) |
| Crews text a question, get an answer from the record; decisions escalate to the superintendent | E | 2:10 | `/api/ask`; e2e crew-question assertions | implemented |
| Agent policy: escalate, follow up silent crews, auto-resolve, quiet hours, morning briefing | E, G | 2:10 briefing card | policy tests in lane G | on main |
| Impact: problems caught before work starts, false alarms measured on normal chat | C | 2:45 eval panel | `npm run eval` → `eval/results.json` (caught / missed / false alarms per check) | full replay: 15 caught, 0 missed, 0 false alarms on 15 labelled cases; synthetic scenario only |

## Learning loop & vision (15)

| Feature that proves it | Lane | Demo moment | Evidence | Status |
|---|---|---|---|---|
| Run 1: "the blue room" is unresolved; superintendent maps it once | A, D | 2:20 | `GET /api/unresolved`, `POST /api/corrections`; exact cached presenter text in `beats.ts` | implemented; record a visual rehearsal before submission |
| Run 2 resolves it on its own | A | 2:35 "Run again with what we learned" | `POST /api/reset {keepLearning:true}`; full-data e2e learning lifecycle | implemented; record a visual rehearsal before submission |
| Crew reliability profiles from past misreads change who gets asked first | G | mention 2:10 | lane G tests | on main |
| Vision: the same live record answers robots and agents (MCP) | F | 2:30 | MCP demo | on main |

## Demo & presentation (20)

| What | Where | Evidence |
|---|---|---|
| Judge understands in 20 s; ghost wall within 90 s | `docs/demo-script.md`, `docs/pitch.md` | rehearsal timings (3 full runs Sat 12:00) |
| "Simulated site data" on every screen; wording "per the record" | `web/` | screenshots |
| One start command, works offline | README, `npm run demo` | e2e passes on a clean clone |
| 3-minute video, written submission | `docs/submission.md`, `video/` | written draft prepared; reviewed video and submission not found |

## Risks to the demo

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi down or Groq slow | Demo runs from `data/llm-cache/` with `LIVE_LLM=0`. Never demo live extraction. |
| A phone text typed differently misses the cache | Presenter types only the scripted texts in `data/scenario.md` "Phone script"; keep them pasted in a notes app. Fallback: a "send scripted message" button in `/phone`. |
| A late merge breaks `npm run demo` | Feature freeze Sat 09:00. `npm run typecheck`, `npm test` and the e2e run before every merge; A reverts any breaking merge. Tag the last good commit `demo-ok` and demo from it. |
| Ports 5173/8787 taken on the demo laptop | Close other dev servers; `PORT` and the Vite proxy read from env. |
| Learning state lost (store is in memory) | Set `LEARNING_FILE=.learning/store.json` in `.env` on the demo laptop so a restart keeps it; press R (reset clean) before presenting. Still do the blue-room beat in one server session where possible. |
| WebGL fails on the projector laptop | Flat SVG view is the default and does not need WebGL. |
| Eval numbers change late | Show only `eval/results.json` from the final run; current full replay contains 190 simulated messages. Never round up or quote a number from memory. |
| Judge asks "is this real data?" | It is simulated, labelled on every screen. Say so first. |
| Repo visibility | Private. Confirm the submission location and track terms with organisers on Discord; do not infer that confirmation from repository privacy. |
| Video not ready | Record the 3-minute run by 13:30 from `demo-ok`; keep a second take. |
