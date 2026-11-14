// Measures every voice line (public/voice/*.wav), trims nothing, and writes src/voice-timing.json:
// for each scene, each line's start (seconds from scene start, after its gap) and duration.
// The film reads this to size scenes, place audio and show the spoken line on screen.
//
//   node voice/timing.mjs [engine-label]

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(await readFile(join(here, "script.json"), "utf8"));

/** Duration of a PCM or float WAV from its header (walks chunks; tolerant of extra chunks). */
async function wavSeconds(file) {
  const b = await readFile(file);
  let off = 12, rate = 0, block = 0;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") { rate = b.readUInt32LE(off + 12); block = b.readUInt16LE(off + 20); }
    if (id === "data") return size / (rate * block);
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

const out = { engine: process.argv[2] ?? "kokoro af_heart", scenes: {} };
let total = 0;
for (const [scene, lines] of Object.entries(script.scenes)) {
  let t = 0;
  out.scenes[scene] = [];
  for (const [i, line] of lines.entries()) {
    t += line.gap;
    const dur = await wavSeconds(join(here, "..", "public", "voice", `${scene}-${i}.wav`));
    out.scenes[scene].push({ file: `voice/${scene}-${i}.wav`, text: line.text, start: +t.toFixed(3), dur: +dur.toFixed(3) });
    t += dur;
  }
  total += t;
  console.log(scene.padEnd(9), t.toFixed(1), "s");
}
await writeFile(join(here, "..", "src", "voice-timing.json"), JSON.stringify(out, null, 2));
console.log("spoken total", total.toFixed(1), "s");
