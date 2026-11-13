# Demo video recorder

Records the 3-minute submission video by driving the real web app through the beats in
`docs/demo-script.md`. It clicks the same buttons a presenter would and types on the crew phone inset.
Nothing is faked: what the video shows is what the app did.

Standalone folder, not an npm workspace, so the repo's install stays small.

## Run

```
npm run demo                 # in the repo root, leave it running
cd video
npm install                  # once: installs playwright-core only (no browser download)
node record.mjs
```

The webm lands in `video/out/` (gitignored). The configured run takes about 3 minutes and ends at 2:58. The recorder has not been visually revalidated against the full-data presenter in this integration; a reviewed final recording is not yet available. Do not treat a saved file as proof that every beat succeeded.

It uses Microsoft Edge (`browserPath` in `beats.json`), because Chrome is not installed on the demo
laptop. Point `browserPath` (or the `BROWSER_PATH` env var) at any Chromium browser to change it.

## beats.json

| Key | What |
|---|---|
| `phone.ghost` | the plumbing text that produces the ghost wall live (beat 0:45) |
| `phone.blueRoom` | the text that names "the blue room" (beat 2:20) |
| `wallName`, `crews`, `blueRoomCrew`, `blueRoomPlace` | names as the UI shows them |
| `totalSeconds`, `sliderSteps` | length of the recording and slider steps walked in the rehearsal beat |

Both phone texts now match the Phone script in `data/scenario.md` and its cached live ids. If those words change, confirm the new cache entries before recording (`npm run cache-id -- "<text>" <crewId>` prints the id). The production presenter uses `web/src/present/beats.ts` as its source of text. This legacy recorder still has its own `beats.json`; keep them consistent.

Every step logs `ok` or `skip`. A control that is missing is skipped, never fatal, so one changed
label does not cost the whole take. Check the log before using a recording.

For the final submission, prefer recording the real presenter run at `/?present=1`: R starts clean, then right arrow advances the ten beats in `docs/demo-script.md`. Confirm Build selects m-001/W-12, Fix approves that ghost's correction, and the same blue-room words are unresolved on run 1 and resolved after mapping on run 2. Review the entire take, reject any skipped/failed beat, and add the final shareable video link to `docs/submission.md`.

The recording starts with `POST /api/reset {keepLearning:false}`, the script's "Start clean" setup.
