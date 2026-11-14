# Demo script

Owner: D (presenter mode: L, story: E). Read before any task that touches what a judge sees.

Length: 3 minutes. A judge understands it in 20 s. **Within 90 s a judge has seen the four things that carry the depth:** the ghost wall (0:30), the floor as one crew knows it (0:55), how the finding was decided (1:10) and the critical path on tomorrow's timeline (1:25).

Anchor sentence: the site checks every crew's stated plan against a live model of the building and shows the mistake as a red ghost wall before the work starts.

All site data is simulated, and every screen says so. The model reflects what was said in the record, not what was built. Say "per the record".

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

Twelve beats. Cue times match `video/record-present.mjs` and `docs/pitch.md`. Screenshots of every beat were taken from a clean start on Sat 14 Nov (1600x1000 and 390x844, no page errors).

| Time | Beat (key →) | What appears | Say | Manual fallback |
|---|---|---|---|---|
| 0:00 | 1 Problem | The record as of Thu 13:01: whole floor, no ghost. | Pitch "Problem". State that it is simulated site data. | **Start clean** in Learning. |
| 0:15 | 2 Build | The record as of the architect's Rev C (Thu 14:02); inspector on the 204 east wall, every history row quoting its message. | "Every message becomes a change to one record, and keeps its source." | **See the floor at this moment** on m-001, click the 204 east wall. |
| 0:30 | 3 Ghost wall | Back to now. The phone (Novak Plumbing) sends the scripted intent and answers HOLD with the source. The plan frames the 204 bathroom wall: black recorded wall, one red dashed ghost, "0.4 m east" large, the crew's work zone hatched with "0.40 m gap · needs 0.60 m clear". Nothing else is red. | "Red is where plumbing will measure from. Black is the wall per the record. Forty centimetres: per the record, their rough-in would leave a 40 centimetre gap to the wall." Hold still. | Desk **Crew** tab, Novak Plumbing, type the text, Send. |
| 0:55 | 4 Why | "The floor as Novak Plumbing knows it": their wall where they believe it is, the record dashed red. The desk shows "Who knows": every change against every crew, the 204 wall row marked red under P. | "Each crew only hears its own threads, so each works from its own version of the floor. This is Novak Plumbing's. The change was said in the office thread; they don't read it." | Press P in "See the floor as". |
| 1:10 | 5 How it decided | Back to the record. The desk opens "How it decided" for the ghost finding: facts read by the language model with confidence, the line "Language model above · rules below", the rule in plain words ("Rules, no language model"), then the finding with its measured numbers. | "The language model only reads messages into facts, each with a confidence and its source. Below the line it's rules: same record, same result. Here is the rule, and here is the measurement." | **How it decided** on the Unit 204 card under Priorities. |
| 1:25 | 6 Rehearse | Whole floor, Saturday played forward. The crew plan opens under the plan: arrows for what must finish first, the out-of-order edge dashed red, and the header "Critical path: Novak Plumbing → Walsh Drywall (2 tasks)". Shared work zones are hatched with their area. | "Every evening, tomorrow is played forward as a graph. The critical path: the 203 inspection, then drywall closing that wall, and drywall has it booked the morning before. What can't be undone comes first." Optional: click the "inspection for 203" bar: "If it slips, Walsh Drywall can't start as planned." | **Show crew plan**, drag the slider. |
| 1:45 | 7 Send | The W-12 fix is sent. Ghost and dimension turn **amber**: "sent, not confirmed". Crew replies panel: "Sent · awaiting crew confirmation". | "One tap sends it. Sent isn't heard. It stays amber." | **Send correction to Novak Plumbing** on the Unit 204 card under Priorities. |
| 2:00 | 8 Confirm | Simulated crew reply confirms revision 2 of the wall; record rechecked; ghost gone; panel "Crew confirmed · record rechecked". | "The crew confirms this exact revision. That proves the information arrived, not the work." | **Simulate Novak Plumbing confirming receipt**. |
| 2:15 | 9 Ask | Phone asks "can we start the 204 bath tomorrow morning?": "CLEAR: no conflict found in the record…", citing the confirmation. | "Answers come from the record, with sources. Decisions go to the superintendent." | Type the question. |
| 2:25 | 10 Learn | Walsh Drywall sends the blue-room text; run 1 cannot place it; it appears under **Learning**. | "The record doesn't guess." | Type the text. |
| 2:35 | 11 Run 2 | Mapped to Unit 204, run again with what was learned, same words resent: Unit 204 shows "the blue room", the phone answers for that place. | "The superintendent answered once. The next run knows." | **Remember this place**, **Run again with what we learned**, resend. |
| 2:45 | 12 Numbers | Large Measured overlay from `/api/eval` with the synthetic caveat. | Say the numbers exactly as shown, then "See tomorrow's mistake before it gets built." | Scroll to **Measured**. |

