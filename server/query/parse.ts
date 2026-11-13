import { createHash } from "node:crypto";
import type { Element, LearningContext, Scene, Slot, TaskType, Trade } from "@site/contracts";
import { StructuredQuery, type Question } from "./schema";

// Owner: E. Question text -> StructuredQuery without an LLM: cache key, keyword fallback, and the
// guards every parse (LLM or not) goes through. Never guesses: unclear -> null.

/** lower case, trim, single spaces, no trailing [.!?,;:]. Same rule as the live chat cache ids. */
export function normalise(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.!?,;:]+$/, "").trim();
}

/** First 10 hex of sha256(normalised text + crewId). */
export function cacheKey(text: string, crewId?: string): string {
  return createHash("sha256")
    .update(normalise(text) + (crewId ?? ""))
    .digest("hex")
    .slice(0, 10);
}

// ---------- Days ----------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The day a question names, relative to when it was asked. Undefined when it names none. */
export function dayFrom(text: string, askedAt: string): string | undefined {
  const t = normalise(text);
  const today = askedAt.slice(0, 10);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso) return iso[1];
  if (/\b(tomorrow|tmrw|tmr|tomoro)\b/.test(t)) return addDays(today, 1);
  if (/\b(today|tonight|this morning|this afternoon)\b/.test(t)) return today;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  for (const [i, name] of WEEKDAYS.entries()) {
    const short = Object.entries(WEEKDAY_SHORT).filter(([, v]) => v === i).map(([k]) => k);
    const re = new RegExp(`\\b(${[name, ...short].join("|")})\\b`);
    if (re.test(t)) return addDays(today, (i - dow + 7) % 7);
  }
  return undefined;
}

/** "am"/"pm" only right after a day word or at the end ("tomorrow am", "sat pm"), so "what am i doing" is not a slot. */
const DAY_WORDS =
  "tomorrow|tmrw|tmr|tomoro|today|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday";
const AM = new RegExp(`\\b(${DAY_WORDS}) am\\b|\\bam$`);
const PM = new RegExp(`\\b(${DAY_WORDS}) pm\\b|\\bpm$`);

export function slotFrom(text: string): Slot | undefined {
  const t = normalise(text);
  if (/\b(all day|full day|whole day)\b/.test(t)) return "full_day";
  if (/\b(morning|first thing|\d{1,2} ?am)\b/.test(t) || AM.test(t)) return "morning";
  if (/\b(afternoon|after lunch|\d{1,2} ?pm)\b/.test(t) || PM.test(t)) return "afternoon";
  return undefined;
}

// ---------- Places and elements ----------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (t: string, phrase: string) => phrase.length > 0 && new RegExp(`(^|\\W)${escape(phrase)}($|\\W)`).test(t);

/** Nicknames for an element: its own aliases plus learned ones. Lower case. */
function nicknames(el: Element, ctx?: LearningContext): string[] {
  const learned = Object.entries(ctx?.locationAliases ?? {})
    .filter(([, id]) => id === el.id)
    .map(([alias]) => alias);
  return [...el.aliases, ...learned].map((a) => a.toLowerCase());
}

/** Rooms and zones the text names, by nickname, full name or unit number. */
export function placesIn(text: string, scene: Scene, ctx?: LearningContext): Element[] {
  const t = normalise(text);
  const places = scene.elements.filter((e) => e.type === "room" || e.type === "zone");
  return places.filter((p) => {
    if (nicknames(p, ctx).some((n) => has(t, n))) return true;
    if (has(t, p.name.toLowerCase())) return true;
    const num = /\b(\d{3})\b/.exec(p.name)?.[1];
    return num !== undefined && has(t, num) && p.type === "room";
  });
}

/** Non-place elements the text names, by id ("W-12", "w12"), nickname or full name. */
export function elementsIn(text: string, scene: Scene, ctx?: LearningContext): Element[] {
  const t = normalise(text);
  return scene.elements
    .filter((e) => e.type !== "room" && e.type !== "zone")
    .filter((e) => {
      const id = e.id.toLowerCase();
      if (has(t, id) || has(t, id.replace(/-/g, ""))) return true;
      if (nicknames(e, ctx).some((n) => has(t, n))) return true;
      return has(t, e.name.toLowerCase());
    });
}

// ---------- Elements by token overlap ----------

