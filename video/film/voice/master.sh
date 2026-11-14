#!/usr/bin/env bash
# Masters raw voice lines into public/voice/ (what the film plays):
# trim silence at both ends, 80 Hz low cut, gentle compression, every line to -18 LUFS, 48 kHz.
#   bash voice/master.sh public/voice-chatterbox
set -euo pipefail
SRC="${1:-public/voice-chatterbox}"
mkdir -p public/voice
for f in "$SRC"/*.wav; do
  ffmpeg -y -loglevel error -i "$f" -af "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.12,areverse,highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,loudnorm=I=-18:TP=-2:LRA=7" -ar 48000 -ac 1 "public/voice/$(basename "$f")"
done
echo "mastered $(ls "$SRC"/*.wav | wc -l) lines from $SRC"
