// Records the 3-minute demo by driving presenter mode (?present=1) with its own keys, on the cue
// times of docs/demo-script.md. Every beat runs the same code a presenter's key press runs.
// It starts nothing: run `npm run demo` first.
//
//   cd video && npm install && node record-present.mjs [--captions]
//
// Unlike record.mjs it never skips silently: if a beat reports "Failed" or "not set", or the page
// throws, the take is marked FAILED and the exit code is 1. Review the whole video anyway.
// --captions overlays the spoken line as a caption strip (a recording overlay, not part of the app).

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(here, "beats.json"), "utf8"));
const BASE = process.env.DEMO_URL ?? config.baseUrl ?? "http://localhost:5173";
const BROWSER = process.env.BROWSER_PATH ?? config.browserPath;
const OUT = join(here, "out");
const SIZE = { width: 1440, height: 900 };
const CAPTIONS = process.argv.includes("--captions");

/** Cue (seconds from start) per beat, in presenter order. Captions are the short spoken lines. */
const CUES = [
  { at: 0, beat: "Problem", say: "Thursday the architect moved a bathroom wall 40 cm. The plumbers were not in that thread. Simulated site data." },
  { at: 20, beat: "Build", say: "Every chat message becomes a change to one record of the floor, and keeps its source." },
  { at: 40, beat: "Ghost wall", say: "Plumbing states tomorrow's work. Red: where they will measure from. Black: the wall per the record." },
  { at: 70, beat: "Why", say: "The change was said in the office thread. Plumbing does not read it." },
  { at: 85, beat: "Rehearse", say: "Every evening, tomorrow is played forward. The things you cannot undo come first." },
  { at: 105, beat: "Send", say: "One tap sends the correction. Sent is not heard: it stays amber." },
  { at: 120, beat: "Confirm", say: "The crew confirms this exact revision. The record is rechecked. Receipt, not proof of work." },
  { at: 135, beat: "Ask", say: "Crews ask questions and get answers from the record, with sources." },
  { at: 145, beat: "Learn", say: "\"The blue room\": the record does not guess. The superintendent maps it once." },
  { at: 155, beat: "Run 2", say: "Next run, same words: resolved on its own." },
  { at: 165, beat: "Numbers", say: "Measured on the synthetic labelled scenario. The LLM reads. Rules decide." },
];
const END = 180;

let t0 = 0;
const clock = () => {
  const s = t0 ? Math.round((Date.now() - t0) / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const log = (...a) => console.log(`[${clock()}]`, ...a);
async function until(sec) {
  const wait = t0 + sec * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function barText(page) {
  return (await page.locator("nav.presenter .meta").textContent().catch(() => "")) ?? "";
}
async function waitIdle(page) {
  for (let i = 0; i < 60; i++) {
    if (!/^Working/.test(await barText(page))) return;
    await page.waitForTimeout(250);
  }
}

async function caption(page, text) {
  if (!CAPTIONS) return;
  await page.evaluate((t) => {
    let el = document.getElementById("rec-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "rec-caption";
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%)", zIndex: "9999",
        maxWidth: "900px", padding: "10px 18px", background: "rgba(20,22,28,.88)", color: "#fff",
        font: "500 22px/1.35 system-ui, sans-serif", textAlign: "center", pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => undefined);
  if (!health?.ok) throw new Error(`no demo at ${BASE}. Start it with npm run demo, then run this again.`);

  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const video = page.video();

  await page.goto(`${BASE}/?present=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  t0 = Date.now();

  for (const [i, cue] of CUES.entries()) {
    await until(cue.at);
    await page.keyboard.press(i === 0 ? "r" : "ArrowRight");
    await waitIdle(page);
    const note = await barText(page);
    const current = (await page.locator('nav.presenter li[aria-current="step"]').textContent().catch(() => "")) ?? "";
    if (current.trim() !== cue.beat) problems.push(`${cue.beat}: presenter is on "${current.trim()}"`);
    if (/Failed|not set|Nothing unresolved/i.test(note)) problems.push(`${cue.beat}: ${note}`);
    log(current.trim() === cue.beat ? "ok  " : "BAD ", cue.beat, "-", note.slice(0, 90));
    await caption(page, cue.say);
  }
  await until(END);

  await context.close();
  await browser.close();
  const raw = await video.path();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const status = problems.length ? "FAILED" : "ok";
  const file = join(OUT, `demo-present-${stamp}-${status}.webm`);
  await rename(raw, file);
  await writeFile(file.replace(/\.webm$/, ".log.txt"), problems.length ? problems.join("\n") + "\n" : "no problems detected\n");
  log(status === "ok" ? "saved" : "FAILED take saved", file);
  for (const p of problems) log("problem:", p);
  if (problems.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