Recording: `cd video && node record-present.mjs --captions` with the demo running (`DEMO_URL` for another port). The take is named `...-FAILED.webm` and exits 1 if any beat fails; watch the whole take anyway.

## The confirmation flow (beats 7 and 8)

Send approves and dispatches the geometry correction; the risk stays open and the receipt is amber. Confirm is a separately labelled simulated crew action that confirms the exact sent revision and rechecks the record. Only then ask whether the recorded plan has a conflict. A newer revision rejects the old confirmation. Acknowledgement proves receipt in this simulation, not completed work or physical safety.

Say at Send: "The superintendent sends the correction. We are still waiting for the crew." Say at Confirm: "Now the crew confirms this revision. The recorded mismatch is rechecked, and every message stays in the receipt." Use the receipt's "Who said what, when" disclosure for evidence. Do not say dispatch alone fixes the wall or proves that the crew read it.

## Supporting demonstrations (outside the three-minute core)

- **3D lens.** Switch **Flat | 3D**, then pick a crew in "See the floor as": the walls glide to where that crew believes they are, and the record shows as a dashed outline. Stay on flat for the reveal; it is the one that always works.
- **Which sheet is the crew using?** Records an architect issuance and a crew revision statement, without reading attachments.
- **What this site has learned.** Remembers an exact reviewed alert with a reason and Undo. Changed evidence brings the alert back into review. This preference does not remove safety findings or alter evaluation results.
- **Space clash, measured.** The plan hatches the floor two crews' work zones share, with its area (Unit 201, Unit 206). **Show on plan** on a "Two plans need the same space" card frames it.

## Fallbacks

- Phone not on the network: the desk's **Crew** tab on the laptop does everything; presenter beats use it anyway.
- A text has no cache entry: the phone answers "Not found: no plan for tomorrow recognised in this message" and cites the crew's own message. Keep going; the ghost from the golden replay is already on the plan and beat 3 replays its reveal. Say "the plan was already checked the evening before".
- Server down: the plan draws the contract fixtures (the same ghost-wall case) with a banner saying so. Restart with `npm run demo`; do not present from the fixtures.
- A route not on the server yet: its panel hides or says so; the flat plan and the ghost never depend on it. An older server without the measure or graph fields simply draws no clearance strip, overlap hatch or arrows.
- Reduced motion on the presenting machine: the reveal jumps to its end state. Say "here is where plumbing thinks the wall is" and point.

## Full-data rehearsal checklist

The full synthetic replay and both phone-message caches are available. Presenter text matches `data/scenario.md`, including `tmrw afternoon we start boarding the blue room, ceiling first` for Walsh Drywall. The blue-room nickname is not preset in the floor.

- Run `npm run eval` after the final data merge. Beat 12 shows the generated `eval/results.json`; read those results exactly and state any misses or false alarms.
- The ghost wall is already on the golden record at load. Beat 3 sends the cached plumbing intent and replays its reveal. It must show the W-12 ghost at the old line with the 0.4 m east label and the measured work-zone note.
- Beat 5 must open the trace of the W-12 ghost finding, showing "Rules, no language model" and the rule `latest_change.unheard_geometry`.
- Beat 6 must show the critical path in the rehearsal header and arrows on the crew plan.
- Beat 7 must approve the pending fix for that W-12 ghost, not the first fix in the full-floor queue. Check that the W-12 ghost disappears before asking whether plumbing can start.
- Beats 10 and 11 use the same cached blue-room text. Start clean first: run 1 must list the place as unresolved; map it to Unit 204, reset with learning retained, and send the same words again. Run 2 must resolve the place.
- Before recording, rehearse every beat from a clean run and review the resulting phone replies, source inspector, trace and learning panel. A successful HTTP test does not replace this visual rehearsal.