/**
 * How a crew names a wall: "the 204 east wall", "204 bthroom wall", "the blue room east wall".
 * Rule (deterministic, also in docs/decisions.md):
 * - Tokens: normalised words; synonyms folded (bath -> bathroom, hall -> corridor, walls -> wall);
 *   a place nickname in the question adds that unit's number ("the blue room" -> 204).
 * - An element's descriptor tokens come from its name and nicknames, minus filler words (unit, the, of ...).
 * - Candidate only if: every unit number in its descriptor is in the question; every direction in the
 *   question is in its descriptor (no contradiction); and the question names its kind ("wall", "door",
 *   "window"; for fixtures one of its own words, e.g. "tile").
 * - Score = descriptor tokens found in the question. Numbers and directions match exactly; other words
 *   of 5+ letters also match with one typo ("bthroom").
 * - Highest score wins only if exactly one element has it. Zero or a tie -> no match (never guess).
 * Exact id, full-name or nickname hits (elementsIn) win before any of this.
 */
const DIRECTIONS = new Set(["east", "west", "north", "south"]);
const FILLER = new Set(["unit", "the", "a", "an", "of", "in", "on", "at", "to", "and", "level", "s"]);
const SYNONYMS: Record<string, string> = {
  bath: "bathroom",
  baths: "bathroom",
  bathrooms: "bathroom",
  washroom: "bathroom",
  hall: "corridor",
  hallway: "corridor",
  walls: "wall",
  doors: "door",
  windows: "window",
  tiles: "tile",
};
const KIND_WORD: Partial<Record<Element["type"], string>> = { wall: "wall", door: "door", window: "window" };

export function tokens(text: string): string[] {
  return normalise(text)
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => SYNONYMS[w] ?? w);
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const isNumber = (w: string) => /^\d+$/.test(w);

/** Is descriptor token `d` in the question? Numbers and directions exact; words of 5+ letters allow one typo. */
function present(d: string, q: Set<string>): boolean {
  if (q.has(d)) return true;
  if (isNumber(d) || DIRECTIONS.has(d) || d.length < 5) return false;
  for (const w of q) if (w.length >= 4 && !isNumber(w) && withinOneEdit(w, d)) return true;
  return false;
}

/** Non-place elements the question names: exact hits first, else the token rule above. */
export function matchElements(text: string, scene: Scene, ctx?: LearningContext): Element[] {
  const exact = elementsIn(text, scene, ctx);
  if (exact.length > 0) return exact;

  const unitNumbers = placesIn(text, scene, ctx).flatMap((p) => /\b(\d{3})\b/.exec(p.name)?.[1] ?? []);
  const q = new Set([...tokens(text), ...unitNumbers]);
  const qDirections = [...q].filter((w) => DIRECTIONS.has(w));

  const scored: { el: Element; score: number }[] = [];
  for (const el of scene.elements) {
    if (el.type === "room" || el.type === "zone") continue;
    const desc = [...new Set([el.name, ...nicknames(el, ctx)].flatMap(tokens).filter((w) => !FILLER.has(w)))];
    if (!desc.filter(isNumber).every((n) => q.has(n))) continue;
    if (!qDirections.every((d) => desc.includes(d))) continue;
    const kind = KIND_WORD[el.type];
    const content = desc.filter((w) => !isNumber(w) && !DIRECTIONS.has(w));
    if (kind ? !present(kind, q) : !content.some((w) => present(w, q))) continue;
    scored.push({ el, score: desc.filter((w) => present(w, q)).length });
  }
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((x) => x.score));
  return scored.filter((x) => x.score === best).map((x) => x.el);
}

// ---------- Task types ----------

const TASK_WORDS: [RegExp, TaskType | ((trade?: Trade) => TaskType | undefined)][] = [
  [/\b(rough[ -]?in|roughing|rough)\b/, (trade) => (trade === "electrical" ? "rough_in_electrical" : trade === "plumbing" ? "rough_in_plumbing" : undefined)],
  [/\b(pull(ing)? wire|wiring|cable)\b/, "rough_in_electrical"],
  [/\b(pipes?|piping)\b/, "rough_in_plumbing"],
  [/\b(close|closing|board(ing)?|hang(ing)? board|sheet(ing)?)\b/, "close_wall"],
  [/\b(tape|taping|mud|finish(ing)? drywall)\b/, "finish_drywall"],
  [/\b(paint|painting|prime|priming)\b/, "paint"],
  [/\b(tile|tiling)\b/, "tile"],
  [/\b(inspect|inspection)\b/, "inspection"],
  [/\b(layout|lay out|mark out)\b/, "layout"],
  [/\b(fixtures?|install(ing)? (the )?(vanity|toilet|sink))\b/, "install_fixtures"],
];

