# Team plan - Site Rehearsal

Who owns what, what each person delivers, and when we sync.
Project rules: `AGENTS.md`. Rules for each person's AI agent: `AGENT_BRIEF.md`.
If code in `contracts/` disagrees with this file, the code wins.

Anchor sentence: the site checks every crew's stated plan against a live model of the building and shows the mistake as a red ghost wall before the work starts.

Code freeze: **Sat 14 Nov, 15:00 sharp**. Submit by 14:30.

## Roster

| Workstream | Person | Writes only in |
|---|---|---|
| A - Spine | <name> | `contracts/`, `server/model/`, `server/learning/`, `server/index.ts`, `server/api/`, repo root config (`package.json`, `tsconfig*.json`, `.env.example`, `.gitignore`), `README.md`, `docs/architecture.md` |
| B - Data + extraction | <name> | `data/`, `server/extract/` |
| C - Checks + eval | Hassan | `server/checks/`, `eval/` |
| D - Web + story | <name> | `web/`, `docs/demo-script.md` |

Shared: `docs/decisions.md`. Anyone appends one line per decision; on a merge conflict keep both lines.

## Kickoff (all four, 20:45 - 21:15, no code before it ends)

1. Write names into the roster.
2. Everyone accepts Talona's track terms. Confirm the repo is private: Talona work may not go in a public MIT repo.
3. Agree the scenario sheet below. B writes the final version to `data/scenario.md`.
4. A walks through the function boundaries below. Change them now, not later.
5. Everyone posts their sleep block (3-4 h) in team chat so each sync has the people it needs.

## How the pieces connect

```
chat message -> B extract -> operations + intents -> A model -> scene + plan -> C checks -> findings + fixes -> A API -> D web
                    ^                                                                            |
                    +----------- A learning (approved fixes, nicknames, crews that misread) <----+
```

Proposed boundaries. A puts the shapes into `contracts/` at kickoff; after that `contracts/` is the source of truth.

| Owner | Function | In -> out |
|---|---|---|
| B | `extract(message, learningContext)` | ChatMessage -> { operations, intents }; reads `data/llm-cache/` unless `LIVE_LLM=1` |
| A | `applyOperations(scene, operations)` | Scene -> Scene, keeps element history |
| A | `getPlan(scene, day)` | Scene -> Plan (crew, place, task, order) |
| C | `runChecks(scene, plan, intent?)` | -> Finding[] |
| C | `rehearse(scene, plan)` | -> RehearsalFrame[] (one per plan step, with findings) |
| C | `proposeFixes(findings)` | -> Fix[] (correction + message text for the crew) |
| A | `learning.getContext()`, `learning.record(correction)` | stored corrections -> next run |
| A | HTTP API | `GET /api/state?t=`, `POST /api/message`, `GET /api/rehearsal`, `GET /api/fixes`, `POST /api/fixes/:id/approve`, `GET /api/eval` |

## Scenario sheet (proposal, confirm at kickoff)

One floor of a multifamily building: units 201-206 off one corridor. Two days of simulated site chat, about 200 messages. Crews: drywall, plumbing, electrical, painting, tiling, plus the superintendent and the architect.

| # | Check | Planted incident | In demo |
|---|---|---|---|
| 1 | Latest change | Architect moves wall W-12 (unit 204 bathroom / corridor) by 40 cm on Thursday, in the office thread. Plumbing never gets it. Friday evening plumbing says "tomorrow we rough in the 204 bath along the corridor wall". | Ghost wall (magic moment) |
| 2 | Space clash | Electrical and painting both plan unit 206 on Saturday morning. | yes |
| 3 | Order of work | Drywall plans to close the unit 203 wall before the plumbing inspection. | yes |
| 4 | Open decision | Tile choice for the 205 bath is still `proposed`; tiling plans to start. | yes |
| L | Learning | Crews call unit 204 "the blue room". Run 1: `unconfirmed`, superintendent maps it. Run 2: resolved on its own. | yes |

