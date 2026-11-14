// Records the 3-minute demo as a webm by driving the real UI, beat by beat, on the timings of
// docs/demo-script.md. It starts nothing: run `npm run demo` first.
//
//   cd video && npm install && node record.mjs
//
// Phone texts come from beats.json. A text still in [[...]] form is skipped (the beat holds on
// the screen instead), so the recording never shows a placeholder.

import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(here, "beats.json"), "utf8"));
const BASE = process.env.DEMO_URL ?? config.baseUrl ?? "http://localhost:5173";
const BROWSER = process.env.BROWSER_PATH ?? config.browserPath;
const OUT = join(here, "out");
const SIZE = { width: 1440, height: 900 };

const isPlaceholder = (s) => typeof s !== "string" || s.trim() === "" || s.includes("[[");
const log = (...a) => console.log(`[${clock()}]`, ...a);

let t0 = 0;
const clock = () => {
  const s = t0 ? Math.round((Date.now() - t0) / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** Wait until `sec` seconds after the recording started, so beats land on the script's timings. */
async function until(sec) {
  const wait = t0 + sec * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
/** Run one step; a missing control is logged and skipped, never fatal. */
async function step(name, fn) {
  try {
    await fn();
    log("ok  ", name);
  } catch (err) {
    log("skip", name, "-", String(err?.message ?? err).split("\n")[0]);
  }
}

async function api(path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.json();
}

async function phoneSend(page, crewName, text) {
  // The crew chat lives in the desk's Crew tab.
  const toggle = page.getByRole("navigation", { name: "Site desk sections" }).getByRole("button", { name: /^Crew$/ });
  if (await toggle.count()) await toggle.click();
  const phone = page.getByRole("region", { name: "Crew phone" });
  const select = phone.locator("select").first();
  const value = await select.evaluate(
    (el, name) => [...el.options].find((o) => o.textContent.includes(name))?.value ?? "",
    crewName,
  );
  if (!value) throw new Error(`crew "${crewName}" is not in the phone's list`);
  await select.selectOption(value);
  const input = phone.getByRole("textbox");
  await input.click();
  await input.pressSequentially(text, { delay: 35 });
  await phone.getByRole("button", { name: "Send" }).click();
}

async function main() {
  await api("/health").catch(() => {
    throw new Error(`no demo at ${BASE}. Start it with npm run demo, then run this again.`);
  });
  // Setup from the script: run 1 starts with nothing learned.
  await api("/reset", { keepLearning: false });

  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
  const page = await context.newPage();
  const video = page.video();

  t0 = Date.now();
  await page.goto(BASE, { waitUntil: "networkidle" });
  log("page open: the ghost reveal plays once on load");

  // 0:00-0:20 Problem: hold on the drawing.
  await until(20);

  // 0:20-0:45 Build: chat becomes the model.
  await step("record: model after the architect's message", async () => {
    await page.getByRole("button", { name: /Model after this message/ }).first().click();
  });
  await until(28);
  await step("back to now", async () => page.getByRole("button", { name: /Back to now/ }).click());
  await until(31);
  await step("inspect the 204 wall", async () => {
    await page.getByRole("button", { name: new RegExp(`^${config.wallName}, `) }).first().click();
  });
  await until(45);

  // 0:45-1:20 Live check: the ghost wall, from the phone.
  if (isPlaceholder(config.phone.ghost)) log("skip", "phone ghost text is a placeholder; holding on the plan");
  else await step("phone: plumbing states tomorrow's work", () => phoneSend(page, config.crews.plumbing, config.phone.ghost));
  await until(80);

  // 1:20-1:35 Why: click the ghost.
  await step("click the ghost", async () => page.getByRole("button", { name: /^Ghost:/ }).first().click());
  await until(95);

  // 1:35-2:00 Rehearse tomorrow: walk the slider from 07:00 to 17:00.
  await step("drag the time slider", async () => {
    const slider = page.getByRole("slider", { name: "Time tomorrow" });
    await slider.focus();
    await slider.press("Home");
    for (let i = 0; i < config.sliderSteps; i++) {
      await page.waitForTimeout(1100);
      await slider.press("ArrowRight");
    }
  });
  await until(120);

  // 2:00-2:20 Fix: one tap.
  await step("approve the fix", async () => {
    // The priority card's primary action; the full approval list is folded under "All proposed actions".
    await page.getByRole("navigation", { name: "Site desk sections" }).getByRole("button", { name: /^Priorities$/ }).click();
    await page.getByRole("button", { name: new RegExp(`^Send correction to ${config.crews.plumbing}`) }).first().click();
  });
  await until(140);

  // 2:20-2:45 Learn: the blue room.
  if (isPlaceholder(config.phone.blueRoom)) {
    log("skip", "blue room text is a placeholder; holding on the Learning panel");
    await step("show Learning", async () => page.getByRole("heading", { name: "Learning" }).scrollIntoViewIfNeeded());
  } else {
    await step("phone: a crew names the blue room", () => phoneSend(page, config.blueRoomCrew, config.phone.blueRoom));
    await until(148);
    await step("map it to unit 204", async () => {
      await page.getByRole("heading", { name: "Learning" }).scrollIntoViewIfNeeded();
      const item = page.locator("li", { has: page.getByRole("button", { name: "Remember this place" }) }).first();
      await item.locator("select").selectOption({ label: config.blueRoomPlace });
      await item.getByRole("button", { name: "Remember this place" }).click();
    });
    await until(154);
    await step("run again with what we learned", async () => {
      await page.getByRole("button", { name: "Run again with what we learned" }).click();
    });
    await until(158);
    await step("phone: same text, run 2", () => phoneSend(page, config.blueRoomCrew, config.phone.blueRoom));
  }
  await until(165);

  // 2:45-3:00 Numbers, close.
  await step("scroll to Measured", async () => page.getByRole("heading", { name: "Measured" }).scrollIntoViewIfNeeded());
  await until(config.totalSeconds);

  await context.close();
  await browser.close();
  const raw = await video.path();
  const name = `demo-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.webm`;
  await rename(raw, join(OUT, name));
  log("saved", join("video", "out", name));
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
