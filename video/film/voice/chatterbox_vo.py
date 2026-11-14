"""Voice-over with Chatterbox (Resemble AI, MIT licence), run locally on the GPU. No API, no account.

    python voice/chatterbox_vo.py [out_dir] [exaggeration] [cfg_weight]

Writes <out_dir>/<scene>-<n>.wav for every line of voice/script.json (default public/voice-chatterbox).
Uses Chatterbox's built-in default voice; no voice is cloned. Fixed seed per line, so runs repeat.
"""
import json, sys, pathlib
import torch, torchaudio
from chatterbox.tts import ChatterboxTTS

here = pathlib.Path(__file__).parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent / "public" / "voice-chatterbox"
exaggeration = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
cfg = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
out.mkdir(parents=True, exist_ok=True)

script = json.loads((here / "script.json").read_text(encoding="utf-8"))
device = "cuda" if torch.cuda.is_available() else "cpu"
model = ChatterboxTTS.from_pretrained(device=device)
only = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None
for scene, lines in script["scenes"].items():
    for i, line in enumerate(lines):
        name = f"{scene}-{i}"
        if only and name not in only:
            continue
        torch.manual_seed(int(__import__("os").environ.get("SEED", "1000")) + i + 37 * len(scene))
        wav = model.generate(line["text"], exaggeration=exaggeration, cfg_weight=cfg)
        torchaudio.save(str(out / f"{name}.wav"), wav.cpu(), model.sr)
        print(name, f"{wav.shape[-1] / model.sr:.1f}s", flush=True)
print("chatterbox done", device)
