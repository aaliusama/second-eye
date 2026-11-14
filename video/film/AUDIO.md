# Audio and attribution

## Voice-over

Narrated with **Chatterbox** (Resemble AI, MIT licence), run locally, using the model's built-in default voice. No real person's voice is cloned. Script: `voice/script.json`. How the voice was chosen and verified: `voice/VOICE.md`. Mastered lines: `public/voice/` (-18 LUFS each). The music ducks under every spoken line.

## Music and effects

Every other sound is synthesized by `gen-audio.mjs` from code in this repository: sine and noise oscillators, envelopes and filters. No samples, recordings, loops or downloaded assets, so no third-party rights to clear.

| File | What | Used at |
|---|---|---|
| `public/audio/score.wav` | Ambient score: Dmaj9 → Bm9 → Gmaj7#11 → A6sus pad, a soft D drone, filtered air, a sparse felt-piano motif | Whole film; ducked under the voice |
| `public/audio/whoosh.wav` | Filtered noise swell | Into the brand reveal, into the loop |
| `public/audio/tick.wav` | Short damped click | The mark's ghost line, Send, Learn |
| `public/audio/impact.wav` | Sub thump with a soft noise body | The ghost wall reveal (the peak) |
| `public/audio/resolve.wav` | Rising D–A–D chime | Crew confirmation, end card |

Regenerate: `node gen-audio.mjs 170` (deterministic).

Final mix: both deliverables normalised to -16 LUFS integrated, -1.5 dBTP.

## Fonts, visuals, data

- Archivo (SIL Open Font License 1.1), from the repo's `@fontsource-variable/archivo` package.
- All product imagery: screenshots of this project's own app (`capture.mjs`). All site data is simulated.
- The 48% figure is quoted from `docs/pitch.md`: PlanGrid and FMI survey of about 600 construction leaders, 2018; source shown on screen.
- The mark is `docs/assets/readme/mark.svg` from this repo.
- Remotion is used under its license (free for individuals and small teams; see remotion.dev/license).
