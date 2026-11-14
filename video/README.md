# Demo video recorder

Records the 3-minute submission video by driving the real web app. Nothing is faked: what the video shows is what the app did. All site data in it is simulated, and the app labels it on screen.

Standalone folder, not an npm workspace, so the repo's install stays small.

## Record the presenter (preferred)

`record-present.mjs` drives presenter mode (`/?present=1`) with its own keys, on the cue times of `docs/demo-script.md`: R starts clean, then → advances the twelve beats (Problem, Build, Ghost wall, Why, How it decided, Rehearse, Send, Confirm, Ask, Learn, Run 2, Numbers). Every beat runs the same code a presenter's key press runs.

```
npm run demo                          # in the repo root, leave it running
cd video
npm install                           # once: installs playwright-core only (no browser download)
node record-present.mjs --captions    # DEMO_URL=http://localhost:<port> for another copy
```

- The webm and a `.log.txt` land in `video/out/` (gitignored). The take is named `demo-present-<time>-ok.webm`, or `-FAILED.webm` with exit code 1 if any beat reported "Failed" or "not set", the presenter was on the wrong beat, or the page threw. The log lists each problem, or says "no problems detected".
- `--captions` overlays the spoken line as a caption strip. It is a recording overlay, not part of the app.
- A clean log is necessary, not sufficient: watch the whole take before using it.
- Video capture needs Playwright's ffmpeg build. If the recorder says `ffmpeg-win64.exe` is missing, run `node node_modules/playwright-core/cli.js install ffmpeg` once (downloads only ffmpeg, about 1.3 MiB, into the user's `ms-playwright` folder).
- The pinned `playwright-core` 1.49.1 could not launch the current Edge on the demo laptop. Without changing the pin, `npm install --no-save playwright-core@1.55.0` in this folder installs a version that works for the session.

It uses Microsoft Edge (`browserPath` in `beats.json`), because Chrome is not installed on the demo laptop. Point `browserPath` (or the `BROWSER_PATH` env var) at any Chromium browser to change it.

Phone texts for the presenter live in `web/src/present/beats.ts` (`PHONE`). If those words change, confirm the new cache entries before recording (`npm run cache-id -- "<text>" <crewId>` prints the id).

## Legacy recorder

`record.mjs` clicks buttons instead of driving the presenter and predates the current beats. Every step logs `ok` or `skip`; a missing control is skipped, never fatal, so check the log. It reads `beats.json`:

| Key | What |
|---|---|
| `phone.ghost` | the plumbing text that produces the ghost wall live |
| `phone.blueRoom` | the text that names "the blue room" |
| `wallName`, `crews`, `blueRoomCrew`, `blueRoomPlace` | names as the UI shows them |
| `totalSeconds`, `sliderSteps` | length of the recording and slider steps walked in the rehearsal beat |

Keep `beats.json` consistent with `web/src/present/beats.ts`. The recording starts with `POST /api/reset {keepLearning:false}`, the script's "Start clean" setup.

Add the final shareable video link to `docs/submission.md` after reviewing the take.
