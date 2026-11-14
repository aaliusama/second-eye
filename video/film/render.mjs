// Renders the film. Bundles once, then either QA stills or the full video.
//
//   node render.mjs stills            one still per scene, mid-scene, into out/qa/
//   node render.mjs 1080              out/final-product-demo-1080p.mp4
//   node render.mjs 4k                out/final-product-demo.mp4 (3840x2160, scale 2)
//
// Uses the installed Microsoft Edge as the browser (BROWSER_PATH to override), so no browser download.

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const browserExecutable = process.env.BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const mode = process.argv[2] ?? "1080";

const serveUrl = await bundle({ entryPoint: join(here, "src", "index.tsx") });
const composition = await selectComposition({ serveUrl, id: "Film", browserExecutable });
await mkdir(join(here, "out", "qa"), { recursive: true });

if (mode === "stills") {
    const frames = (process.argv[3] ?? "").split(",").filter(Boolean).map(Number);
  const list = frames.length ? frames.map((f) => ({ id: `f${f}`, f })) : Array.from({ length: 18 }, (_, i) => { const f = Math.round(((i + 0.6) / 18) * composition.durationInFrames); return { id: `s${String(i).padStart(2, "0")}-f${f}`, f }; });
  console.log("duration", composition.durationInFrames, "frames");
  for (const s of list) {
    await renderStill({ serveUrl, composition, frame: s.f, output: join(here, "out", "qa", `${s.id}.png`), browserExecutable });
    console.log("still", s.id, s.f);
  }
} else {
  // The video itself goes through the Remotion CLI: on this machine files written by renderMedia()
  // from a script did not persist, while the CLI's output did. Same composition, same settings.
  const fourK = mode === "4k";
  const output = join("out", fourK ? "final-product-demo.mp4" : "final-product-demo-1080p.mp4");
  const args = ["remotion", "render", "src/index.tsx", "Film", output, "--codec=h264", `--scale=${fourK ? 2 : 1}`, `--crf=${fourK ? 16 : 18}`,
    "--audio-codec=aac", "--audio-bitrate=256k", "--pixel-format=yuv420p", `--concurrency=${process.env.CONCURRENCY ?? 8}`,
    `--browser-executable="${browserExecutable}"`, "--log=error"];
  const r = spawnSync("npx", args, { cwd: here, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("wrote", join(here, output));
}
