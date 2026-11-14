import { describe, expect, it } from "vitest";
import type { Element, Geometry, Plan, PlanTask, Point, Scene } from "@site/contracts";
import { fixtureIntent, fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import { HOLD_FROM_M, MIN_OVERLAP_M2, OVERLAP_RULE, TASK_GEOMETRY } from "./geometry-rules";
import { runChecks } from "./index";
import { measureClearance, measureOverlap, workZone } from "./measure";

// Owner: B. Measured clearance (latest_change) and work zone overlap (space_clash).

const seg = (x0: number, y0: number, x1: number, y1: number, thickness = 0.12): Geometry => ({
  kind: "segment",
  from: [x0, y0],
  to: [x1, y1],
  thickness,
});
const room = (x0: number, y0: number, x1: number, y1: number): Geometry => ({
  kind: "polygon",
  points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Point[],
});
const ROOM_204 = room(15, 2, 20, 10);
const base = { name: "Unit 204 bathroom east wall", crewName: "Novak Plumbing", taskType: "rough_in_plumbing" as const };
const DAY = "2026-11-14";
const planOf = (scene: Scene): Plan => ({ day: DAY, tasks: scene.tasks.filter((t) => t.day === DAY) });
const task = (over: Partial<PlanTask>): PlanTask => ({ ...fixtureTask, elementIds: [], ...over });

describe("rules file", () => {
  it("every task type has a clearance, a tolerance and a reason", () => {
    for (const [type, g] of Object.entries(TASK_GEOMETRY)) {
      expect(g.clearanceM, type).toBeGreaterThan(0);
      expect(g.toleranceM, type).toBeGreaterThan(0);
      expect(g.toleranceM, type).toBeLessThan(HOLD_FROM_M);
      expect(g.why.length, type).toBeGreaterThan(10);
    }
    expect(MIN_OVERLAP_M2).toBeGreaterThan(0);
  });
});

describe("measureClearance", () => {
  it("ghost wall: work on the bathroom (west) face, the record moved it 0.4 m east: a 0.40 m gap, hold", () => {
    const m = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.4, 2, 18.4, 5), place: ROOM_204 })!;
    expect(m.severity).toBe("hold");
    expect(m.clearance).toEqual({
      believedFace: [[17.94, 2], [17.94, 5]],
      recordedFace: [[18.34, 2], [18.34, 5]],
      offsetM: 0.4,
      direction: "east",
      requiredM: 0.6,
      outcome: "gap",
      workZone: { kind: "polygon", points: [[17.94, 2], [17.94, 5], [17.34, 5], [17.34, 2]] },
      text: expect.stringMatching(/^Per the record, the west face of Unit 204 bathroom east wall is 0\.40 m east of where Novak Plumbing believes it: .*0\.40 m gap/),
    });
    expect(m.clause).toBe("leave a 0.40 m gap at the west face (tolerance 13 mm)");
  });

  it("moved into the work side: inside_new_wall", () => {
    const m = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(17.75, 2, 17.75, 5), place: ROOM_204 })!;
    expect(m.clearance.outcome).toBe("inside_new_wall");
    expect(m.clearance.offsetM).toBe(0.25);
    expect(m.clearance.direction).toBe("west");
    expect(m.severity).toBe("hold");
  });

  it("from/to order of the recorded wall does not change the face", () => {
    const a = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.4, 2, 18.4, 5), place: ROOM_204 })!;
    const b = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.4, 5, 18.4, 2), place: ROOM_204 })!;
    expect(b.clearance.offsetM).toBe(a.clearance.offsetM);
    expect(b.clearance.outcome).toBe(a.clearance.outcome);
  });

  it("severity from the distance: within tolerance and under HOLD_FROM_M are warns", () => {
    const within = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.01, 2, 18.01, 5), place: ROOM_204 })!;
    expect(within.clearance.outcome).toBe("within_tolerance");
    expect(within.severity).toBe("warn");
    const small = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.03, 2, 18.03, 5), place: ROOM_204 })!;
    expect(small.clearance.outcome).toBe("gap");
    expect(small.severity).toBe("warn");
    const big = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.05, 2, 18.05, 5), place: ROOM_204 })!;
    expect(big.severity).toBe("hold");
  });

  it("thicker wall per the record moves both faces by half the change", () => {
    const m = measureClearance({ ...base, believed: seg(18, 2, 18, 5, 0.12), recorded: seg(18, 2, 18, 5, 0.32), place: ROOM_204 })!;
    expect(m.clearance.offsetM).toBe(0.1);
    expect(m.clearance.outcome).toBe("inside_new_wall");
  });

  it("rotated wall: the larger end offset counts", () => {
    const m = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18, 2, 18.3, 5), place: ROOM_204 })!;
    expect(m.clearance.offsetM).toBeCloseTo(0.3, 2);
  });

  it("no place: both faces measured, on a tie the worse (inside) face, and the text says the side is not on record", () => {
    const m = measureClearance({ ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.4, 2, 18.4, 5) })!;
    expect(m.clearance.outcome).toBe("inside_new_wall");
    expect(m.clearance.believedFace).toEqual([[18.06, 2], [18.06, 5]]);
    expect(m.clearance.text).toContain("not on record");
  });

  it("not a wall, or a zero-length wall: no measure", () => {
    expect(measureClearance({ ...base, believed: { kind: "point", at: [1, 1] }, recorded: { kind: "point", at: [2, 1] } })).toBeUndefined();
    expect(measureClearance({ ...base, believed: seg(18, 2, 18, 2), recorded: seg(18.4, 2, 18.4, 5) })).toBeUndefined();
  });

  it("is pure", () => {
    const input = { ...base, believed: seg(18, 2, 18, 5), recorded: seg(18.4, 2, 18.4, 5), place: ROOM_204 };
    const before = JSON.stringify(input);
    expect(measureClearance(input)).toEqual(measureClearance(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("workZone and measureOverlap", () => {
  const els = fixtureScene.elements;
  const crews = fixtureScene.crews;

  it("no named element: the whole place", () => {
    const z = workZone(els, crews, { crewId: "crew-drywall", taskType: "layout", placeId: "room-204", elementIds: [] })!;
    expect(z.described).toBe("all of Unit 204");
    expect(z.points).toEqual(ROOM_204.kind === "polygon" ? ROOM_204.points : []);
  });

  it("a named wall: a strip on the room side of the face the crew believes in", () => {
    const z = workZone(els, crews, { crewId: "crew-plumbing", taskType: "rough_in_plumbing", placeId: "room-204", elementIds: ["W-12"] })!;
    expect(z.described).toBe("a 0.60 m strip along Unit 204 bathroom east wall");
    // Plumbing has not heard the move: the strip is along the old west face (x = 17.94).
    const xs = z.points.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(17.34);
    expect(Math.max(...xs)).toBeCloseTo(17.94);
  });

  it("unknown place: undefined", () => {
    expect(workZone(els, crews, { crewId: "crew-plumbing", taskType: "layout", placeId: "nowhere", elementIds: [] })).toBeUndefined();
    expect(workZone(els, crews, { crewId: "crew-plumbing", taskType: "layout", elementIds: [] })).toBeUndefined();
  });

  it("overlap: strip inside the room gives the strip area; under the minimum: none", () => {
    const strip = workZone(els, crews, { crewId: "crew-plumbing", taskType: "rough_in_plumbing", placeId: "room-204", elementIds: ["W-12"] })!;
    const whole = workZone(els, crews, { crewId: "crew-drywall", taskType: "layout", placeId: "room-204", elementIds: [] })!;
    const o = measureOverlap(
      { crewId: "crew-plumbing", crewName: "Novak Plumbing", taskId: "t1", zone: strip },
      { crewId: "crew-drywall", crewName: "Walsh Drywall", taskId: "t2", zone: whole },
      "on 2026-11-14",
    )!;
    expect(o.areaM2).toBe(1.8);
    expect(o.zones.map((z) => z.taskId)).toEqual(["t1", "t2"]);
    expect(o.text).toMatch(/^Per the record, Novak Plumbing's work zone \(a 0\.60 m strip along .*\) and Walsh Drywall's \(all of Unit 204\) overlap by 1\.80 m² on 2026-11-14\.$/);
    const tiny = { points: [[15, 2], [15.4, 2], [15.4, 2.4], [15, 2.4]] as Point[], described: "tiny" };
    expect(measureOverlap({ crewId: "a", crewName: "A", taskId: "t1", zone: tiny }, { crewId: "b", crewName: "B", taskId: "t2", zone: whole }, "")).toBeUndefined();
  });
});

describe("space_clash, measured (through runChecks)", () => {
  it("live and rehearsal carry the overlap, the numbers in the summary and the overlap rule", () => {
    const scene = structuredClone(fixtureScene);
    scene.tasks.push(task({ id: "task-002", crewId: "crew-drywall", slot: "full_day", taskType: "layout", sourceMessageId: "m-010" }));
    const live = runChecks(scene, planOf(scene), fixtureIntent).find((f) => f.check === "space_clash")!;
    expect(live.measure?.overlap?.areaM2).toBe(1.8);
    expect(live.summary).toContain("their work zones overlap by 1.80 m²");
    expect(live.rule).toEqual(OVERLAP_RULE);
    const reh = runChecks(scene, planOf(scene)).find((f) => f.check === "space_clash")!;
    expect(reh.measure?.overlap?.areaM2).toBe(1.8);
    expect(reh.measure?.overlap?.zones.map((z) => z.crewId)).toEqual(["crew-plumbing", "crew-drywall"]);
  });

  it("same room, strips along two far-apart walls: no clash", () => {
    const scene = structuredClone(fixtureScene);
    const w11: Element = {
      id: "W-11",
      type: "wall",
      name: "Unit 204 north wall",
      aliases: [],
      geometry: seg(15, 10, 20, 10, 0.2),
      state: "approved",
      version: 1,
      history: [{ version: 1, time: "2026-11-10T08:00:00", sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add", geometry: seg(15, 10, 20, 10, 0.2), confidence: 1 }],
    };
    scene.elements.push(w11);
    scene.tasks.push(task({ id: "task-002", crewId: "crew-drywall", taskType: "paint", elementIds: ["W-11"], sourceMessageId: "m-010" }));
    expect(runChecks(scene, planOf(scene)).filter((f) => f.check === "space_clash")).toEqual([]);
    expect(runChecks(scene, planOf(scene), fixtureIntent).filter((f) => f.check === "space_clash")).toEqual([]);
  });

  it("neighbouring rooms share an edge only: no clash", () => {
    const scene = structuredClone(fixtureScene);
    scene.tasks.push(task({ id: "task-002", crewId: "crew-drywall", placeId: "room-203", sourceMessageId: "m-010" }));
    expect(runChecks(scene, planOf(scene)).filter((f) => f.check === "space_clash")).toEqual([]);
  });
});
