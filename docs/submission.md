# Written submission (draft)

Draft prepared from the full synthetic replay and the generated evaluation results. Confirm team details, record and review the video, and obtain its shareable link before submitting. Unknown details are marked "not found".

## Project title

Site Rehearsal

## One-line pitch

Site Rehearsal checks every crew's stated plan against a live model of the building, the moment they say it and the evening before, and shows the mistake as a red ghost wall before the work starts.

## Team and members

Hassan — engineering (spine, checks and evaluation, per `TEAM.md`). Additional contributor names and roles: not found in the repository; confirm with the team before submission.

## Problem

A building site's plans and decisions arrive in separate message threads. A change made in the office thread may never reach the crew that starts tomorrow. A crew can then plan to close a wall before its inspection or rough in pipe along an outdated wall line. The superintendent needs the source of the change, the affected plan and the correction in one record before work starts.

## Solution overview

Site Rehearsal runs one loop over the chats the site already uses:

1. **Build.** Each chat message becomes operations on a JSON model of one floor (move a wall, add a fixture, plan a task). Every operation keeps the message it came from and a confidence.
2. **Plan.** It derives tomorrow's plan (crew, place, task, slot) from what crews said.
3. **Listen.** Every statement of intent is checked as it is said. A crew at risk that has gone silent gets a question instead of an order.
4. **Compare.** Four deterministic checks run against the model: a change the crew never heard, two crews in one room at once, work out of order, and work on an undecided item. A mismatch shows as a red ghost: where the crew thinks the wall is, next to where it is per the record, with the distance between them.
5. **Rehearse.** Every evening it plays tomorrow forward on the model, slot by slot.
6. **Fix.** It proposes a correction and the message to send. The superintendent approves with one tap; the crew gets a sourced HOLD for a confirmed conflict or a request to confirm an uncertain record.
7. **Learn.** Corrections are stored and change the next run. A nickname like "the blue room" is asked about once, then resolved on its own.

Crews can also text a question and get an answer from the record, while design decisions go to the superintendent. AI agents and robots can query the same record through a read-only MCP server, for example "is unit 204 clear tomorrow morning?"

**The LLM extracts facts. Rules decide.** The language model only turns messages into structured operations, and every one of them is validated against a schema. The checks are pure functions, with no LLM call, no randomness and no wall-clock time, so the same chat always produces the same findings.

## Results

All site data is simulated: 190 messages over two days on one floor of six units, five crews, written as messy site chat. The 15 labelled cases were written from the scenario before the checks ran. The table below is from `npm run eval` on replay `golden`; it pools live and rehearsal alerts and counts each incident once, including alerts later resolved.

| Check | Caught | Missed | False alarms |
|---|---|---|---|
| Latest change | 4 | 0 | 0 |
| Space clash | 4 | 0 | 0 |
| Order of work | 3 | 0 | 0 |
| Open decision | 4 | 0 | 0 |
| Total (15 cases) | 15 | 0 | 0 |

These are results on this synthetic labelled scenario, not field validation or a measurement of general extraction accuracy. The scenario and its offline cache are available for inspection. If the replay, extraction cache or checks change, rerun evaluation and refresh this table before submission.

## Tech stack

- TypeScript throughout, npm workspaces, zod schemas as the single contract between parts.
- Node `node:http` server; Vite + React web app; flat SVG drafting view plus a three.js view of the same scene.
- Groq (groq.com, model `openai/gpt-oss-120b`) for extraction and for parsing crew questions (live mode only); a per-message cache so the demo runs offline.
- Vitest unit tests and an HTTP end-to-end test of the demo story; `npm run eval` for the measured results.
- Read-only Model Context Protocol server and a robot-planner demonstration over the same HTTP API.

## Assumptions and limits

- One floor, chat only. No photos, drawings files, BIM/IFC, or real WhatsApp/Procore integration.
- The model reflects what was said in the record, not what was built.
- Plan slots are morning / afternoon / full day, not clock times.
- Who heard a change is inferred from which threads a crew reads.
- The frozen scene contract has no decision-category field. Dependencies inferred from a room use conservative material/fixture words in the recorded element names; explicitly named dependencies remain sourced.

## Links

- Repository (private, Talona track): https://github.com/syedwajiulhassan715-rgb/Proximata-Hackathon
- 3-minute demo video: not found. Record and review the full presenter run, then add the shareable recording link.
- Organizer-confirmed submission location: not found. Confirm it on Discord; repository privacy alone does not establish the correct submission destination.
- Run it: `npm install`, then `npm run demo`, then open http://localhost:5173
