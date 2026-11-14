# Second Eye film

A 98-second product film (1920x1080, 30 fps, no sound) cut from stills of the running app. Separate from the 3-minute presenter recording in `video/`.

Standalone folder, not an npm workspace, so the repo's install stays small.

## Make it

```
npm run demo                 # in the repo root, leave it running
cd video/cinematic
npm install                  # once: Remotion, React, the Archivo font
npm run capture              # stills from the app -> public/shots/ (DEMO_URL=http://localhost:<port> for another copy)
npm run render               # -> out/second-eye-film.mp4
```

- `capture.mjs` drives presenter mode (`/?present=1`) with the presenter's own keys and saves one still per beat, plus the three toggle states and the 3D view of the ghost wall. It resets the demo first (`POST /api/reset`). It uses Microsoft Edge through the DevTools Protocol; set `BROWSER_PATH` for another Chromium browser. It exits 1 and lists the problem if a beat reports "Failed", a control is missing or the page throws.
- `src/Film.tsx` is the whole cut: scene order, captions, camera moves. Colours and type are the app's tokens (`web/src/tokens.ts`).
- `public/shots/`, `out/` and `node_modules/` are not committed.

## What is and is not in it

- Every product image is a still of the real app. Motion is camera moves and cross-fades between real states; the app's own animations (the ghost reveal) are not in it.
- The opening quotes two messages from the synthetic chat, word for word.
- The numbers scene is typed from `eval/results.json`. If `npm run eval` prints different numbers, change `Numbers` in `src/Film.tsx` before rendering.
- Every scene carries "Simulated site data".
- No music, voice or sound effects.

## Licence note

Remotion is free for individuals and small teams and needs a company licence above that size: check https://remotion.dev/license before using the film commercially.

`PRODUCT_VIDEO_BRIEF.md` is what the film is about; `STORYBOARD.md` is the scene list.
