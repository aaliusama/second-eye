# Product video brief: Second Eye

Written from the repository on Sat 14 Nov 2026 (branch `win/integration`, commit `43fe91a`), the running offline demo (`npm run demo`), `README.md`, `docs/demo-script.md`, `docs/pitch.md` and `web/src/tokens.ts`. Nothing here is invented: every feature named below was exercised in the capture run (`capture.mjs`) and appears on screen.

## What it is

**Second Eye.** Promise: *See tomorrow's mistake before it gets built.*

A hackathon prototype for the Talona track "Context for the Physical World" (proximata Hackathon '26). It turns construction-site crew chat messages into one sourced record of a floor, checks every crew's stated plan against that record, and shows the conflicting position as a red **ghost wall** before the work starts.

## Who it is for

The superintendent of a mid-size general contractor building multifamily housing, before 07:00: which crew is about to work from old information, and who to tell (`docs/SITE_MANAGER_PAIN.md`).

## The problem

Site decisions live in group chats. A change said in one thread (the office) never reaches a crew that reads another (the plumbers). Nobody does anything wrong, and the crew builds to a line that has moved.

## Features the film shows (all real, all captured from the app)

| Step | What the app does | Capture |
|---|---|---|
| Build | Messages become operations on one record; every change quotes its source message and confidence | `build.png` (inspector on the 204 east wall, Rev C quote) |
| Listen + Compare | A crew states tomorrow's plan; the four deterministic checks find the clash; the ghost wall appears with "0.4 m east"; the phone answers HOLD with the source | `ghost-wall-burst-*.jpg`, `ghost-wall.png` |
| Per-crew belief | "The floor as Novak Plumbing knows it" and the Who-knows-what matrix | `why.png` |
| Rehearse | Tomorrow played forward on the crew lanes; priorities to settle before work starts | `rehearse.png` |
| Send | One-tap correction; the ghost turns amber: sent, not confirmed | `send.png` |
| Confirm | Simulated crew confirmation of the exact revision; record rechecked; ghost gone | `confirm.png`, `phone-ask.png` |
| Ask | A crew asks; CLEAR answer from the record with sources | `ask.png` |
| Learn | "The blue room" cannot be placed on run 1; mapped once; run 2 resolves it | `learn.png`, `run-2.png` |
| Measured | `npm run eval` table: 15 labelled cases, 15 caught, 0 missed, 0 false alarms (synthetic) | `numbers.png` |

## Boundaries the film keeps

- All site data is simulated. Every product shot carries the "Simulated site data" label; the opening says it is a scenario.
- The record reflects what was *said*, not what was built. Confirmation is a receipt, not proof of work (said on screen).
- The only number shown is the eval table as the app prints it, from `eval/results.json`.
- No customer quotes, savings, or competitor claims. Words from `docs/pitch.md` "Words to avoid" are not used.

## Brand

- Colours from `web/src/tokens.ts`: paper `#EEF1F2`, ink `#1C2B3A`, ink-soft `#526575`, redline `#D4281C` (ghost and conflict **only**), clear `#1F8A4C`, pending `#E0A100`.
- Type: Archivo Variable (width axis), self-hosted from the repo's Fontsource package.
- Mark: `docs/assets/readme/mark.svg`, a floor plan with one wall as a dashed red ghost.
- Language: a construction drawing, not a dashboard. Ink rules on paper, the drafting dot grid, no gradients.

## Creative direction

Narrated pitch film for a non-technical viewer: a human-sounding local voice (Chatterbox, see voice/VOICE.md) tells the story; the spoken line is always on the ink title block, like the title block of a drawing, so it also works muted. Camera moves only to direct attention to the thing the caption names. The one strong accent is the ghost reveal (a low impact); everything else is quiet. Red appears only where the product uses it.
