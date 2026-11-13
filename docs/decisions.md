# Decisions

One line per decision: date, who, what, why. On a merge conflict keep both lines.

- 2026-11-13, team: stack confirmed (TypeScript, npm workspaces, Node server, Vite + React + three.js, zod).
- 2026-11-13, scaffold: contracts are a DRAFT until A confirms them at kickoff; then frozen.
- 2026-11-13, scaffold: plain `node:http` for the API, no framework, to keep dependencies small.
- 2026-11-13, scaffold: one vitest run for the repo; `npm test -- <folder>` runs one folder.
- 2026-11-13, scaffold: plan tasks use slots (morning, afternoon, full_day) instead of clock times; space clash = same place, day and slot.
- 2026-11-13, scaffold: "who heard a change" comes from threads: a crew reads the threads listed on it.
- 2026-11-13, scaffold: eval counts a case as caught when a finding has the same check and its sourceMessageId is the case's triggerMessageId.
- 2026-11-13, C: eval pools live and evening rehearsal findings and counts one per incident: (check, source message, sorted elementIds); for space_clash the message part is the sorted source + evidence pair, because a clash is symmetric. Repeated alerts for one incident count once. Detail (trigger per case, per crew, confidence thresholds 0.5/0.7/0.9) goes to eval/results.detail.json; eval/results.json keeps the contract shape.
- 2026-11-13, C: confidence threshold = lowest confidence of the plan tasks behind an incident; an incident with no plan task on record is kept at every threshold.
- 2026-11-13, C: live and rehearsal findings can share an id (same check, source message and key) with a different trigger. Clients key findings by (id, trigger). Ids unchanged because fix ids and the evening fix dedupe in server/model/replay.ts rely on them.
- 2026-11-13, C: rehearsal findings keep the time they were found (scene time), not the frame time; a full_day finding shows in two frames and must stay one finding. The slider uses frame.time.
- 2026-11-13, C: order_of_work is satisfied when the same crew does the prerequisite earlier in its own order in the same day and slot (close wall, then finish drywall, in one morning).
- 2026-11-13, A: live message ids come from the words (sha256 of normalised text + crewId), so scripted phone messages hit data/llm-cache offline; a repeat in one session is stored as `-2` and reads the same entry.
- 2026-11-13, A: learning resolves an unclear place by rule after extraction (exactly one known nickname in the text), so run 2 differs from run 1 with cached LLM output; unresolved messages go to GET /api/unresolved, a non-contract route until A adds it to contracts.
- 2026-11-13, A: approving a notify_crew fix for a latest_change finding records a move to the current geometry from the sent DM, so the crew has heard it; other fix kinds change nothing in the model.
- 2026-11-13, A: GET /api/state?t= applies stored corrections like a new run; docs changed to match the code.
- 2026-11-13, I: e2e/ tests the demo story over HTTP against a spawned server (port 8790); it imports no server internals and is excluded from `npm test` by the root include pattern. Run with `npx vitest run --config e2e/vitest.config.ts`.
- 2026-11-13, I: submission and pitch carry no numbers; every figure is a `[[from npm run eval]]` placeholder filled from the final eval run. The $1.85T figure is quoted only as the case book states it.
- 2026-11-13, F: MCP server in its own workspace `mcp/`, stdio transport, `@modelcontextprotocol/sdk` pinned at 1.32.2. It reads the site only over HTTP (`SITE_API`), never imports server code.
- 2026-11-13, F: MCP tools are read-only. No tool approves fixes or posts crew messages; decisions stay with the superintendent.
- 2026-11-13, F: `is_place_clear` returns `clear` only when the place is on record, nothing is planned in an overlapping slot and no open finding touches it. Unknown place is `unknown`; a server error is a tool error. Findings whose fix is approved count as handled.
- 2026-11-13, F: `check_plan` asks `POST /api/ask` when it exists; on 404 it answers from bookings and existing findings only and says it did not re-check.
- 2026-11-13, G: site agent in `server/agent/` is a pure policy `decide(input) -> Action[]` on the replay clock; actions are send_dm, escalate, follow_up, auto_resolve. Shapes live in `server/agent/schema.ts` until lifted into contracts.
- 2026-11-13, G: the agent never approves a HOLD. On its own it only sends listen questions (ask_crew fixes), follow-ups, CLEAR, reminders of approved fixes, 06:00 briefings, and changes to crews on watch.
- 2026-11-13, G: action ids are deterministic (`esc~<findingId>`, `ask~<findingId>~<crewId>`, ...); a DM becomes chat message `agent-<action id>` in `dm:<crewId>`, which is how later steps know it was sent. Live and rehearsal findings for one incident (same check, crews, elements) are acted on once.
- 2026-11-13, G: quiet hours 21:00-06:00 replay time: crew DMs and "tonight" escalations are held to 06:00; "now" escalations (the work is today) go out at once.
- 2026-11-13, G: a silent crew is asked, followed up at 07:00 on the work day, then escalated 60 min later. A fix's approval time is the time of its `sent-<fixId>-<crewId>` DM.
- 2026-11-13, G: auto_resolve needs a new record entry after the finding (a change to its element or task) and the checks no longer reproducing it. Limit: the runner re-checks the scene it is given, so the lead should pass the scene at the step time when stepping a finished replay.
- 2026-11-13, G: learning loop: one missed change or one unanswered question puts a crew on watch and the run suggests a `crew_misread` correction; next run, a crew with a stored note gets any unheard change to an element of its planned work the moment it lands.
- 2026-11-13, E: crews ask the record via `server/query` (POST /api/ask, GET /api/briefing, GET /api/digest). An LLM (Groq `openai/gpt-oss-120b`, JSON mode, temperature 0) only turns the question into a structured query; the answer is computed by rules from scene, plan, findings and messages.
- 2026-11-13, E: question parse order: cache `server/query/cache/` -> live Groq if LIVE_LLM=1 -> deterministic keyword parser -> not found (forwarded to the superintendent). Unknown ids in any parse become not found, never guessed.
- 2026-11-13, E: any question asking to change the design, choose a material or decide is escalated to the superintendent, whatever the parser said. The system never decides.
- 2026-11-13, E: "can I start" runs the four checks on a synthetic intent and answers HOLD or CLEAR. With no own task in that place, it checks the elements inside the place.
- 2026-11-13, E: shapes (Question, StructuredQuery, Answer) live in `server/query/schema.ts` until A lifts them into contracts.
- 2026-11-13, H: 3D view lives in web/src/three as `ModelView3D`, lazy-loaded by D; flat SVG stays default and fallback. Labels use drei Html portalled into one fixed overlay (drei Text needs a non-woff2 font; Html with a late-connecting target dropped the first label). Camera uses fitToSphere, not fitToBox, because fitToBox snaps the polar angle to 0 or 90 degrees.
