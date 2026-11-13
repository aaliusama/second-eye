import { describe, expect, it } from "vitest";
import { Finding as FindingSchema } from "@site/contracts";
import type { CrewIntent, Element, Plan, PlanTask, Scene } from "@site/contracts";
import { fixtureIntent, fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import { runChecks } from "./index";
import { rehearse } from "./rehearse";

// Owner: C. The planted incidents from the TEAM.md scenario sheet (2-4), plus the cases that
// would be false alarms. Small scenes built here from the contracts fixtures, not from data/.

const DAY = "2026-11-14"; // Saturday
const drawing = { time: "2026-11-10T08:00:00", sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add", confidence: 1 } as const;

const room = (id: string, name: string, x: number): Element => ({
  id,
  type: "room",
  name,
  aliases: [],
  geometry: { kind: "polygon", points: [[x, 2], [x + 5, 2], [x + 5, 10], [x, 10]] },
  state: "approved",
  version: 1,
  history: [{ ...drawing, version: 1, state: "approved" }],
});

const tileChoice = (state: "proposed" | "approved"): Element => ({
  id: "tile-205-bath",
  type: "fixture",
  name: "Unit 205 bathroom floor tile",
  aliases: [],
  geometry: { kind: "point", at: [22, 4] },
  state,
  version: 2,
  history: [
    { ...drawing, version: 1, geometry: { kind: "point", at: [22, 4] }, state: "planned" },
    { version: 2, time: "2026-11-12T10:00:00", sourceMessageId: "m-050", thread: "office", operationType: "set_status", state, confidence: 0.9 },
  ],
});

function scene(tasks: PlanTask[] = [], tile: "proposed" | "approved" = "proposed"): Scene {
  const s = structuredClone(fixtureScene);
  s.elements.push(room("room-205", "Unit 205", 20), room("room-206", "Unit 206", 25), tileChoice(tile));
  s.crews.push(
    { id: "crew-electrical", name: "Brandt Electric", trade: "electrical", letter: "E", threads: ["site-group"] },
    { id: "crew-painting", name: "Kovac Painting", trade: "painting", letter: "A", threads: ["site-group"] },
    { id: "crew-tiling", name: "Sorel Tiling", trade: "tiling", letter: "T", threads: ["site-group"] },
  );
  s.tasks = tasks;
  return s;
}

const task = (over: Partial<PlanTask> & Pick<PlanTask, "id" | "crewId" | "taskType" | "placeId" | "sourceMessageId">): PlanTask => ({
  ...fixtureTask,
  slot: "morning",
  order: 0,
  description: over.taskType.replace(/_/g, " "),
  elementIds: [],
  confidence: 0.9,
  ...over,
});

const intentFor = (t: PlanTask): CrewIntent => ({
  id: `intent-${t.id}`,
  crewId: t.crewId,
  time: "2026-11-13T18:00:00",
  sourceMessageId: t.sourceMessageId,
  confidence: t.confidence,
  day: t.day,
  slot: t.slot,
  taskType: t.taskType,
  description: t.description,
  placeId: t.placeId,
  elementIds: t.elementIds,
});

const planOf = (s: Scene): Plan => ({ day: DAY, tasks: s.tasks.filter((t) => t.day === DAY) });
const only = (s: Scene, check: string, intent?: CrewIntent) => runChecks(s, planOf(s), intent).filter((f) => f.check === check);

// (2) Electrical and painting both plan unit 206 on Saturday morning.
const elec = task({ id: "task-elec-206", crewId: "crew-electrical", taskType: "rough_in_electrical", placeId: "room-206", sourceMessageId: "m-060" });
const paint = task({ id: "task-paint-206", crewId: "crew-painting", taskType: "paint", placeId: "room-206", sourceMessageId: "m-061" });

// (3) Drywall closes the unit 203 wall before the plumbing inspection.
const close203 = task({ id: "task-close-203", crewId: "crew-drywall", taskType: "close_wall", placeId: "room-203", elementIds: ["W-08"], sourceMessageId: "m-070" });
const insp203 = task({ id: "task-insp-203", crewId: "crew-plumbing", taskType: "inspection", placeId: "room-203", slot: "afternoon", sourceMessageId: "m-071" });

// (4) Tiling plans to start the 205 bath while the tile choice is still proposed.
const tile205 = task({ id: "task-tile-205", crewId: "crew-tiling", taskType: "tile", placeId: "room-205", elementIds: ["tile-205-bath"], sourceMessageId: "m-080" });

describe("planted incident 2: space clash in unit 206", () => {
  it("live: the second crew to state its plan gets the clash", () => {
    const s = scene([elec, paint]);
    const f = only(s, "space_clash", intentFor(paint));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      trigger: "live",
      severity: "hold",
      sourceMessageId: "m-061",
      evidenceMessageIds: ["m-060"],
      crewIds: ["crew-electrical", "crew-painting"],
      elementIds: ["room-206"],
    });
    expect(f[0]!.summary).toMatch(/^Per the record, Kovac Painting and Brandt Electric .*Unit 206/);
    expect(FindingSchema.parse(f[0])).toEqual(f[0]);
  });

  it("rehearsal: one finding for the pair, shown in the morning frame", () => {
    const s = scene([elec, paint]);
    const f = only(s, "space_clash");
    expect(f).toHaveLength(1);
    expect(f[0]!.taskIds).toEqual(["task-elec-206", "task-paint-206"]);
    const r = rehearse(s, planOf(s));
    expect(r.frames.map((fr) => fr.time)).toEqual(["2026-11-14T07:00:00"]);
    expect(r.frames[0]!.findings.filter((x) => x.check === "space_clash")).toHaveLength(1);
  });

  it("full_day against an afternoon task still clashes", () => {
    const s = scene([{ ...elec, slot: "full_day" }, { ...paint, slot: "afternoon" }]);
    expect(only(s, "space_clash")).toHaveLength(1);
    expect(only(s, "space_clash", intentFor({ ...paint, slot: "afternoon" }))).toHaveLength(1);
  });
});

