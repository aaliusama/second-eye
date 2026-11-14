import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { Correction, type LearningContext, type Scene } from "@site/contracts";
import { logLine } from "../log";
import { REPO_ROOT } from "../paths";

// Owner: A. Stored corrections and how they change the next run.
// In memory by default; npm run demo starts from a clean store.
// Opt-in: LEARNING_FILE=<path> loads the store at startup and writes it after every change.

export { placesNamed, resolvePlaces, type Resolved, type Unresolved } from "./resolve";

const corrections: Correction[] = [];
/** Where the store is persisted, or undefined: in memory only, no file I/O. */
let file: string | undefined;

const StoreFile = Correction.array();

/** Goes up on every change to the store, so caches of replays (api/state-at.ts) know when they are stale. */
let storeVersion = 0;

/** Store version: same version, same corrections. */
export function version(): number {
  return storeVersion;
}

/**
 * Persistence from LEARNING_FILE (a relative path resolves against the repo root).
 * Unset or empty: in memory only. Set: the store is replaced by the file's corrections;
 * a missing file starts empty, a corrupt or invalid one logs one JSON line and starts empty.
 */
export function usePersistence(path: string | undefined): void {
  storeVersion++;
  corrections.length = 0;
  file = path ? (isAbsolute(path) ? path : join(REPO_ROOT, path)) : undefined;
  if (!file) return;
  try {
    const parsed = StoreFile.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) throw new Error(`invalid corrections: ${parsed.error.message}`);
    corrections.push(...parsed.data);
    logLine({ kind: "learning.loaded", file, corrections: corrections.length });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    logLine({ kind: "learning.load_error", file, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Atomic write: temp file + rename. A failed write is logged, never thrown. */
function save(): void {
  if (!file) return;
  const tmp = `${file}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, JSON.stringify(corrections, null, 2) + "\n");
    renameSync(tmp, file);
  } catch (e) {
    logLine({ kind: "learning.save_error", file, error: e instanceof Error ? e.message : String(e) });
  }
}

export function record(correction: Correction): void {
  corrections.push(Correction.parse(correction));
  storeVersion++;
  save();
}

/**
 * Removes every stored correction with this id (undo). Returns the removed ones, oldest first;
 * empty when the id is not stored (nothing changes, the version stays).
 */
export function remove(id: string): Correction[] {
  const removed = corrections.filter((c) => c.id === id);
  if (removed.length === 0) return [];
  const kept = corrections.filter((c) => c.id !== id);
  corrections.length = 0;
  corrections.push(...kept);
  storeVersion++;
  save();
  return removed;
}

/** Clears the store, and deletes the file when persistence is on. */
export function reset(): void {
  storeVersion++;
  corrections.length = 0;
  if (!file) return;
  try {
    rmSync(file, { force: true });
  } catch (e) {
    logLine({ kind: "learning.save_error", file, error: e instanceof Error ? e.message : String(e) });
  }
}

export function all(): Correction[] {
  return [...corrections];
}

/** What extraction and checks see from past corrections. */
export function getContext(): LearningContext {
  const ctx: LearningContext = { locationAliases: {}, crewNotes: {} };
  for (const c of corrections) {
    if (c.kind === "location_alias") ctx.locationAliases[c.alias.toLowerCase()] = c.elementId;
    if (c.kind === "crew_misread") (ctx.crewNotes[c.crewId] ??= []).push(c.note);
  }
  return ctx;
}

/**
 * The start scene for the next run, with stored nicknames added to element aliases.
 * Pure: returns a new scene, never mutates the input. Lower-case compare, no duplicates,
 * corrections for unknown element ids are skipped.
 */
export function applyToScene(scene: Scene): Scene {
  const add = new Map<string, string[]>();
  for (const c of corrections) {
    if (c.kind !== "location_alias") continue;
    const alias = c.alias.trim().toLowerCase();
    if (!alias) continue;
    const list = add.get(c.elementId) ?? [];
    list.push(alias);
    add.set(c.elementId, list);
  }
  if (add.size === 0) return scene;
  return {
    ...scene,
    elements: scene.elements.map((el) => {
      const extra = add.get(el.id);
      if (!extra) return el;
      const seen = new Set(el.aliases.map((a) => a.toLowerCase()));
      const aliases = [...el.aliases];
      for (const a of extra) {
        if (seen.has(a)) continue;
        seen.add(a);
        aliases.push(a);
      }
      return aliases.length === el.aliases.length ? el : { ...el, aliases };
    }),
  };
}
