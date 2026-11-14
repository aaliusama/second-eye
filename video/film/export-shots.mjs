// Writes shots.json (the shot manifest with timecodes) by evaluating src/timeline.ts.
// Node strips the TypeScript types; the JSON import is resolved by hand here.
import { readFile, writeFile } from "node:fs/promises";
const src = (await readFile("src/timeline.ts", "utf8"))
  .replace(/^import timing from "\.\/voice-timing\.json";/m, `const timing = ${await readFile("src/voice-timing.json", "utf8")};`);
await writeFile("out/timeline.tmp.ts", src);
const m = await import(new URL("./out/timeline.tmp.ts", import.meta.url));
const fmt = (f) => { const s = f / m.FPS; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
const scenes = m.layout().map((s) => ({ id: s.id, chapter: m.CHAPTERS[s.chapter], start: fmt(s.from), end: fmt(s.from + s.dur), from: s.from, dur: s.dur, source: s.source, feature: s.feature,
  voice: s.lines.map((l) => ({ at: fmt(s.from + Math.round(l.start * m.FPS)), text: l.text })) }));
await writeFile("shots.json", JSON.stringify({ fps: m.FPS, width: 1920, height: 1080, master: { width: 3840, height: 2160 }, voice: m.ENGINE, overlapFrames: m.OVERLAP, totalFrames: m.TOTAL, length: fmt(m.TOTAL), scenes }, null, 2));
console.log("shots.json", fmt(m.TOTAL), scenes.length, "scenes");
