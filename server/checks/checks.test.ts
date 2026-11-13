import { describe, expect, it } from "vitest";
import type { Element, Plan, PlanTask, Scene } from "@site/contracts";
import { fixtureFinding, fixtureIntent, fixtureScene, fixtureTask, W12_BEFORE } from "@site/contracts/fixtures";
import { runChecks } from "./index";
import { moveLabel } from "./geometry";

// Owner: C. Build each test from contracts/fixtures (fixtureScene, fixtureIntent, fixtureFinding).

const DAY = "2026-11-14";
const clone = (): Scene => structuredClone(fixtureScene);
const planOf = (scene: Scene): Plan => ({ day: DAY, tasks: scene.tasks.filter((t) => t.day === DAY) });
const task = (over: Partial<PlanTask>): PlanTask => ({ ...fixtureTask, elementIds: [], ...over });

describe("checks", () => {
  it("latest_change: plumbing intent on W-12 after the rev C move gives the ghost-wall finding", () => {
    const findings = runChecks(fixtureScene, planOf(fixtureScene), fixtureIntent);
    const f = findings.find((x) => x.check === "latest_change");
    expect(f).toBeDefined();
    const { id: _id, summary, ...rest } = f!;
    const { id: _fid, summary: _fs, ...expected } = fixtureFinding;
    expect(rest).toEqual(expected);
    expect(f!.ghost).toEqual({ elementId: "W-12", geometry: W12_BEFORE, label: "0.4 m east" });
    expect(f!.id).toBe("f-latest_change-m-002-W-12");
    expect(summary).toMatch(/per the record/i);
    expect(summary).toContain("Unit 204 bathroom east wall");
    expect(summary).toContain("Novak Plumbing");
    // The fixture has nothing else wrong.
    expect(findings).toHaveLength(1);
  });

  it("latest_change in rehearsal: the plan task gets the same ghost", () => {
    const findings = runChecks(fixtureScene, planOf(fixtureScene));
    expect(findings.map((f) => f.id)).toEqual(["f-latest_change-m-002-W-12"]);
    expect(findings[0].trigger).toBe("rehearsal");
    expect(findings[0].taskIds).toEqual(["task-001"]);
  });

  it("is deterministic and does not mutate the scene", () => {
    const before = JSON.stringify(fixtureScene);
    const a = runChecks(fixtureScene, planOf(fixtureScene), fixtureIntent);
    const b = runChecks(fixtureScene, planOf(fixtureScene), fixtureIntent);
    expect(a).toEqual(b);
    expect(JSON.stringify(fixtureScene)).toBe(before);
  });

  it("moveLabel: dominant axis and diagonal", () => {
    const seg = (x: number, y: number) => ({ kind: "segment" as const, from: [x, y] as [number, number], to: [x, y + 3] as [number, number], thickness: 0.12 });
    expect(moveLabel(seg(18, 2), seg(18.4, 2))).toBe("0.4 m east");
    expect(moveLabel(seg(18, 2), seg(17.75, 2))).toBe("0.3 m west");
    expect(moveLabel(seg(18, 2), seg(18.4, 2.3))).toBe("0.3 m north, 0.4 m east");
    expect(moveLabel(seg(18, 2), seg(18.02, 2))).toBe("same position, changed shape");
  });

  it("space_clash: two crews in the same place, day and slot", () => {
    const scene = clone();
    scene.tasks.push(
      task({ id: "task-002", crewId: "crew-drywall", slot: "full_day", taskType: "layout", sourceMessageId: "m-010" }),
    );
    // Live: plumbing intent clashes with drywall's full day in room-204.
    const live = runChecks(scene, planOf(scene), fixtureIntent).filter((f) => f.check === "space_clash");
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe("f-space_clash-m-002-task-002");
    expect(live[0].crewIds).toEqual(["crew-drywall", "crew-plumbing"]);
    expect(live[0].taskIds).toEqual(["task-001", "task-002"]);
    expect(live[0].evidenceMessageIds).toEqual(["m-010"]);
    expect(live[0].severity).toBe("hold");
    expect(live[0].summary).toMatch(/^Per the record, .*Walsh Drywall.*Unit 204/);

    // Rehearsal: one finding for the pair, not two.
    const reh = runChecks(scene, planOf(scene)).filter((f) => f.check === "space_clash");
    expect(reh.map((f) => f.id)).toEqual(["f-space_clash-m-002-task-002"]);

    // Morning vs afternoon do not clash; another place does not clash.
    scene.tasks[1] = { ...scene.tasks[1], slot: "afternoon" };
    expect(runChecks(scene, planOf(scene)).filter((f) => f.check === "space_clash")).toEqual([]);
    scene.tasks[1] = { ...scene.tasks[1], slot: "morning", placeId: "room-203" };
    expect(runChecks(scene, planOf(scene)).filter((f) => f.check === "space_clash")).toEqual([]);
  });

  it("order_of_work: close_wall before inspection", () => {
    const scene = clone();
    const close = task({ id: "task-close", crewId: "crew-drywall", slot: "morning", taskType: "close_wall", sourceMessageId: "m-020" });
    const insp = task({ id: "task-insp", crewId: "crew-plumbing", slot: "afternoon", taskType: "inspection", sourceMessageId: "m-021" });
    scene.tasks = [close, insp];
    const f = runChecks(scene, planOf(scene)).filter((x) => x.check === "order_of_work");
    expect(f).toHaveLength(1);
    expect(f[0].id).toBe("f-order_of_work-m-020-task-close");
    expect(f[0].evidenceMessageIds).toEqual(["m-021"]);
    expect(f[0].taskIds).toEqual(["task-close", "task-insp"]);
    expect(f[0].severity).toBe("hold");

    // No inspection at all: still a finding (inspection is mandatory).
    scene.tasks = [close];
    const none = runChecks(scene, planOf(scene)).filter((x) => x.check === "order_of_work");
    expect(none).toHaveLength(1);
    expect(none[0].summary).toMatch(/no inspection on record/);

    // Inspection done, or in an earlier slot: fine.
    scene.tasks = [close, { ...insp, status: "done" }];
    expect(runChecks(scene, planOf(scene)).filter((x) => x.check === "order_of_work")).toEqual([]);
    scene.tasks = [{ ...close, slot: "afternoon" }, { ...insp, slot: "morning" }];
    expect(runChecks(scene, planOf(scene)).filter((x) => x.check === "order_of_work")).toEqual([]);
  });

  it("order_of_work: tile only flags when rough-in exists and is later", () => {
    const scene = clone();
    const tile = task({ id: "task-tile", crewId: "crew-drywall", slot: "morning", taskType: "tile", sourceMessageId: "m-030" });
    scene.tasks = [tile];
    expect(runChecks(scene, planOf(scene)).filter((x) => x.check === "order_of_work")).toEqual([]);
    scene.tasks = [tile, task({ id: "task-rough", slot: "full_day", taskType: "rough_in_plumbing", sourceMessageId: "m-031" })];
    expect(runChecks(scene, planOf(scene)).filter((x) => x.check === "order_of_work").map((f) => f.id)).toEqual([
      "f-order_of_work-m-030-task-tile",
    ]);
  });

  it("open_decision: task depends on an element still proposed", () => {
    const scene = clone();
    const w08 = scene.elements.find((e) => e.id === "W-08") as Element;
    w08.state = "proposed";
    w08.version = 2;
    w08.history.push({ version: 2, time: "2026-11-13T09:00:00", sourceMessageId: "m-040", thread: "site-group", operationType: "set_status", state: "proposed", confidence: 0.9 });
    scene.tasks = [
      task({ id: "task-tile", crewId: "crew-drywall", placeId: "room-203", taskType: "tile", elementIds: ["W-08"], sourceMessageId: "m-041" }),
      task({ id: "task-paint", crewId: "crew-plumbing", placeId: "room-203", slot: "afternoon", taskType: "paint", elementIds: ["W-08"], sourceMessageId: "m-042" }),
    ];
    const f = runChecks(scene, planOf(scene)).filter((x) => x.check === "open_decision");
    expect(f.map((x) => [x.id, x.severity])).toEqual([
      ["f-open_decision-m-041-W-08", "hold"],
      ["f-open_decision-m-042-W-08", "warn"],
    ]);
    expect(f[0].evidenceMessageIds).toEqual(["m-040"]);
    expect(f[0].summary).toMatch(/^Per the record, Unit 203 corridor wall is still only proposed/);

    // A proposed room counts through placeId.
    const room = scene.elements.find((e) => e.id === "room-203") as Element;
    room.state = "proposed";
    const g = runChecks(scene, planOf(scene)).filter((x) => x.check === "open_decision");
    expect(g.map((x) => x.id)).toContain("f-open_decision-m-041-room-203");
  });

  it("no finding when the crew already heard the latest change", () => {
    const scene = clone();
    scene.crews = scene.crews.map((c) => (c.id === "crew-plumbing" ? { ...c, threads: ["site-group", "office"] } : c));
    expect(runChecks(scene, planOf(scene), fixtureIntent)).toEqual([]);
    expect(runChecks(scene, planOf(scene))).toEqual([]);

    // A direct message to the crew also counts as heard.
    const dm = clone();
    const w12 = dm.elements.find((e) => e.id === "W-12") as Element;
    w12.history[1] = { ...w12.history[1], thread: "dm:crew-plumbing" };
    expect(runChecks(dm, planOf(dm), fixtureIntent)).toEqual([]);
  });
});
