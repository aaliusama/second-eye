import { describe, expect, it } from "vitest";
import type { Element, PlanTask, Scene } from "@site/contracts";
import { fixtureMessages, fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import type { QueryState } from "./answer";
import { ask } from "./index";
import { cacheKey, diagnose, keywordParse, matchElements, slotFrom, tokens } from "./parse";
import type { Question } from "./schema";

// Lane J: how crews actually phrase questions. Simulated site data. Fixture floor with units 201-206,
// five crews, the W-12 ghost wall in 204, a second wall in 204, and the 205 tile choice still proposed.
const T = "2026-11-13T20:30:00";
const SAT = "2026-11-14";
const ctxBlue = { locationAliases: { "the blue room": "room-204" }, crewNotes: {} };

const drawing = (state: Element["state"]) => [
  { version: 1, time: "2026-11-10T08:00:00", sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add" as const, state, confidence: 1 },
];
const room = (n: number): Element => ({
  id: `room-${n}`,
  type: "room",
  name: `Unit ${n}`,
  aliases: [],
  geometry: { kind: "polygon", points: [[(n - 201) * 5, 2], [(n - 200) * 5, 2], [(n - 200) * 5, 10], [(n - 201) * 5, 10]] },
  state: "approved",
  version: 1,
  history: drawing("approved"),
});
const wall = (id: string, name: string, x: number): Element => ({
  id,
  type: "wall",
  name,
  aliases: [],
  geometry: { kind: "segment", from: [x, 2], to: [x, 5], thickness: 0.12 },
  state: "approved",
  version: 1,
  history: drawing("approved"),
});

function scene(): Scene {
  const s = structuredClone(fixtureScene);
  // Rooms 201-206 (203 and 204 come from the fixture; their blue-room alias is removed so it must be learned).
  s.elements = s.elements.map((e) => (e.id === "room-204" ? { ...e, aliases: [] } : e));
  for (const n of [201, 202, 205, 206]) s.elements.push(room(n));
  s.elements.push(wall("W-14", "Unit 204 kitchen west wall", 15.2));
  s.elements.push({
    ...wall("tile-205", "Unit 205 bath tile choice", 22),
    type: "fixture",
    geometry: { kind: "point", at: [22, 4] },
    state: "proposed",
    history: [{ version: 1, time: "2026-11-12T09:00:00", sourceMessageId: "m-010", thread: "office", operationType: "add", state: "proposed", confidence: 0.9 }],
  });
  s.crews.push(
    { id: "crew-electrical", name: "Berger Electric", trade: "electrical", letter: "E", threads: ["site-group"] },
    { id: "crew-painting", name: "Kraus Painting", trade: "painting", letter: "A", threads: ["site-group"] },
    { id: "crew-tiling", name: "Hofer Tiling", trade: "tiling", letter: "T", threads: ["site-group"] },
  );
  const task = (over: Partial<PlanTask>): PlanTask => ({ ...fixtureTask, ...over });
  s.tasks = [
    fixtureTask,
    task({ id: "t-dry-203", crewId: "crew-drywall", taskType: "close_wall", placeId: "room-203", elementIds: [], slot: "morning", sourceMessageId: "m-030" }),
  ];
  return s;
}

const q = (text: string, crewId = "crew-plumbing"): Question => ({ id: `q-${cacheKey(text, crewId)}`, time: T, text, crewId });
const parse = (text: string, crewId = "crew-plumbing", ctx?: typeof ctxBlue) => keywordParse(q(text, crewId), scene(), ctx);
const state = (): QueryState => ({ t: T, scene: scene(), findings: [], messages: fixtureMessages, fixes: [] });

describe("phrasings: walls by name", () => {
  it("D's request: 'where is the 204 east wall?' finds W-12", () => {
    expect(parse("where is the 204 east wall?")).toEqual({ kind: "where_is", elementId: "W-12" });
    expect(parse("where's the 204 east wall")).toEqual({ kind: "where_is", elementId: "W-12" });
    expect(parse("wheres the east wall in 204")).toEqual({ kind: "where_is", elementId: "W-12" });
  });

  it("uses the other words of the name: bathroom, kitchen, west", () => {
    expect(parse("where is the 204 bathroom wall")).toEqual({ kind: "where_is", elementId: "W-12" });
    expect(parse("where is the 204 bath wall now")).toEqual({ kind: "where_is", elementId: "W-12" });
    expect(parse("where is the 204 kitchen wall")).toEqual({ kind: "where_is", elementId: "W-14" });
    expect(parse("where is the west wall in 204")).toEqual({ kind: "where_is", elementId: "W-14" });
  });

  it("takes one typo in a long word", () => {
    expect(tokens("204 bthroom")).toEqual(["204", "bthroom"]);
    expect(parse("where is the 204 bthroom wall")).toEqual({ kind: "where_is", elementId: "W-12" });
  });

  it("never guesses: a tie, a wrong direction, a missing number or a missing 'wall' -> null", () => {
    // Two walls in 204 and nothing to tell them apart.
    expect(parse("where is the 204 wall")).toBeNull();
    // No north wall in 204 on record.
    expect(parse("where is the 204 north wall")).toBeNull();
    // No unit named.
    expect(parse("where is the east wall")).toBeNull();
    // A place, not an element.
    expect(parse("where is the 204 bath")).toBeNull();
    expect(matchElements("where is the 204 wall", scene()).map((e) => e.id).sort()).toEqual(["W-12", "W-14"]);
  });

  it("the blue room names 204 only after the nickname is learned", () => {
    expect(parse("where is the blue room east wall")).toBeNull();
    expect(parse("where is the blue room east wall", "crew-plumbing", ctxBlue)).toEqual({ kind: "where_is", elementId: "W-12" });
    expect(parse("can we start in the blue room tomorrow am", "crew-plumbing")).toBeNull();
    expect(parse("can we start in the blue room tomorrow am", "crew-plumbing", ctxBlue)).toMatchObject({ kind: "can_i_start", placeId: "room-204", day: SAT, slot: "morning" });
  });
});

describe("phrasings: the demo questions", () => {
  it("did anything change in 204?", () => {
    expect(parse("did anything change in 204?")).toEqual({ kind: "what_changed", placeId: "room-204" });
    expect(parse("has anything changed in 204")).toEqual({ kind: "what_changed", placeId: "room-204" });
    expect(parse("any changes to the 204 east wall")).toEqual({ kind: "what_changed", elementId: "W-12" });
  });

  it("who is in 206 sat morning", () => {
    expect(parse("who is in 206 sat morning", "crew-electrical")).toEqual({ kind: "who_is_in", placeId: "room-206", day: SAT, slot: "morning" });
  });

  it("can we start the 204 bath tomorrow am? (am after a day word is the morning)", () => {
    expect(slotFrom("tomorrow am")).toBe("morning");
    expect(slotFrom("sat pm")).toBe("afternoon");
    expect(slotFrom("what am i doing tomorrow")).toBeUndefined();
    expect(parse("can we start the 204 bath tomorrow am?")).toEqual({
      kind: "can_i_start",
      crewId: "crew-plumbing",
      taskType: "rough_in_plumbing",
      placeId: "room-204",
      day: SAT,
      slot: "morning",
    });
    expect(parse("can we start the 204 bthroom tomorrow am")).toMatchObject({ kind: "can_i_start", placeId: "room-204" });
  });

  it("can we close up 203 tomorrow (drywall)", () => {
    expect(parse("can we close up 203 tomorrow", "crew-drywall")).toEqual({
      kind: "can_i_start",
      crewId: "crew-drywall",
      taskType: "close_wall",
      placeId: "room-203",
      day: SAT,
      slot: "morning",
    });
  });

  it("is the 205 tile picked yet? -> a decision for the superintendent", async () => {
    expect(parse("is the 205 tile picked yet?", "crew-tiling")).toEqual({ kind: "decision_needed", topic: "is the 205 tile picked yet?" });
    const a = await ask(q("is the 205 tile picked yet?", "crew-tiling"), { state: state() });
    expect(a.kind).toBe("escalated");
    expect(a.text).toContain("Unit 205 bath tile choice (m-010)");
    expect(a.text).not.toMatch(/^(CLEAR|HOLD)/);
  });
});

describe("not found says what was understood and what was missing", () => {
  const why = (text: string, crewId = "crew-plumbing") => diagnose(q(text, crewId), scene()).text;

  it("names the place and the missing part", () => {
    expect(why("where is the 204 wall")).toBe(
      "I found Unit 204 but not which one (Unit 204 bathroom east wall, Unit 204 kitchen west wall all match); forwarded to the superintendent.",
    );
    expect(why("where is the 204 north wall")).toBe("I found Unit 204 but not which wall; forwarded to the superintendent.");
    expect(why("who is in 206")).toBe("I found Unit 206 but not which day; forwarded to the superintendent.");
    expect(why("can we start tomorrow")).toBe("I understood you are asking whether you can start but not where; forwarded to the superintendent.");
    expect(why("who is in 204 or 206 sat")).toBe("I found Unit 204 and Unit 206 but not which one of those places; forwarded to the superintendent.");
  });

  it("falls back to the plain text when nothing was understood", () => {
    expect(why("is the pizza here")).toBe("I could not tell what you asked; forwarded to the superintendent.");
  });

  it("ask() returns the explained not_found, forwarded, with no ids", async () => {
    const a = await ask(q("where is the 204 north wall"), { state: state() });
    expect(a).toMatchObject({
      kind: "not_found",
      text: "I found Unit 204 but not which wall; forwarded to the superintendent.",
      sourceMessageIds: [],
      elementIds: [],
      escalation: { to: "superintendent", reason: "not understood: missing which wall" },
      via: "none",
    });
  });

  it("an answered question is unchanged: the 204 east wall ghost", async () => {
    const a = await ask(q("where is the 204 east wall?"), { state: state() });
    expect(a.kind).toBe("answer");
    expect(a.elementIds).toContain("W-12");
  });
});