describe("planted incident 3: close wall in 203 before the plumbing inspection", () => {
  it("live and rehearsal: hold, with the inspection as evidence", () => {
    const s = scene([close203, insp203]);
    for (const f of [only(s, "order_of_work", intentFor(close203)), only(s, "order_of_work")]) {
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ severity: "hold", sourceMessageId: "m-070", evidenceMessageIds: ["m-071"] });
      expect(f[0]!.crewIds).toEqual(["crew-drywall", "crew-plumbing"]);
    }
  });

  it("no inspection on record at all: still a hold", () => {
    const f = only(scene([close203]), "order_of_work");
    expect(f).toHaveLength(1);
    expect(f[0]!.summary).toMatch(/no inspection on record/);
  });

  it("inspection done: no finding", () => {
    expect(only(scene([close203, { ...insp203, status: "done" }]), "order_of_work")).toEqual([]);
    expect(only(scene([close203, { ...insp203, status: "done" }]), "order_of_work", intentFor(close203))).toEqual([]);
  });

  it("inspection the day before: no finding", () => {
    expect(only(scene([close203, { ...insp203, day: "2026-11-13" }]), "order_of_work")).toEqual([]);
  });
});

describe("planted incident 4: tiling the 205 bath on an open tile decision", () => {
  it("proposed tile choice: hold, sourced to the proposal", () => {
    const s = scene([tile205], "proposed");
    for (const f of [only(s, "open_decision", intentFor(tile205)), only(s, "open_decision")]) {
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ severity: "hold", sourceMessageId: "m-080", evidenceMessageIds: ["m-050"], elementIds: ["tile-205-bath"] });
    }
  });

  it("approved tile choice: no finding", () => {
    const s = scene([tile205], "approved");
    expect(only(s, "open_decision")).toEqual([]);
    expect(only(s, "open_decision", intentFor(tile205))).toEqual([]);
  });
});

describe("false alarms that must not happen", () => {
  it("the same crew twice in one room is not a clash", () => {
    const s = scene([elec, { ...elec, id: "task-elec-206b", order: 1, sourceMessageId: "m-062" }]);
    expect(only(s, "space_clash")).toEqual([]);
    expect(only(s, "space_clash", intentFor(elec))).toEqual([]);
  });

  it("two crews in one room in different slots is not a clash", () => {
    const s = scene([elec, { ...paint, slot: "afternoon" }]);
    expect(only(s, "space_clash")).toEqual([]);
    expect(only(s, "space_clash", intentFor({ ...paint, slot: "afternoon" }))).toEqual([]);
  });

  it("two crews on different days is not a clash", () => {
    expect(only(scene([elec, { ...paint, day: "2026-11-15" }]), "space_clash")).toEqual([]);
  });

  it("an intent with no place does not crash and invents nothing", () => {
    const s = scene([elec]);
    const vague: CrewIntent = { ...intentFor(paint), placeId: undefined, elementIds: [] };
    expect(runChecks(s, planOf(s), vague)).toEqual([]);
  });

  it("an intent with no place and a close_wall task type does not invent an order finding", () => {
    const s = scene([]);
    const vague: CrewIntent = { ...intentFor(close203), placeId: undefined, elementIds: [] };
    expect(runChecks(s, planOf(s), vague)).toEqual([]);
  });

  it("a moved wall the crew heard in its own thread is not a latest change", () => {
    const s = scene([fixtureTask]);
    s.crews = s.crews.map((c) => (c.id === "crew-plumbing" ? { ...c, threads: ["site-group", "office"] } : c));
    expect(only(s, "latest_change", fixtureIntent)).toEqual([]);
    expect(only(s, "latest_change")).toEqual([]);
  });

  it("a moved wall the crew heard by direct message is not a latest change", () => {
    const s = scene([fixtureTask]);
    const w12 = s.elements.find((e) => e.id === "W-12")!;
    w12.history[1] = { ...w12.history[1]!, thread: "dm:crew-plumbing" };
    expect(only(s, "latest_change", fixtureIntent)).toEqual([]);
  });

  it("a crew that closes and then finishes the wall itself in one slot is not out of order", () => {
    const close = { ...close203, slot: "morning" as const, order: 0 };
    const finish = task({ id: "task-finish-203", crewId: "crew-drywall", taskType: "finish_drywall", placeId: "room-203", order: 1, sourceMessageId: "m-072" });
    const s = scene([{ ...insp203, slot: "morning", day: "2026-11-13" }, close, finish]);
    expect(only(s, "order_of_work")).toEqual([]);
    expect(only(s, "order_of_work", intentFor(finish))).toEqual([]);
    // Reversed order in the same slot is still flagged.
    const t = scene([{ ...insp203, day: "2026-11-13" }, { ...close, order: 2 }, finish]);
    expect(only(t, "order_of_work").map((f) => f.sourceMessageId)).toEqual(["m-072"]);
  });

  it("the full planted floor gives exactly the planted findings in rehearsal", () => {
    const s = scene([elec, paint, close203, insp203, tile205]);
    const got = runChecks(s, planOf(s)).map((f) => `${f.check}:${f.sourceMessageId}`);
    expect(got).toEqual(["open_decision:m-080", "order_of_work:m-070", "space_clash:m-060"]);
  });
});
