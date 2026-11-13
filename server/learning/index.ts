import { Correction, type LearningContext, type Scene } from "@site/contracts";

// Owner: A. Stored corrections and how they change the next run.
// In memory for now; npm run demo starts from a clean store.

export { placesNamed, resolvePlaces, type Resolved, type Unresolved } from "./resolve";

const corrections: Correction[] = [];

export function record(correction: Correction): void {
  corrections.push(Correction.parse(correction));
}

export function reset(): void {
  corrections.length = 0;
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
