// Captures the real product for the film. Drives presenter mode (?present=1) through its eleven
// beats with the presenter's own keys, exactly as record-present.mjs does, but takes sharp 2x
// screenshots instead of a low-bitrate screen recording. Nothing is mocked: every frame is the app.
//
//   npm run demo            (repo root, leave running)
//   cd video/film && node capture.mjs
//
// Writes public/capture/<beat>.png, bursts for animated beats, phone screenshots, and
// public/capture/manifest.json with element rectangles (CSS px at 1440x900) used as camera targets.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DEMO_URL ?? "http://localhost:5173";
const BROWSER = process.env.BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = join(here, "public", "capture");
const VIEW = { width: 1440, height: 900 };

const BEATS = ["Problem", "Build", "Ghost wall", "Why", "Rehearse", "Send", "Confirm", "Ask", "Learn", "Run 2", "Numbers"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
/** Beats whose change on screen is worth a frame burst (state changes the film shows in motion). */
const BURST = new Set(["Ghost wall"]);

const SELECTORS = {
  ghost: ".ghost",
  ghostNote: ".ghost-note",
  incidents: ".incident-list",
  incidentFocus: ".incident-focus",
  measured: ".measured-large",
  slider: ".slider",
  inspector: ".inspector",
  huddle: ".huddle-panel",
  presenter: "nav.presenter",
  phone: ".phone-page",
};

async function rects(page) {
  return page.evaluate((sel) => {
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = [...document.querySelectorAll(s)].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (el) {
        const r = el.getBoundingClientRect();
        out[k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
    const svgs = [...document.querySelectorAll("svg")].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height);
    if (svgs[0]) out.plan = { x: Math.round(svgs[0].x), y: Math.round(svgs[0].y), w: Math.round(svgs[0].width), h: Math.round(svgs[0].height) };
    return out;
  }, SELECTORS);
}

async function barText(page) {
  return (await page.locator("nav.presenter .meta").textContent().catch(() => "")) ?? "";
}
async function waitIdle(page) {
  for (let i = 0; i < 80; i++) {
    if (!/^Working/.test(await barText(page))) return;
    await page.waitForTimeout(250);
  }
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => undefined);
  if (!health?.ok) throw new Error(`no demo at ${BASE}. Start it with npm run demo.`);
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.goto(`${BASE}/?present=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const manifest = { view: VIEW, scale: 2, capturedAt: new Date().toISOString(), beats: [] };

  for (const [i, beat] of BEATS.entries()) {
    await page.keyboard.press(i === 0 ? "r" : "ArrowRight");
    const name = slug(beat);
    const frames = [];
    if (BURST.has(beat)) {
      // 8 frames over ~1.2 s: the real transition as the app animates it.
      for (let f = 0; f < 8; f++) {
        const file = `${name}-burst-${String(f).padStart(2, "0")}.jpg`;
        await page.screenshot({ path: join(OUT, file), type: "jpeg", quality: 92 });
        frames.push(file);
        await page.waitForTimeout(150);
      }
    }
    await waitIdle(page);
    await page.waitForTimeout(2200);
    const note = await barText(page);
    const current = ((await page.locator('nav.presenter li[aria-current="step"]').textContent().catch(() => "")) ?? "").trim();
    if (current !== beat) problems.push(`${beat}: presenter on "${current}"`);
    if (/Failed|not set|Nothing unresolved/i.test(note)) problems.push(`${beat}: ${note}`);

    // Clean frame without the presenter step bar (H hides it; keys keep working).
    await page.keyboard.press("h");
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    const r = await rects(page);
    await page.keyboard.press("h");

    if (beat === "Ghost wall" || beat === "Ask" || beat === "Run 2") {
      // The crew phone, read from the same server state at this moment.
      const phone = await ctx.newPage();
      await phone.setViewportSize({ width: 390, height: 844 });
      await phone.goto(`${BASE}/phone`, { waitUntil: "networkidle" });
      await phone.waitForTimeout(1200);
      await phone.screenshot({ path: join(OUT, `phone-${name}.png`) });
      await phone.close();
    }

    manifest.beats.push({ beat, file: `${name}.png`, burst: frames, note: note.trim(), rects: r });
    console.log(current === beat ? "ok " : "BAD", beat, "|", note.slice(0, 100), "|", Object.keys(r).join(","));
  }

  manifest.problems = problems;
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
  for (const p of problems) console.log("problem:", p);
  if (problems.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
