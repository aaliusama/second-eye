// Voice-over with Kokoro-82M (Apache-2.0), run locally on the CPU. No API, no account.
//
//   node voice/kokoro.mjs [voice] [speed]      default af_heart 0.97
//
// Writes public/voice/<scene>-<n>.wav for every line of voice/script.json, then run
// `node voice/timing.mjs` to measure them and lay out the film.

import { KokoroTTS } from "kokoro-js";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "voice");
const voice = process.argv[2] ?? "af_heart";
const speed = Number(process.argv[3] ?? 0.97);
const script = JSON.parse(await readFile(join(here, "script.json"), "utf8"));

await mkdir(OUT, { recursive: true });
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
for (const [scene, lines] of Object.entries(script.scenes)) {
  for (const [i, line] of lines.entries()) {
    const audio = await tts.generate(line.text, { voice, speed });
    await audio.save(join(OUT, `${scene}-${i}.wav`));
    process.stdout.write(`${scene}-${i} `);
  }
}
console.log(`\nkokoro ${voice} x${speed} done`);
