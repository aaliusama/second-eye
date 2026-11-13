# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, G: site agent in `server/agent/` is a pure policy `decide(input) -> Action[]` on the replay clock; actions are send_dm, escalate, follow_up, auto_resolve. Shapes live in `server/agent/schema.ts` until lifted into contracts.
- 2026-11-13, G: the agent never approves a HOLD. On its own it only sends listen questions (ask_crew fixes), follow-ups, CLEAR, reminders of approved fixes, 06:00 briefings, and changes to crews on watch.
- 2026-11-13, G: action ids are deterministic (`esc~<findingId>`, `ask~<findingId>~<crewId>`, ...); a DM becomes chat message `agent-<action id>` in `dm:<crewId>`, which is how later steps know it was sent. Live and rehearsal findings for one incident (same check, crews, elements) are acted on once.
- 2026-11-13, G: quiet hours 21:00-06:00 replay time: crew DMs and "tonight" escalations are held to 06:00; "now" escalations (the work is today) go out at once.
- 2026-11-13, G: a silent crew is asked, followed up at 07:00 on the work day, then escalated 60 min later. A fix's approval time is the time of its `sent-<fixId>-<crewId>` DM.
- 2026-11-13, G: auto_resolve needs a new record entry after the finding (a change to its element or task) and the checks no longer reproducing it. Limit: the runner re-checks the scene it is given, so the lead should pass the scene at the step time when stepping a finished replay.
- 2026-11-13, G: learning loop: one missed change or one unanswered question puts a crew on watch and the run suggests a `crew_misread` correction; next run, a crew with a stored note gets any unheard change to an element of its planned work the moment it lands.
