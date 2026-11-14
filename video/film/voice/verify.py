"""Checks a voice-over against the script by transcribing every line with Whisper (local).
Reports word accuracy per line and flags dropped or garbled words, so a take is judged on
evidence rather than on one listen.

    python voice/verify.py public/voice-chatterbox [model]
"""
import json, re, sys, pathlib, difflib
from faster_whisper import WhisperModel
import torchaudio

def load16k(p):
    w, sr = torchaudio.load(p)
    return torchaudio.functional.resample(w.mean(0), sr, 16000).numpy()

here = pathlib.Path(__file__).parent
d = pathlib.Path(sys.argv[1])
model = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "small.en", device="cuda", compute_type="float16")
script = json.loads((here / "script.json").read_text(encoding="utf-8"))
norm = lambda s: re.sub(r"[^a-z0-9 ]", " ", s.lower().replace("204", "two oh four")).split()

tot = ok = 0
bad = []
for scene, lines in script["scenes"].items():
    for i, line in enumerate(lines):
        segs, _ = model.transcribe(load16k(str(d / f"{scene}-{i}.wav")), beam_size=5, language="en")
        heard = " ".join(s.text for s in segs)
        a, b = norm(line["text"]), norm(heard)
        sm = difflib.SequenceMatcher(a=a, b=b)
        match = sum(x.size for x in sm.get_matching_blocks())
        tot += len(a); ok += match
        acc = match / max(1, len(a))
        if acc < 0.9:
            bad.append((f"{scene}-{i}", round(acc, 2), heard.strip()))
print(f"{d.name}: word match {ok}/{tot} = {ok / tot:.3f}")
for b in bad:
    print("  CHECK", *b)
