# Demo script

Owner: D (presenter mode: L). Read before any task that touches what a judge sees.

Length: 3 minutes. A judge understands it in 20 s; the ghost wall is on screen within 90 s.

Anchor sentence: the site checks every crew's stated plan against a live model of the building and shows the mistake as a red ghost wall before the work starts.

## Setup (before the judges arrive)

- `npm run demo`, then open http://localhost:5173/?present=1 on the laptop (1440x900 or larger; the page is light on purpose, it survives a projector).
- A small step bar sits bottom-left of the plan. It is the only thing presenter mode adds to the screen.
- Press **R** once: the run starts clean (nothing learned) and the bar shows beat 1.
- Optional: open http://localhost:5173/phone on a real phone on the same network to hold up. The presenter beats post from the **Crew phone** inset on the laptop; the real phone refreshes with them.
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

| Time | Beat (key →) | What happens | Say | Manual fallback |
|---|---|---|---|---|
| 0:00 | 1 Problem | Run starts clean; whole floor; phone closed. | "Site decisions live in group chats. A change made in the office thread never reaches the plumber who starts tomorrow." | **Start clean** in Learning. |
| 0:20 | 2 Build | Model shown as of the architect's Rev C (m-001); the inspector opens on the wall that message moved, every history row quoting its message. | "Chat becomes the model. Every element has a source." | In **The record**, **Model after this message** on m-001, then click the 204 east wall. |
| 0:45 | 3 Ghost wall | Back to now. The phone (as Novak Plumbing) sends `PHONE.plumbingIntent`; the phone answers HOLD with one reason and the source. The plan frames unit 204, draws the true wall, grows the red ghost to where plumbing thinks the wall is, then "0.4 m east". Everything holds still. | "Plumbing says what it does tomorrow. Red is where plumbing thinks the wall is: 40 cm off." | **Crew phone**, pick Novak Plumbing, type the text, Send. |
| 1:20 | 4 Why | Inspector on the ghost: what was said, and "What Novak Plumbing did not hear" quoting the office-thread change. | "The change was said in a thread plumbing does not read." | Click the ghost. |
| 1:35 | 5 Rehearse | Slider jumps to the first clash on tomorrow's track; held rooms outline in redline. | "Tomorrow, played forward the evening before." | Drag the slider to the redline mark. |
| 2:00 | 6 Fix | The current W-12 ghost's fix is approved: "Fix sent" with the exact text, the wall turns green, the ghost is gone, the phone shows the HOLD message from the system. | "One tap. The crew gets the message, the model knows they heard it." | **Send fix to Novak Plumbing** for the W-12 ghost. |
| 2:10 | 7 Ask | The phone asks `PHONE.question`; the answer comes from the record with sources (CLEAR now that the fix reached them). | "Crews text a question and get an answer from the record. Decisions still go to the superintendent." | Type the question in the phone. |
| 2:20 | 8 Learn | The phone sends `PHONE.blueRoom`; run 1 cannot place "the blue room", it appears under **Learning**. | "Crews have nicknames. The record does not guess." | Type the text in the phone. |
| 2:35 | 9 Run 2 | "The blue room" is mapped to Unit 204, the run starts again with what was learned, and the same words are sent again: resolved on its own. The agent log shows the crew on watch warned as soon as the wall moved. | "The superintendent answered once. The next run knows." | **Remember this place**, **Run again with what we learned**, send the text again. |
| 2:45 | 10 Numbers | Side column scrolls to **Measured**. | Say the numbers exactly as shown. Close with the anchor sentence. | Scroll to **Measured**. |

## Fallbacks

- Phone not on the network: the laptop's **Crew phone** inset does everything; presenter beats use it anyway.
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
