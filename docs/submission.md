# Written submission (draft)

Fill every `[[...]]` before submitting. Every number comes from the final `npm run eval`. Nothing here is invented.

## Project title

Site Rehearsal

## One-line pitch

Site Rehearsal checks every crew's stated plan against a live model of the building, the moment they say it and the evening before, and shows the mistake as a red ghost wall before the work starts.

## Team and members

[[names and roles]]

## Problem

A building site runs on group chats, email threads and spreadsheets. A decision made in one thread often never reaches the crew who needs it. One crew closes a wall before the inspection. Another builds to last week's drawing. The case book puts the cost of bad data and miscommunication in construction at "an estimated $1.85 trillion in 2020".

The AI tools a superintendent can use today can read a message. They cannot tell whether the crew about to start work heard the change made yesterday in a different thread.

## Solution overview

Site Rehearsal runs one loop over the chats the site already uses:

1. **Build.** Each chat message becomes operations on a JSON model of one floor (move a wall, add a fixture, plan a task). Every operation keeps the message it came from and a confidence.
2. **Plan.** It derives tomorrow's plan (crew, place, task, slot) from what crews said.
3. **Listen.** Every statement of intent is checked as it is said. A crew at risk that has gone silent gets a question instead of an order.
4. **Compare.** Four deterministic checks run against the model: a change the crew never heard, two crews in one room at once, work out of order, and work on an undecided item. A mismatch shows as a red ghost: where the crew thinks the wall is, next to where it is per the record, with the distance between them.
5. **Rehearse.** Every evening it plays tomorrow forward on the model, slot by slot.
6. **Fix.** It proposes a correction and the message to send. The superintendent approves with one tap and the crew gets a HOLD message that cites its source.
7. **Learn.** Corrections are stored and change the next run. A nickname like "the blue room" is asked about once, then resolved on its own.

Crews can also text a question and get an answer from the record, while decisions go to the superintendent [[if lane E lands]]. AI agents and robots can query the same record through an MCP server, for example "is unit 204 clear tomorrow morning?" [[if lane F lands]].

**The LLM extracts facts. Rules decide.** The language model only turns messages into structured operations, and every one of them is validated against a schema. The checks are pure functions, with no LLM call, no randomness and no wall-clock time, so the same chat always produces the same findings.

## Results

All site data is simulated: [[n]] messages over two days on one floor of six units, five crews, written as messy site chat. The labelled test set was written from the scenario before the checks ran.

| Check | Caught | Missed | False alarms |
|---|---|---|---|
| Latest change | [[from npm run eval]] | [[from npm run eval]] | [[from npm run eval]] |
| Space clash | [[from npm run eval]] | [[from npm run eval]] | [[from npm run eval]] |
| Order of work | [[from npm run eval]] | [[from npm run eval]] | [[from npm run eval]] |
| Open decision | [[from npm run eval]] | [[from npm run eval]] | [[from npm run eval]] |
| Total ([[from npm run eval]] cases) | [[from npm run eval]] | [[from npm run eval]] | [[from npm run eval]] |

## Tech stack

- TypeScript throughout, npm workspaces, zod schemas as the single contract between parts.
- Node `node:http` server; Vite + React web app; flat SVG drafting view plus a three.js view of the same scene.
- Groq (groq.com, model `openai/gpt-oss-120b`) for extraction and for parsing crew questions (live mode only); a per-message cache so the demo runs offline.
- Vitest unit tests and an HTTP end-to-end test of the demo story; `npm run eval` for the measured results.
- [[MCP server, if lane F lands]]

## Assumptions and limits

- One floor, chat only. No photos, drawings files, BIM/IFC, or real WhatsApp/Procore integration.
- The model reflects what was said in the record, not what was built.
- Plan slots are morning / afternoon / full day, not clock times.
- Who heard a change is inferred from which threads a crew reads.

## Links

- Repository (private, Talona track): [[link]]
- 3-minute demo video: [[link]]
- Run it: `npm install`, then `npm run demo`, then open http://localhost:5173