/** The crew's usual work, used when "can we start" names no task. Grounded in the crew's trade, not guessed. */
const TRADE_DEFAULT: Partial<Record<Trade, TaskType>> = {
  plumbing: "rough_in_plumbing",
  electrical: "rough_in_electrical",
  drywall: "close_wall",
  painting: "paint",
  tiling: "tile",
};

export function taskTypeFrom(text: string, trade?: Trade): TaskType | undefined {
  const t = normalise(text);
  for (const [re, val] of TASK_WORDS) {
    if (!re.test(t)) continue;
    const tt = typeof val === "function" ? val(trade) : val;
    if (tt) return tt;
  }
  return trade ? TRADE_DEFAULT[trade] : undefined;
}

// ---------- Guards ----------

/** Asking to change the design or choose something is a decision: always escalated, whatever the parser said. */
const DECISION =
  /\b(can|could|should|may) (we|i) (move|change|shift|swap|use a different|use another|skip|drop)\b|\b(which|what) (tile|colour|color|finish|fixture)s? (should|do) we\b|\b(approve|approved|decide|decided|decision|sign off|signed off|picked|chosen|selected)\b|\binstead of\b/;

export function isDecision(text: string): boolean {
  return DECISION.test(normalise(text));
}

/**
 * Checks a parsed query against the record: every id must exist, the crew on can_i_start is the
 * asker when known. Anything else -> null (not found), never a guess.
 */
export function guard(query: StructuredQuery | null, q: Question, scene: Scene): StructuredQuery | null {
  if (isDecision(q.text)) return { kind: "decision_needed", topic: q.text.trim() };
  if (!query) return null;
  const parsed = StructuredQuery.safeParse(query);
  if (!parsed.success) return null;
  const out = parsed.data;
  const el = (id: string | undefined) => id === undefined || scene.elements.some((e) => e.id === id);
  const crew = (id: string | undefined) => id === undefined || scene.crews.some((c) => c.id === id);
  switch (out.kind) {
    case "whats_planned":
      return el(out.placeId) && crew(out.crewId) ? out : null;
    case "where_is":
      return el(out.elementId) ? out : null;
    case "what_changed":
      return el(out.elementId) && el(out.placeId) && (out.elementId ?? out.placeId) !== undefined ? out : null;
    case "who_is_in":
      return el(out.placeId) ? out : null;
    case "can_i_start": {
      const crewId = q.crewId ?? out.crewId;
      return el(out.placeId) && crew(crewId) ? { ...out, crewId } : null;
    }
    case "decision_needed":
      return out;
  }
}

// ---------- Keyword fallback ----------

const START =
  /\b(can|could|ok to|okay to|good to|clear to|safe to) ?(we|i)? ?(start|go|begin|close|board|hang|tile|paint|rough|pull|tape|mud|lay out)\b|\bare we (good|clear|ok)\b/;
