# Live extraction: measured latency and a live autonomy walk

Date: 2026-11-14. Model: `openai/gpt-oss-120b` on Groq (`GROQ_MODEL`), free/on-demand tier.
Setup: `PORT=8899 LIVE_LLM=1 npx tsx index.ts` in `server/`, run from a laptop on home network. `GET /api/health` returned `{"ok":true,"liveLlm":true,"apiVersion":3}`.
Latency is wall-clock for `POST /api/message`, measured by the client (Node `fetch`), with 1.5 s between messages. It covers the Groq call(s), the rules and the checks. The session clock was the end of the replay (Fri 2026-11-13 20:00), so "tomorrow" means Saturday.

Every message below was new: none was in `data/llm-cache/`, so each one went to Groq.

## Per message

| # | Crew | Text | ms | Extraction | Second look | Result | sourceMessageId on output |
|---|---|---|---|---|---|---|---|
| A | plumbing | sat first thing we run the hot and cold feeds up the east wall in 204's bathroom | 1071 | live | no cue | **HOLD** latest_change W-12 (0.40 m, office thread) + notify_crew fix | yes (op, intent, finding, fix) |
| B | electrical | saturday afternoon we pull cable in 202, back half of the unit | 939 | live | no cue | **CLEAR** (room-202, Sat afternoon, no findings) | yes (op, intent) |
| C | plumbing | we'll be in the blue room tomorrow afternoon running the waste line | 850 | live | no cue | **not checked**: intent with no place, sent to `/api/unresolved` (not guessed) | yes (intent) |
| D | tiling | has the owner approved the 205 bath tile yet? we still want to lay it all day saturday | 3611 | live (one 429, 3 s wait) | fired (decision cue, no status in final reading) | **not checked**: model returned no plan and no change. Should have been an OD1-style HOLD | n/a (empty) |
| E | drywall | saturday morning we close up the corridor wall in 202 | 3138 | **live_failed** (429 twice, TPM limit) | no cue | **not checked** (reported as such, not as clear) | n/a (empty) |
| F | painting | tomorrow morning we'll start priming down the end unit | 3156 | live (one 429, 2 s wait) | no cue | **not checked**: place not resolved, sent to `/api/unresolved` | yes (intent) |
| G | superintendent | heads up the 205 bath east wall is shifting 15 cm west, Lena confirmed | 637 | live | move cue present, move returned (cannot tell which reading gave it) | move on W-16, no plan to check | yes (op) |
| E2 | drywall | same words as E, re-sent after 65 s idle | 893 | live | no cue | **HOLD** x2: latest_change W-05 (0.10 m, office thread) and order_of_work (close wall in 202, no inspection on record) | yes (op, intent, both findings, both fixes) |
| D2 | tiling | we lay the 205 bath tile all day saturday, owner approved it right? | 1533 | live | decision cue present, status returned (cannot tell which reading gave it) | **wrong**: no plan; `set_status tile-205-bath approved`, confidence 1. See bug 1 | yes (op) |

"Second look" is not logged by the server. The table infers it from the cue regexes in `server/extract/llm.ts` (`MOVE_CUE`, `DECISION_CUE`) and the cached facts. It certainly fired only where a cue was present and the final facts lack that kind of change (D).

## Summary numbers

- All 9 calls: min 637 ms, median 1071 ms, max 3611 ms.
- 8 successful live extractions: min 637 ms, median 1005 ms, max 3611 ms.
- Calls with no rate limiting (6): 637 to 1533 ms.
- Rate limited: 3 of 9 calls hit HTTP 429 (Groq TPM limit 8000 tokens/min; one call is about 2000 tokens). Two recovered after a 2 to 3 s wait. One (E) failed after 2 tries in about 3.1 s and was reported as `live_failed`.
- Verdicts: 2 HOLD (A, E2), 1 CLEAR (B), 5 not checked (C, D, E, F, G with no plan), 1 wrong reading (D2).
- Every operation, intent, finding and fix that came back carried the posted message's id as `sourceMessageId`.

## Autonomy walk (live)

1. Noticed: A raised `f-latest_change-live-8ee3f19788-W-12` (HOLD) with a pending `notify_crew` fix.
2. Escalated: `GET /api/agent/log` showed `escalate` to the superintendent at 20:01 for that finding, with `sourceMessageIds` `[live-8ee3f19788, m-001]`. E2 raised two more escalations at 20:08. The agent did not approve anything itself.
3. Approved: `POST /api/fixes/fix-f-latest_change-live-8ee3f19788-W-12/approve` returned 200, fix `approved`, one DM sent to `dm:crew-plumbing`. A receipt appeared in `/api/acknowledgements` with status `awaiting_confirmation`, pinned to W-12 version 2 from `m-001`.
4. Acknowledged: `POST /api/fixes/.../acknowledge {"crewId":"crew-plumbing"}` returned 200. The receipt went to `confirmed`, and the finding left the active findings in `/api/state`. The chain closes.
5. Edge checks: acknowledging again as plumbing returned 200 (idempotent). Acknowledging as `crew-drywall`, which was not sent the fix, returned 404. Approving again returned 200 with nothing re-sent.
6. Observation: the agent log adds no entry for approval or acknowledgement. The closure is visible only in receipts and state.

## Bugs and gaps found

1. **A crew's question cleared a real HOLD (false clear).** D2 ("owner approved it right?", from the tiling crew lead in site-group) became `set_status tile-205-bath approved` with confidence 1. The agent then ran `auto_resolve` on the replay's OD1 finding `f-open_decision-m-172-tile-205-bath` ("the risk is gone: ... confirmed in the site-group thread") and sent tiling a `clear` DM. The Saturday rehearsal stopped showing `open_decision:tile-205-bath`. Where it happens: the status instruction at `server/extract/llm.ts:61`, the decision cue that asks for a second look at `server/extract/llm.ts:141,146`, and the code that takes the second look's changes at `server/extract/llm.ts:160-161`. `server/extract/result.ts:64-65` passes a status change through without checking who sent it (a crew lead, not the architect or office) or whether it was a question. `server/agent/policy.ts:143` auto-resolves on that change. Repro: start live, then post `{"thread":"site-group","senderName":"Luca (Sorel Tiling)","senderRole":"crew_lead","crewId":"crew-tiling","text":"we lay the 205 bath tile all day saturday, owner approved it right?","kind":"text"}` and check `/api/agent/log` and `/api/rehearsal?day=2026-11-14`. The model's reply may vary between runs.
2. **Plan dropped when a question is attached (D, D2).** Both tiling messages state a Saturday full-day plan in 205 but returned no plan. The OD1-style hold was never checked. The result is reported as no intent, not as clear, so this is an extraction gap rather than a false clear on its own.
3. **An empty live reading is cached.** D's empty result was written to `data/llm-cache-live/` (gitignored). Re-sending the same words in live mode reads that cache and never asks Groq again. A failed call (E) is not cached, which is why E2 could retry.

## Caveats

- Free/on-demand Groq tier: 8000 tokens per minute. Bursts of more than about 3 messages a minute will hit 429. Interactive mode gives up after 2 tries (`LIMITS.interactive` in `server/extract/llm.ts`), so a busy minute shows `not checked`, never a false clear.
- Network: one residential connection, one run, 9 calls. These are single-sample numbers, not a benchmark.
- Every live cache file this run wrote under `data/llm-cache-live/` was deleted afterwards. `npm run eval` (offline) still reports 15/15 caught and 0 false alarms on 177 unlabelled messages.
