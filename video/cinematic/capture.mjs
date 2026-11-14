// Captures the stills the film is cut from, by driving the real app through its presenter mode
// (?present=1): the same key presses a presenter makes, one still per beat. Nothing is drawn by hand.
// It starts nothing: run the app first (npm run demo), or point DEMO_URL at another copy.
//
//   node capture.mjs            -> public/shots/*.png (3200x1800)
//
// Uses the Chrome DevTools Protocol directly (Node 22 WebSocket), so there is no browser download.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "public", "shots");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.DEMO_URL ?? "http://localhost:5173";
const BROWSER = process.env.BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SIZE = { width: 1600, height: 900 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + (process.pid % 400);
const browser = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "film-"))}`, `--window-size=${SIZE.width},${SIZE.height}`, "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
  if (d.method === "Runtime.exceptionThrown") problems.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

const key = async (k, code, vk) => {
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, text: type === "keyDown" && k.length === 1 ? k : undefined });
};
const click = async (text) => {
  const ok = await ev(`(() => { const all = [...document.querySelectorAll('button,[role=tab],a,summary')]; const el = all.find(e => e.textContent.trim() === ${JSON.stringify(text)}) ?? all.find(e => e.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
  if (!ok) problems.push(`control not found: ${text}`);
  await sleep(500);
};
const bar = () => ev(`document.querySelector('nav.presenter .meta')?.textContent ?? ''`);
const idle = async () => {
  for (let i = 0; i < 80; i++) {
    if (!/^Working/.test(await bar())) return;
    await sleep(250);
  }
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64"));
  console.log("shot", name);
};
// The presenter's own step bar is a tool for the person presenting, not part of the product: keep it out of the stills.
const hideBar = () => ev(`(() => { const s = document.createElement('style'); s.textContent = 'nav.presenter{visibility:hidden!important}'; document.head.appendChild(s); })()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { ...SIZE, deviceScaleFactor: 2, mobile: false });

// 1. The everyday page, as it opens.
await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keepLearning: false }) }).catch(() => undefined);
await send("Page.navigate", { url: `${BASE}/?present=1` });
await sleep(4000);
await hideBar();

// 2. The presenter's beats, in order. R starts clean (beat 1), the right arrow advances.
const BEATS = ["clean", "build", "ghost", "why", "decided", "rehearse", "fix", "confirm", "ask", "learn", "run2", "numbers"];
for (const [i, beat] of BEATS.entries()) {
  if (i === 0) await key("r", "KeyR", 82);
  else await key("ArrowRight", "ArrowRight", 39);
  await sleep(600);
  await idle();
  await sleep(beat === "ghost" ? 4500 : 3000);
  const note = await bar();
  if (/Failed|not set/.test(note)) problems.push(`${beat}: ${note}`);
  await shot(`beat-${beat}`);
  if (beat === "ghost") {
    // The same moment three ways, and in 3D.
    await click("Earlier position");
    await shot("ghost-earlier");
    await click("Latest record");
    await shot("ghost-latest");
    await click("Compare");
    await click("3D");
    await sleep(7000);
    await shot("ghost-3d");
    await click("Flat");
    await sleep(1500);
  }
}

// 3. The everyday page after a clean start: the whole floor with the first thing to settle.
await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keepLearning: false }) }).catch(() => undefined);
await send("Page.navigate", { url: `${BASE}/` });
await sleep(4500);
await shot("open");
await click("Show me");
await sleep(3500);
await shot("open-204");

ws.close();
browser.kill();
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no problems detected");
process.exit(problems.length ? 1 : 0);