Beyond the demo, the labelled set needs 15-20 cases (at least 3 per check) and many messages with no problem, so false alarms can be measured.

## Workstreams

Work top to bottom. MUST before NICE. KILL items are listed in `AGENTS.md`.

### A - Spine (<name>)
MUST
- [ ] Scaffold: npm workspaces (`contracts`, `server`, `web`, `eval`), vitest, scripts `demo`, `dev`, `test`, `eval`, `typecheck`, `.env.example`, `.gitignore`. Replace the FILL IN line in `AGENTS.md` with the real commands.
- [ ] `contracts/`: zod schemas and types for ChatMessage, Operation, Element, Scene, CrewIntent, Plan, Finding (with ghost geometry for D), Fix, Correction, RehearsalFrame, API shapes. Plus `contracts/fixtures/`: one scene, a few operations, one intent, one finding with a ghost. **On main by 21:45.**
- [ ] `server/model/`: apply operations, element history (every change keeps sourceMessageId and confidence), plan from `plan_task`, scene at replay time t.
- [ ] Server runtime: replay clock, pipeline, one JSON log line per operation and finding, the API above.
- [ ] `server/learning/`: store corrections (approved fixes, location nicknames, crews that misread) and feed them into the next run. `npm run demo` starts from a clean store.
- [ ] `README.md` (setup, run, environment, architecture, assumptions) and `docs/architecture.md`.
- [ ] Keep main green: revert any merge that breaks `npm run demo`.

NICE
- [ ] Query endpoint for agents or robots ("what is planned in unit 204 tomorrow?").

Done when: the golden replay runs end to end through the real model and API, and run 2 shows a learned nickname.

### B - Data + extraction (<name>)
MUST
- [ ] `data/scenario.md` from the kickoff.
- [ ] `data/floor.json`: starting scene (elements with ids, positions, nicknames).
- [ ] 10-message slice for the ghost-wall incident, with cached extraction, **by 23:00**.
- [ ] `data/chat.json`: about 200 messages over two days, messy like real site chat; each has id, time, sender, crew.
- [ ] `data/labels.json`: expected findings per case with message ids. Written from the scenario sheet before checks run, never adjusted to match check output. C reviews it.
- [ ] `server/extract/`: prompt plus zod-validated output. Unsure means state `unconfirmed` with the confidence. Never guess a location or direction.
- [ ] `data/llm-cache/`: run live once with `LIVE_LLM=1`, cache per message. The demo reads only the cache.
- [ ] `data/replay.golden.json`: ordered events the demo plays.

NICE
- [ ] Voice note in, transcribed to a message.
- [ ] Extraction accuracy measured on a sample of messages.

Done when: golden replay and full cache are on main and `npm run demo` makes no network call.

### C - Checks + eval (Hassan)
MUST
- [ ] `server/checks/`: four pure checks, each with unit tests built from fixture scenes:
  - latest change: the crew's intent uses an element version older than its latest change.
  - space clash: two crews in the same place in the same plan slot.
  - order of work: a task starts before the task it depends on (close wall before inspection).
  - open decision: a task depends on an element still `proposed`.
- [ ] Every finding has sourceMessageId(s), crew, elementIds, a one-line explanation and the ghost geometry D draws. Latest-change check first: it is the ghost wall.
- [ ] Live check: one new intent -> findings for that crew. If a crew is at risk and has said nothing, produce a question to that crew instead of a finding.
- [ ] `rehearse()`: step tomorrow's plan in order with findings per step, for D's slider.
- [ ] `proposeFixes()`: for each finding a correction plus the message sent to the crew after approval.
- [ ] `eval/`: `npm run eval` runs the golden replay against `data/labels.json`, prints caught / missed / false alarms per check, writes `eval/results.json` for the UI and README.

NICE
- [ ] Results at two or three confidence thresholds.
- [ ] Per-crew breakdown.

