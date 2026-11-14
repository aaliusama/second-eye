# Demo script

## Current confirmation flow (supersedes older beat wording below)

Presenter now has eleven beats: Problem, Build, Ghost wall, Why, Rehearse, Send, Confirm, Ask, Learn, Run 2, Numbers. Press R before recording. Send approves and dispatches the geometry correction; the risk stays open and the receipt is amber. Confirm is a separately labelled simulated crew action that confirms the exact sent revision and rechecks the record. Only then ask whether the recorded plan has a conflict. A newer revision rejects the old confirmation. Acknowledgement proves receipt in this simulation, not completed work or physical safety.

Say at Send: "The superintendent sends the correction. We are still waiting for the crew." Say at Confirm: "Now the crew confirms this revision. The recorded mismatch is rechecked, and every message stays in the receipt." Use the receipt's "Who said what, when" disclosure for evidence. Do not say dispatch alone fixes the wall or proves that the crew read it.

Two supporting demonstrations are available in the live side panel, outside the three-minute core unless rehearsed to fit: "Which sheet is the crew using?" records an architect issuance and a crew revision statement without reading attachments; "What this site has learned" remembers an exact reviewed alert with a reason and Undo. Changed evidence brings the alert back into review. This preference does not remove safety findings or alter evaluation results.

Use `video/record-present.mjs` (presenter-driven, fails loudly); the legacy `record.mjs` predates the eleven beats.

Owner: D (presenter mode: L). Read before any task that touches what a judge sees.

Length: 3 minutes. A judge understands it in 20 s; the ghost wall is on screen within 90 s.

Anchor sentence: the site checks every crew's stated plan against a live model of the building and shows the mistake as a red ghost wall before the work starts.

## Setup (before the judges arrive)

- `npm run demo`, then open http://localhost:5173/?present=1 on the laptop (1440x900 or larger; the page is light on purpose, it survives a projector).
- A small step bar sits bottom-left of the plan. It is the only thing presenter mode adds to the screen.
- Press **R** once: the run starts clean (nothing learned) and the bar shows beat 1.
- Optional: open http://localhost:5173/phone on a real phone on the same network to hold up. The presenter beats post from the desk's **Crew** tab on the laptop; the real phone refreshes with them.
- Phone texts live in one place: `web/src/present/beats.ts` (`PHONE`). Each must have a cache entry (`npm run cache-id -- "<text>" <crewId>` prints its id); without one the phone answers "Not found" honestly. A text still in `[[...]]` is not sent and the bar says so.

## Keys (presenter mode)

| Key | Does |
|---|---|
| → | next beat: runs its action once, then sets the view |
| ← | previous beat: view only, nothing is sent again |
| R | reset: start clean (POST /api/reset, nothing learned) and go to beat 1 |
| H | hide or show the step bar (keys still work) |
| P | presenter mode on or off without the URL flag |

