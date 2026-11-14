# Storyboard: Second Eye product film (narrated cut)

A 2:38 narrated pitch film, built so that a non-technical viewer understands the product in the first 30 seconds, and a Talona judge sees the fit by the end. 1920x1080 composition at 30 fps, rendered as a 3840x2160 master and a 1920x1080 copy.

Exact timecodes, every spoken line and its cue: `shots.json` (generated from `src/timeline.ts` and `src/voice-timing.json` by `node export-shots.mjs`). Scene lengths follow the voice: each scene lasts until its last line plus 0.7 s, crossfading 0.4 s into the next.

## What keeps a judge watching

- **A hook in the first 3 seconds**: a story, not a logo. The wall moves while the voice says it.
- **The cost before the product**: 48% of rework, with its source on screen.
- **A chapter bar** (top left): The problem · Second Eye · Catch it · Fix it · It learns · Proof. The current chapter fills as it plays, so the viewer always knows where they are and what is next.
- **The spoken line is always on screen** in the ink title block, so the film works muted (autoplay, a judging-room projector).
- **Every move is cued to a word**: the ghost wall draws on "and draws the problem", the wall turns amber as the fix is sent, the warning clears on "checked again", the blue room resolves on "after one answer".
- **The peak gets the only impact sound and the longest hold**: the ghost wall, "Forty centimetres apart."

## Scenes

| # | Chapter | Scene | Spoken (summary) | Picture and motion | Sound |
|---|---|---|---|---|---|
| 1 | The problem | Opening | Architect moves a wall 40 cm; posts in office chat; plumbers aren't in it; they run pipe to the old line | Drawn floor plan; the wall slides east on the first line, the old line stays red with "0.4 m east"; each line of text appears as it is spoken. Labelled "A scenario in simulated site data" | Score from silence |
| 2 | The problem | Stat | Nobody did anything wrong; someone pays to rip it out; survey: almost half of rework from poor communication | Kinetic type, then "48%" counts up with its source | Score |
| 3 | Second Eye | Reveal | "This is Second Eye. It shows you tomorrow's mistake, before it gets built." | Ink ground, mark drawn stroke by stroke, red ghost line lands, wordmark | Whoosh, tick |
| 4 | Second Eye | Overview | Reads the chats the site already uses; one shared record: what changed, who said it, who has heard | Real app, slow push-in | Score ducked under voice |
| 5 | Catch it | Build | Every message becomes an update that keeps its source; the architect in his own words | Wide, then camera to the inspector; outline draws around the quoted Rev C message | |
| 6 | Catch it | Ghost wall | Plumber texts his plan; Second Eye draws the problem; red vs black; "Forty centimetres apart"; HOLD with why and who | Whole floor with the crew chat; the app's own zoom to the wall (real burst frames); push in and hold; pan to the HOLD reply, outlined | Low impact on the reveal |
| 7 | Catch it | Why | Each crew only hears its own threads; the floor as the plumbers know it | "The floor as Novak Plumbing knows it", then the Who-knows-what matrix, red row outlined | |
| 8 | Fix it | Rehearse | Every evening, tomorrow is played forward; what can't be undone comes first | Crew lanes with redlined tasks, then up to "7 to settle before Sat 14 Nov morning" | |
| 9 | Fix it | Send | One tap; sending is not hearing; stays amber | Same camera: real red state → real amber state | Tick |
| 10 | Fix it | Confirm | Crew confirms this exact revision; checked again; warning clears; receipt | Same camera: amber → ghost gone, "Crew confirmed · record rechecked" | Resolve chime |
| 11 | Fix it | Ask | "Can we start the bathroom tomorrow morning?" Answer from the record, with sources | Desk crop (question, CLEAR answer with sources) beside the real crew phone | |
| 12 | It learns | Learn | Crew says "the blue room"; first time it asks; after one answer it knows | Run 1 learning panel → run 2 lesson with before/after and "the blue room" on Unit 204 | Tick |
| 13 | Proof | Numbers | 15 of 15 labelled problems, no false alarms, simulated not a field trial | Camera into the app's Measured table (from `npm run eval`) | |
| 14 | Proof | Loop | One record, checked when a crew speaks and the evening before; people and agents read it; the model reads, rules decide | Five real capture crops along one ink line | Whoosh |
| 15 | Proof | End | "Context for the physical world, kept up to date. Second Eye. See tomorrow's mistake, before it gets built." | Mark, name, promise, live demo address, track line, data boundary | Resolve, score fades |

## Rules kept

- Redline only on the ghost and conflicts. Captions are ink.
- "Simulated site data" on every product shot; the opening is labelled a scenario.
- Only two numbers: the eval table as the app prints it, and the cited survey figure.
- No "revolutionary", "seamless", "AI-powered", savings or competitor claims (`docs/pitch.md`, words to avoid).
