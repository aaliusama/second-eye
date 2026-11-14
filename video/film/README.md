# Second Eye: product film

A 2:38 narrated product film (human-sounding local voice, captions always on screen), built with Remotion from real captures of the running app. Standalone folder, not an npm workspace.

| File | What |
|---|---|
| `out/final-product-demo.mp4` | 3840x2160 master, H.264, 30 fps, AAC (gitignored; render it) |
| `out/final-product-demo-1080p.mp4` | 1920x1080 distribution copy, downscaled from the master |
| `qa/contact-sheet.jpg` | One frame every 5 s of the final render, for review |
| `PRODUCT_VIDEO_BRIEF.md` | What the product is and what the film may claim |
| `STORYBOARD.md` | Every scene: objective, camera, text, sound |
| `shots.json` | Shot manifest with timecodes, generated from `src/timeline.ts` |
| `AUDIO.md` | Every sound and its rights |
| `voice/` | Voice-over script, generators (Chatterbox, Kokoro), Whisper check, mastering; `voice/VOICE.md` explains the choice; `voice/audition/` has an A/B sample |
| `public/capture/` | The captured screenshots and `manifest.json` with element rectangles |

## Re-make it

```
npm run demo                      # repo root, leave it running (offline, cached LLM)
cd video/film
npm install                       # once
node capture.mjs                  # drives ?present=1 through all 11 beats, writes public/capture/
node gen-audio.mjs 170            # writes public/audio/
# voice-over: see voice/VOICE.md (generate, verify with Whisper, then:)
npm run voice                     # master public/voice-chatterbox into public/voice, measure timing
npm run shots                     # refresh shots.json
npm run studio                    # preview and edit in Remotion Studio
node render.mjs stills            # one QA still per scene into out/qa/
node render.mjs 4k                # master, about 9 min on 16 threads
ffmpeg -i out/final-product-demo.mp4 -vf scale=1920:1080:flags=lanczos -c:v libx264 -crf 18 -preset slow -movflags +faststart -c:a copy out/final-product-demo-1080p.mp4
# then normalise each file to -16 LUFS (video copied, audio re-encoded):
ffmpeg -i in.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 256k -movflags +faststart out.mp4
```

`node render.mjs 1080` renders the 1080p copy directly (about 7 minutes). Videos render through the Remotion CLI: on this machine, files written by `renderMedia()` from a script did not persist.

Rendering uses the installed Microsoft Edge (`BROWSER_PATH` to change it), so Remotion downloads no browser.

## Editing

- Scene order and lengths: `src/timeline.ts`.
- Scene content, cameras and captions: `src/Film.tsx` (product scenes) and `src/scenes/Designed.tsx` (opening, reveal, loop, end).
- Shared pieces: `src/components.tsx` (`Shot` camera, `Burst`, `Caption`, `Mark`, `Grid`, `Fade`, `SimLabel`). Brand tokens: `src/theme.ts`, copied from `web/src/tokens.ts`.
- If the app's layout changes, re-run `capture.mjs` and check the camera rectangles against `public/capture/manifest.json`.

## Limits

- The 4K master is upscaled from 2x captures where the camera shows the whole app (the source is 2880 px wide). Zoomed shots are at or above native resolution.
- Send and Confirm show the real before and after states as a crossfade on the same camera. The capture run used presenter keys, so the film shows no cursor.
- The opening is an illustration of the scenario, labelled as such. Everything after it is the app.

## Final cut with the team intro

The submitted cut puts the team's 10 s intro clip (not in git: it is personal footage) in front of the film, with a 0.8 s fade through white on "Here's how" and an audio crossfade. The intro's sound is raised to -16 LUFS to match the narrator.

```
ffmpeg -i team.mp4 -i out/final-product-demo-1080p.mp4 -filter_complex "[0:v]trim=0:10,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,unsharp=5:5:0.6,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.3,settb=AVTB[tv];[1:v]fps=30,setsar=1,format=yuv420p,settb=AVTB[fv];[tv][fv]xfade=transition=fadewhite:duration=0.8:offset=9.2[v];[0:a]atrim=0:10,asetpts=PTS-STARTPTS,aresample=48000,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=7,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.2[ta];[1:a]aresample=48000,aformat=channel_layouts=stereo[fa];[ta][fa]acrossfade=d=0.8:c1=tri:c2=tri[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac -b:a 256k -movflags +faststart out/final-with-team-1080p.mp4
```
