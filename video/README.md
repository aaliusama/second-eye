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

The webm lands in `video/out/` (gitignored). The run takes about 3 minutes and ends at 2:58.

It uses Microsoft Edge (`browserPath` in `beats.json`), because Chrome is not installed on the demo
laptop. Point `browserPath` (or the `BROWSER_PATH` env var) at any Chromium browser to change it.

## beats.json

| Key | What |
|---|---|
| `phone.ghost` | the plumbing text that produces the ghost wall live (beat 0:45) |
| `phone.blueRoom` | the text that names "the blue room" (beat 2:20) |
| `wallName`, `crews`, `blueRoomCrew`, `blueRoomPlace` | names as the UI shows them |
| `totalSeconds`, `sliderSteps` | length of the recording and slider steps walked in the rehearsal beat |

Phone texts still in `[[...]]` form are skipped: the beat holds on the screen instead of typing a
placeholder. Fill them from the Phone script in `data/scenario.md` once it exists, and make sure each
text has a cache entry (`npm run cache-id -- "<text>" <crewId>` prints its id), otherwise the phone
answers "Not found".

Every step logs `ok` or `skip`. A control that is missing is skipped, never fatal, so one changed
label does not cost the whole take. Check the log before using a recording.

The recording starts with `POST /api/reset {keepLearning:false}`, the script's "Start clean" setup.
