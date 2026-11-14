# Voice-over: how the voice was chosen

Goal: a narrator that sounds like a person, not a text-to-speech robot, with no paid API and no rights problems. Everything here runs locally (RTX 3060 laptop GPU or CPU); the script never leaves the machine.

## Engines considered

| Engine | Licence | Ran it? | Verdict |
|---|---|---|---|
| **Chatterbox** (Resemble AI) | MIT | Yes, GPU, ~24 it/s | **Chosen.** Expressive, natural pacing and emphasis; built-in default voice (no cloning). Occasionally slurs or drops a word, so every line is verified (below) |
| **Kokoro-82M** (hexgrad) via `kokoro-js` | Apache-2.0 | Yes, CPU, ~3.5 s per sentence | Very clean and consistent; slightly flatter, more "read". Best Kokoro voice is `af_heart` (graded A in Kokoro's own voice list); male voices are graded C to C+. Kept as the fallback |
| Piper, Windows SAPI voices | MIT / OS | No | Audibly synthetic; ruled out |
| Microsoft Edge online neural voices (`edge-tts`) | unofficial use of a Microsoft service | No | Natural, but runs on Microsoft's servers under unclear terms for reuse; ruled out for a published film |
| XTTS-v2 | Coqui Public Model Licence (non-commercial) | No | Licence too restrictive |
| ElevenLabs and other hosted voices | paid | No | No paid calls without approval |

## Evidence, not one listen

`voice/verify.py` transcribes every line with Whisper (`small.en`, local) and compares the words with the script.

| Take | Word match | Real errors found |
|---|---|---|
| Kokoro `af_heart`, speed 0.97 | 419/432 (97.0%) | none (flags were "40" vs "forty", "anymore", "labeled") |
| Chatterbox, first pass | 418/432 (96.8%) | "The plumbers **are** in that chat" (meaning flipped), "group Chatzer site", "Life context" |
| Chatterbox, after rewording those lines | 431/439 (98.2%) | none (remaining flags are spelling: "40", "anymore", "labeled") |

The rewording also made the script plainer for a non-technical listener ("But sending is not the same as hearing").

## Listen yourself

`voice/audition/A-kokoro-then-B-chatterbox.m4a` (30 s): the same four lines in Kokoro, then Chatterbox. To switch the film to Kokoro:

```
node voice/kokoro.mjs af_heart 0.97        # writes public/voice/ directly (replaces the Chatterbox lines)
node voice/timing.mjs "Kokoro-82M af_heart"
node render.mjs 4k
```

## Pipeline

1. `voice/script.json`: every spoken line, per scene, with the pause before it. Facts only from README, `docs/pitch.md` and `eval/results.json`.
2. `python voice/chatterbox_vo.py public/voice-chatterbox 0.5 0.45` (exaggeration 0.5, cfg 0.45, fixed seeds; `SEED=` to try another take; a 4th argument regenerates only the named lines).
3. `python voice/verify.py public/voice-chatterbox`: Whisper check.
4. `bash voice/master.sh public/voice-chatterbox`: trim silences, 80 Hz low cut, gentle compression, every line to -18 LUFS → `public/voice/`.
5. `node voice/timing.mjs`: measures lines → `src/voice-timing.json`. Scene lengths, camera moves, captions and music ducking all follow it.

Python environment: Python 3.12, `torch==2.6.0`/`torchaudio==2.6.0` (cu124), `chatterbox-tts==0.1.2`, `faster-whisper==1.1.1`.