Every beat calls the same code as the buttons (store actions, the phone's own send). Nothing on screen is staged.

## Beats

Visually rehearsed from a clean start on Sat 14 Nov (screenshots of every beat, 1440x900, merged `win/integration`). Cue times match `video/record-present.mjs` and `docs/pitch.md`.

| Time | Beat (key →) | What appears | Say | Manual fallback |
|---|---|---|---|---|
| 0:00 | 1 Problem | The record as of Thu 13:01: whole floor, no ghost, agent log "Nothing yet". | Pitch "Problem". State that it is simulated site data. | **Start clean** in Learning. |
| 0:20 | 2 Build | The record as of the architect's Rev C (Thu 14:02); inspector on the 204 east wall, every history row quoting its message. | "Every message becomes a change to one record, and keeps its source." | **See the floor at this moment** on m-001, click the 204 east wall. |
| 0:40 | 3 Ghost wall | Back to now. The phone (Novak Plumbing) sends the scripted intent and answers HOLD with the source. The plan frames the 204 bathroom wall: black true wall, one red dashed ghost, "0.4 m east" large. Nothing else is red. | "Red is where plumbing will measure from. Black is the wall per the record. Forty centimetres." Hold still. | Desk **Crew** tab, Novak Plumbing, type the text, Send. |
| 1:10 | 4 Why | The plan switches to "The floor as Novak Plumbing knows it": their wall where they believe it is, the record dashed red 0.4 m east. The desk shows "Who knows what": every change against every crew, the 204 wall row marked red under P. | "Each crew only hears its own threads, so each works from its own version of the floor. This is Novak Plumbing's. The change was said in the office thread; they don't read it." | Automatic on this beat; or press P in "See the floor as". |
| 1:25 | 5 Rehearse | Whole floor, Saturday played forward; clash rooms outlined, redline on the timeline; 06:30 huddle shows the top three. | "Every evening, tomorrow is played forward. What can't be undone comes first." | Drag the slider. |
| 1:45 | 6 Send | The W-12 fix is sent. Ghost and dimension turn **amber**: "sent, not confirmed". Crew confirmation panel: "Sent · awaiting crew confirmation". | "One tap sends it. Sent isn't heard. It stays amber." | **Send correction to Novak Plumbing** on the Unit 204 card under Priorities. |
| 2:00 | 7 Confirm | Simulated crew reply confirms revision 2 of the wall; record rechecked; ghost gone; panel "Crew confirmed · record rechecked". | "The crew confirms this exact revision. That proves the information arrived, not the work." | **Simulate Novak Plumbing confirming receipt**. |
| 2:15 | 8 Ask | Phone asks "can we start the 204 bath tomorrow morning?": "CLEAR: no conflict found in the record…", citing the confirmation. | "Answers come from the record, with sources. Decisions go to the superintendent." | Type the question. |
| 2:25 | 9 Learn | Walsh Drywall sends the blue-room text; run 1 cannot place it; it appears under **Learning**. | "The record doesn't guess." | Type the text. |
| 2:35 | 10 Run 2 | Mapped to Unit 204, run again with what was learned, same words resent: Unit 204 shows "the blue room", the phone answers for that place. | "The superintendent answered once. The next run knows." | **Remember this place**, **Run again with what we learned**, resend. |
| 2:45 | 11 Numbers | Large Measured overlay from `/api/eval` with the synthetic caveat. | Say the numbers exactly as shown, then "See tomorrow's mistake before it gets built." | Scroll to **Measured**. |

Recording: `cd video && node record-present.mjs --captions` with the demo running (`DEMO_URL` for another port). The take is named `...-FAILED.webm` and exits 1 if any beat fails; watch the whole take anyway.

## Fallbacks

- Phone not on the network: the desk's **Crew** tab on the laptop does everything; presenter beats use it anyway.
- A text has no cache entry: the phone answers "Not found: no plan for tomorrow recognised in this message" and cites the crew's own message. Keep going; the ghost from the golden replay is already on the plan and beat 3 replays its reveal. Say "the plan was already checked the evening before".
- Server down: the plan draws the contract fixtures (the same ghost-wall case) with a banner saying so. Restart with `npm run demo`; do not present from the fixtures.

## Full-data rehearsal (Sat 14 Nov)

The full synthetic replay and both phone-message caches are available. Presenter text now matches `data/scenario.md`, including `tmrw afternoon we start boarding the blue room, ceiling first` for Walsh Drywall. The blue-room nickname is not preset in the floor.

- Run `npm run eval` after the final data merge. Beat 10 shows the generated `eval/results.json`; read those results exactly and state any misses or false alarms.
- The ghost wall is already on the golden record at load. Beat 3 sends the cached plumbing intent and replays its reveal. It must show the W-12 ghost at the old line with the 0.4 m east label.
- Beat 6 must approve the pending fix for that W-12 ghost, not the first fix in the full-floor queue. Check that the W-12 ghost disappears before asking whether plumbing can start.
- Beats 8 and 9 use the same cached blue-room text. Start clean first: run 1 must list the place as unresolved; map it to Unit 204, reset with learning retained, and send the same words again. Run 2 must resolve the place.
- Before recording, rehearse every beat from a clean run and review the resulting phone replies, source inspector and learning panel. A successful HTTP test does not replace this visual rehearsal.
- A route not on the server yet: its panel hides or says so; the flat plan and the ghost never depend on it.
- 3D: the **Flat | 3D** toggle is optional. Stay on flat for the reveal; it is the one that always works.
- Reduced motion on the presenting machine: the reveal jumps to its end state. Say "here is where plumbing thinks the wall is" and point.