const WHERE = /\b(where is|where's|wheres|where did)\b/;
const CHANGED =
  /\b(what changed|what's changed|whats changed|what has changed|any ?changes?|anything (new|changed?)|did .{0,40}\bchange|has .{0,40}\bchanged|changes? (in|on|to))\b/;
const WHO = /\b(who is|who's|whos|anyone|anybody|who else)\b/;
const PLANNED = /\b(what's planned|whats planned|what is planned|what are we doing|what am i doing|plan for|what's on|whats on|schedule)\b/;

type Intent = "can_i_start" | "where_is" | "what_changed" | "who_is_in" | "whats_planned";

/** Which question pattern the text follows, in the order the parser tries them. */
export function intentOf(text: string): Intent | undefined {
  const t = normalise(text);
  if (START.test(t)) return "can_i_start";
  if (WHERE.test(t)) return "where_is";
  if (CHANGED.test(t)) return "what_changed";
  if (WHO.test(t)) return "who_is_in";
  if (PLANNED.test(t)) return "whats_planned";
  return undefined;
}

/**
 * Deterministic parse for cache misses in demo mode. Recognises a few plain patterns and
 * returns null for anything else.
 */
export function keywordParse(q: Question, scene: Scene, ctx?: LearningContext): StructuredQuery | null {
  const t = normalise(q.text);
  if (isDecision(t)) return { kind: "decision_needed", topic: q.text.trim() };

  const places = placesIn(t, scene, ctx);
  const place = places.length === 1 ? places[0] : undefined;
  const day = dayFrom(t, q.time);
  const slot = slotFrom(t);
  const crew = scene.crews.find((c) => c.id === q.crewId);

  switch (intentOf(t)) {
    case "can_i_start": {
      if (!place || !crew) return null;
      const taskType = taskTypeFrom(t, crew.trade);
      if (!taskType) return null;
      const planned = scene.tasks
        .filter((x) => x.crewId === crew.id && x.placeId === place.id && x.status === "planned" && x.day >= q.time.slice(0, 10))
        .sort((a, b) => a.day.localeCompare(b.day));
      const useDay = day ?? planned[0]?.day;
      if (!useDay) return null;
      const useSlot = slot ?? planned.find((x) => x.day === useDay)?.slot ?? "full_day";
      return { kind: "can_i_start", crewId: crew.id, taskType, placeId: place.id, day: useDay, slot: useSlot };
    }
    case "where_is": {
      const elements = matchElements(t, scene, ctx);
      return elements.length === 1 ? { kind: "where_is", elementId: elements[0].id } : null;
    }
    case "what_changed": {
      const elements = matchElements(t, scene, ctx);
      if (elements.length === 1) return { kind: "what_changed", elementId: elements[0].id };
      if (place) return { kind: "what_changed", placeId: place.id };
      return null;
    }
    case "who_is_in":
      if (!place || !day) return null;
      return { kind: "who_is_in", placeId: place.id, day, ...(slot ? { slot } : {}) };
    case "whats_planned":
      if (places.length > 1) return null;
      return {
        kind: "whats_planned",
        ...(place ? { placeId: place.id } : {}),
        ...(day ? { day } : {}),
        ...(!place && crew ? { crewId: crew.id } : {}),
      };
    default:
      return null;
  }
}

// ---------- Why a question was not understood ----------

const INTENT_WORDS: Record<Intent, string> = {
  can_i_start: "whether you can start",
  where_is: "where something is",
  what_changed: "what changed",
  who_is_in: "who is on site",
  whats_planned: "what is planned",
};

const names = (els: Element[]) => els.map((e) => e.name).join(", ");

/**
 * For a question no parse could answer: what was understood and what was missing, in one sentence,
 * so the crew can re-ask. Names only things found in the record; never fills in the missing part.
 */
export function diagnose(q: Question, scene: Scene, ctx?: LearningContext): { text: string; reason: string } {
  const t = normalise(q.text);
  const intent = intentOf(t);
  const places = placesIn(t, scene, ctx);
  const crew = scene.crews.find((c) => c.id === q.crewId);
  const kindWord = tokens(t).find((w) => w === "wall" || w === "door" || w === "window") ?? "element";
  const several = places.length > 1 ? "which one of those places" : undefined;

  let missing: string | undefined;
  switch (intent) {
    case "where_is": {
      const els = matchElements(t, scene, ctx);
      missing = els.length > 1 ? `which one (${names(els)} all match)` : `which ${kindWord}`;
      break;
    }
    case "what_changed": {
      const els = matchElements(t, scene, ctx);
      missing = els.length > 1 ? `which one (${names(els)} all match)` : (several ?? "which place or element");
      break;
    }
    case "can_i_start":
      if (!crew) missing = "which crew you are";
      else if (places.length === 0) missing = "where";
      else if (several) missing = several;
      else if (!taskTypeFrom(t, crew.trade)) missing = "what work";
      else missing = "which day";
      break;
    case "who_is_in":
      missing = places.length === 0 ? "where" : (several ?? "which day");
      break;
    case "whats_planned":
      missing = several;
      break;
  }

  const found =
    places.length > 0 ? `I found ${places.map((p) => p.name).join(" and ")}` : intent ? `I understood you are asking ${INTENT_WORDS[intent]}` : undefined;
  if (!found || !missing) {
    return { text: "I could not tell what you asked; forwarded to the superintendent.", reason: "question not understood" };
  }
  return { text: `${found} but not ${missing}; forwarded to the superintendent.`, reason: `not understood: missing ${missing}` };
}