Done when: all planted demo incidents are caught on the golden replay and `npm run eval` prints real numbers.

### D - Web + story (<name>)
MUST
- [ ] `web/`: Vite + React app. Works from `contracts/fixtures/` until A's API is ready.
- [ ] Flat top-down view: elements colored by state, ghost element in red at the conflicting position. Clicking it shows the finding and the source message.
- [ ] Crew chat simulator: send a message as a crew -> live check -> ghost appears.
- [ ] Rehearsal time slider over tomorrow's plan.
- [ ] Approval queue: one tap approves a fix and shows the message sent to the crew.
- [ ] "Simulated site data" label on every screen. Eval panel shows only `eval/results.json`.
- [ ] `docs/demo-script.md`: 3 minutes, judge understands in 20 s, ghost wall visible within 90 s.
- [ ] Written submission text and the 3-minute video **by 13:30**.

NICE
- [ ] three.js view as a second renderer of the same scene. Basic only (polished 3D is KILL). Start only after slice 1 works.

Done when: the demo script plays start to finish from `npm run demo` without touching code.

## Handoffs

| From | Gives | To | By |
|---|---|---|---|
| A | contracts + fixtures | B, C, D | Fri 21:45 |
| B | `floor.json` + 10-message slice + cache | A, C | Fri 23:00 |
| C | latest-change check with ghost in Finding | A, D | Fri 23:30 |
| A | pipeline + API running the slice | D | Fri 23:30 |
| D | flat view drawing a ghost from fixtures | all | Fri 23:30 |
| B | 200 messages + labels | C | Sat 04:00 |
| C | `eval/results.json` | A (README), D (UI, video) | Sat 06:00 |

## Timeline

| Time | What | Who |
|---|---|---|
| Fri 20:45-21:15 | Kickoff | all |
| Fri 21:45 | Scaffold + contracts + fixtures on main; `npm run demo` starts, even if empty | A |
| Sat 00:30 | Sync 1 (10 min): slice 1 live, 10 messages -> ghost wall on the flat view | all |
| Sat 04:00 | Full chat + labels on main | B |
| Sat 06:00 | Sync 2: four checks, slider, approval queue, first eval numbers | all |
| Sat 09:00 | Feature and refactor freeze. Help round | all |
| Sat 12:00 | Three full demo rehearsals; fix only what breaks | all |
| Sat 13:30 | Video recorded | D |
| Sat 14:30 | Submitted | D + C |
| Sat 15:00 | Code freeze | - |

## Finish first, then help

1. Work your MUST list top to bottom. No NICE items, no other lanes.
2. When your MUST list is done and `npm run demo` is green on main, post `DONE <letter>` in team chat with one line on what a judge can now see.
3. Help round (next sync, or Sat 09:00 at the latest): whoever is free moves to the lane furthest behind. Priority: (1) anything blocking the ghost wall, (2) eval misses and false alarms, (3) judge-visible items, (4) NICE items.
4. A helper works on a branch `help/<letter>-<topic>`, touches only what the lane owner agreed to in chat, and the owner merges.
5. Stuck for more than 30 minutes: post `BLOCKED <letter>: what, what I tried, what I need`. Keep going on a stub or fixture meanwhile.
6. Need something changed in another lane: post the change request your agent prints (format in `AGENT_BRIEF.md`). Only the owner changes their lane.

## Submission checklist

- [ ] Where the Talona repo goes (private, not the public MIT org) confirmed with organizers on Discord - C
- [ ] Submission form sent - D
- [ ] 3-minute demo video, end to end - D
- [ ] Written submission: title, one-line pitch, team, problem, solution, tech stack, links - D, with numbers from C
- [ ] README with one start command; `.env.example`; no secrets committed - A
- [ ] Every number in README, UI and pitch comes from `npm run eval` - C checks
- [ ] Optional: pitch deck PDF - D
