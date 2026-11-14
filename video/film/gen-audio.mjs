// Synthesises every sound in the film from code: an ambient score and four effects.
// No samples, no downloads, so there is nothing to license: the output is original work of this repo.
//
//   node gen-audio.mjs [seconds]
//
// Writes public/audio/{score,whoosh,tick,impact,resolve}.wav (48 kHz, 16-bit stereo).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "public", "audio");
const SR = 48000;

function wav(left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i])), r = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  return buf;
}

/** Deterministic noise so every render of the audio is identical. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

function normalize(l, r, peak) {
  let m = 0;
  for (let i = 0; i < l.length; i++) m = Math.max(m, Math.abs(l[i]), Math.abs(r[i]));
  const g = m ? peak / m : 1;
  for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; }
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Ambient score: slow chord pad over a low drone, a quiet felt-piano motif, long fades. */
function score(seconds) {
  const n = Math.floor(seconds * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  // D major colour, moving slowly: Dmaj9, Bm9, Gmaj7#11, A6sus. 8 s per chord.
  const chords = [
    [50, 57, 64, 66, 69, 76],
    [47, 54, 61, 62, 66, 73],
    [43, 50, 57, 61, 66, 69],
    [45, 52, 59, 62, 64, 71],
  ];
  const chordLen = 8;
  const noise = rng(7);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ci = Math.floor(t / chordLen);
    const local = t - ci * chordLen;
    let s = 0;
    for (const which of [ci, ci - 1]) {
      if (which < 0) continue;
      const ch = chords[which % chords.length];
      const age = t - which * chordLen; // seconds since this chord began
      // 3 s swell in, holds, 4 s release after the next chord starts (crossfaded voicings)
      const env = Math.min(1, age / 3) * (age > chordLen ? Math.max(0, 1 - (age - chordLen) / 4) : 1);
      if (env <= 0) continue;
      for (const [k, note] of ch.entries()) {
        const f = midi(note);
        const det = 1 + (k % 2 ? 0.0012 : -0.0009);
        const v = Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * det * t + k) * 0.4 + Math.sin(2 * Math.PI * f * 2 * t) * 0.08;
        s += v * env * (k === 0 ? 0.5 : 0.22);
      }
    }
    // Drone on D, very soft, breathing at 0.07 Hz.
    s += Math.sin(2 * Math.PI * midi(38) * t) * 0.35 * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.07 * t));
    // Air: lowpassed noise.
    lp += 0.02 * (noise() - lp);
    s += lp * 0.25;
    // Global fades: 3 s in, 6 s out.
    const fade = Math.min(1, t / 3) * Math.min(1, (seconds - t) / 6);
    const pan = 0.5 + 0.08 * Math.sin(2 * Math.PI * 0.05 * t);
    L[i] = s * fade * (1 - pan) * 2;
    R[i] = s * fade * pan * 2;
    void local;
  }
  // Felt-piano motif: one note every 2 s from the chord, decaying, panned slightly.
  for (let b = 2; b < seconds - 6; b += 2) {
    const ch = chords[Math.floor(b / chordLen) % chords.length];
    const note = ch[[3, 4, 5, 4][Math.floor(b / 2) % 4]] + 12;
    const f = midi(note);
    const start = Math.floor(b * SR);
    for (let j = 0; j < SR * 2.5 && start + j < n; j++) {
      const t = j / SR;
      const env = Math.exp(-t * 2.2) * Math.min(1, t / 0.006);
      const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 6)) * env * 0.16;
      L[start + j] += v * 0.6;
      R[start + j] += v * 0.4;
    }
  }
  normalize(L, R, 0.5);
  return [L, R];
}

/** Soft transition whoosh: filtered noise with a rising then falling band. */
function whoosh() {
  const n = Math.floor(1.1 * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const nz = rng(11);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.sin(Math.PI * Math.min(1, t / 1.1)) ** 2;
    const cut = 0.01 + 0.08 * env;
    a += cut * (nz() - a);
    b += cut * (a - b);
    const p = t / 1.1;
    L[i] = b * env * (1 - p);
    R[i] = b * env * p;
  }
  normalize(L, R, 0.35);
  return [L, R];
}

/** Interface tick: a short damped wooden click. */
function tick() {
  const n = Math.floor(0.12 * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const v = Math.sin(2 * Math.PI * 1850 * t) * Math.exp(-t * 90) + Math.sin(2 * Math.PI * 920 * t) * Math.exp(-t * 60) * 0.5;
    L[i] = R[i] = v;
  }
  normalize(L, R, 0.25);
  return [L, R];
}

/** Restrained low impact for the ghost reveal: a sub thump and a soft body. */
function impact() {
  const n = Math.floor(2.4 * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const nz = rng(3);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 30 * Math.exp(-t * 8);
    const sub = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) * Math.min(1, t / 0.004);
    lp += 0.03 * (nz() - lp);
    const body = lp * Math.exp(-t * 6) * 0.8;
    L[i] = sub + body;
    R[i] = sub + body * 0.9;
  }
  normalize(L, R, 0.55);
  return [L, R];
}

/** Resolve: a soft rising fifth for confirmation and the final card. */
function resolve() {
  const n = Math.floor(3 * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const [k, note] of [74, 81, 86].entries()) {
    const f = midi(note), start = Math.floor(k * 0.09 * SR);
    for (let j = 0; start + j < n; j++) {
      const t = j / SR;
      const env = Math.exp(-t * 1.6) * Math.min(1, t / 0.01);
      const v = (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 5)) * env;
      L[start + j] += v * (k === 1 ? 0.4 : 0.6);
      R[start + j] += v * (k === 1 ? 0.6 : 0.4);
    }
  }
  normalize(L, R, 0.3);
  return [L, R];
}

const seconds = Number(process.argv[2] ?? 150);
await mkdir(OUT, { recursive: true });
for (const [name, gen] of Object.entries({ score: () => score(seconds), whoosh, tick, impact, resolve })) {
  const [l, r] = gen();
  await writeFile(join(OUT, `${name}.wav`), wav(l, r));
  console.log(name, (l.length / SR).toFixed(2), "s");
}
