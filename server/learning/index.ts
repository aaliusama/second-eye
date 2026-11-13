import { Correction, type LearningContext } from "@site/contracts";

// Owner: A. Stored corrections and how they change the next run.
// In memory for now; npm run demo starts from a clean store.

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
