# Demo script

Owner: D. Read before any task that touches what a judge sees.

Length: 3 minutes. A judge understands it in 20 s; the ghost wall is on screen within 90 s.

Anchor sentence: the site checks every crew's stated plan against a live model of the building and shows the mistake as a red ghost wall before the work starts.

## Setup (before the judges arrive)

- `npm run demo`, then open http://localhost:5173 on the laptop (1440x900 or larger, light room is fine: the page is light on purpose).
- Open http://localhost:5173/phone on a real phone on the same network, or in a second narrow window. Pick the crew named in each beat.
- Click **Start clean** in the Learning panel so run 1 starts with nothing learned. Reload the page: the ghost reveal plays once on load.
- Phone texts below in `[[...]]` come from `data/scenario.md` (Phone script) once B writes it. Each text must have a cache entry (its id is printed in the server log as `cacheId` on every post); otherwise the phone answers "Not found" honestly.

## Beats

| Time | Beat | Do | Judge sees |
|---|---|---|---|
| 0:00-0:20 | Problem | Say: "Site decisions live in group chats. A change made in the office thread never reaches the plumber who starts tomorrow." Point at the plan. | A construction drawing of level 2, crews as letter badges, "Simulated site data" top right. |
| 0:20-0:45 | Build: chat becomes the model | In **The record**, click **Model after this message** on the architect's Rev C message (m-001), then **Back to now**. Click the wall in unit 204: the inspector shows its history, each row quoting the message it came from. | Every element has a source. "v2 Moved, Thu 12 Nov 14:02" quotes the architect. |
| 0:45-1:20 | Live check: the ghost wall | On the phone, as Novak Plumbing, send `[[phone text: plumbing states tomorrow's rough-in in the 204 bath]]`. | The phone answers HOLD with one reason and the source. The main screen frames unit 204, draws the true wall, grows the red ghost to where plumbing thinks the wall is, then "0.4 m east". Everything holds still. |
| 1:20-1:35 | Why | Click the ghost. | "Why this is held": what was said, and "What Novak Plumbing did not hear" quoting the office-thread change. |
| 1:35-2:00 | Rehearse tomorrow | Drag the time slider from 07:00 to 17:00. | Crew lanes show who is where; the track is already marked in redline where tomorrow has clashes. Clashing rooms outline in redline as the cursor passes. |
| 2:00-2:20 | Fix | In **Needs approval**, click **Send fix to Novak Plumbing**. | The item reads "Fix sent" with the exact text sent; the wall turns green; the ghost is gone; the phone shows the HOLD message from the system. |
| 2:20-2:45 | Learn | On the phone send `[[phone text: a crew names "the blue room"]]`. It appears under **Learning**; pick Unit 204, click **Remember this place**, then **Run again with what we learned**. Send the same text again. | Run 1: the place is unconfirmed and the superintendent maps it once. Run 2: resolved on its own, the check runs at once. |
| 2:45-3:00 | Numbers, close | Scroll the side column to **Measured**. Say the numbers exactly as shown. Close with the anchor sentence. | Caught / missed / false alarms per check, labelled with the replay id and case count. Nothing typed by hand. |

## Fallbacks

- Phone not on the network: use the **Crew phone** inset (bottom right of the plan).
- A route not on the server yet: its panel hides or says so; the flat plan and the ghost never depend on it.
- Reduced motion on the presenting machine: the reveal jumps to its end state. Say "here is where plumbing thinks the wall is" and point.
