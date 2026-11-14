import { describe, expect, it } from "vitest";
import { PlanGraph as PlanGraphSchema, Rehearsal as RehearsalSchema } from "@site/contracts";
import type { Plan, PlanTask, Scene } from "@site/contracts";
import { fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import { finishesBefore, planGraph } from "./graph";
import { runChecks } from "./index";
import { rehearse } from "./rehearse";
import { PREREQUISITES, PREREQUISITE_RULES } from "./rules";

// Owner: C. Tomorrow's plan as a dependency graph. Small scenes on the contracts fixture floor (room-203, room-204).

const SAT = "2026-11-14";
const FRI = "2026-11-13";

const task = (over: Partial<PlanTask> & Pick<PlanTask, "id" | "taskType">): PlanTask => ({
  ...fixtureTask,
  day: SAT,
  slot: "morning",
  placeId: "room-204",
  elementIds: [],
  sourceMessageId: `m-${over.id}`,
  confidence: 0.9,
  ...over,
});

function setup(tasks: PlanTask[], day = SAT): { scene: Scene; plan: Plan } {
  const scene = { ...structuredClone(fixtureScene), tasks };
  return { scene, plan: { day, tasks: tasks.filter((t) => t.day === day && t.status !== "cancelled") } };
}

const graphOf = (tasks: PlanTask[], day = SAT) => {
  const { scene, plan } = setup(tasks, day);
  const g = planGraph(scene, plan);
  expect(PlanGraphSchema.parse(g)).toEqual(g);
  return g;
};

const edgeList = (tasks: PlanTask[], day = SAT) =>
  graphOf(tasks, day).edges.map((e) => `${e.from}>${e.to}${e.violated ? " !" : ""}`);

describe("prerequisite table", () => {
  it("keeps the order-of-work rules and adds only graph-only edges", () => {
    expect(Object.fromEntries(Object.entries(PREREQUISITES).map(([k, r]) => [k, [r!.before, r!.mandatory]]))).toEqual({
      close_wall: ["inspection", true],
      finish_drywall: ["close_wall", false],
      paint: ["finish_drywall", false],
      tile: ["rough_in_plumbing", false],
    });
    expect(PREREQUISITE_RULES.filter((r) => !r.findings).map((r) => `${r.before}>${r.after}`)).toEqual([
      "rough_in_plumbing>inspection",
      "rough_in_electrical>inspection",
    ]);
  });
});

describe("planGraph edges", () => {
  it("full chain over two days: rough-in, inspection, close wall, finish, paint", () => {
    const tasks = [
      task({ id: "t1", day: FRI, slot: "morning", crewId: "crew-plumbing", taskType: "rough_in_plumbing" }),
      task({ id: "t2", day: FRI, slot: "afternoon", crewId: "crew-plumbing", taskType: "inspection" }),
      task({ id: "t3", slot: "morning", crewId: "crew-drywall", taskType: "close_wall" }),
      task({ id: "t4", slot: "afternoon", crewId: "crew-drywall", taskType: "finish_drywall" }),
      task({ id: "t5", day: "2026-11-15", crewId: "crew-painting", taskType: "paint" }),
    ];
    const g = graphOf(tasks);
    // Saturday's tasks plus the Friday tasks they wait on; Sunday's paint is not a Saturday task nor a prerequisite.
    expect(g.taskIds).toEqual(["t1", "t2", "t3", "t4"]);
    expect(g.edges).toEqual([
      { from: "t1", to: "t2", placeId: "room-204", reason: "inspection needs the same crew's rough in plumbing first", violated: false },
      { from: "t2", to: "t3", placeId: "room-204", reason: "close wall needs the inspection first", violated: false },
      { from: "t3", to: "t4", placeId: "room-204", reason: "finish drywall needs the close wall first", violated: false },
    ]);
    expect(g.criticalPath).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("same slot, or a full_day prerequisite before an afternoon task, is a violated edge; morning then afternoon is not", () => {
    expect(edgeList([task({ id: "a", taskType: "inspection" }), task({ id: "b", crewId: "crew-drywall", taskType: "close_wall" })])).toEqual(["a>b !"]);
    expect(
      edgeList([task({ id: "a", slot: "full_day", taskType: "inspection" }), task({ id: "b", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" })]),
    ).toEqual(["a>b !"]);
    expect(
      edgeList([task({ id: "a", slot: "afternoon", taskType: "inspection" }), task({ id: "b", slot: "morning", crewId: "crew-drywall", taskType: "close_wall" })]),
    ).toEqual(["a>b !"]);
    expect(
      edgeList([task({ id: "a", slot: "morning", taskType: "inspection" }), task({ id: "b", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" })]),
    ).toEqual(["a>b"]);
  });

  it("the same crew doing the prerequisite first in its own order is not violated", () => {
    expect(
      edgeList([
        task({ id: "a", crewId: "crew-drywall", order: 0, taskType: "close_wall" }),
        task({ id: "b", crewId: "crew-drywall", order: 1, taskType: "finish_drywall" }),
      ]),
    ).toEqual(["a>b"]);
  });

  it("done tasks satisfy and do not block; cancelled tasks are ignored", () => {
    const close = task({ id: "c", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" });
    const g = graphOf([task({ id: "i", day: FRI, taskType: "inspection", status: "done" }), task({ id: "j", slot: "afternoon", taskType: "inspection" }), close]);
    expect(g.edges).toEqual([]);
    expect(g.taskIds).toEqual(["c", "j"]);
    expect(edgeList([task({ id: "i", slot: "afternoon", taskType: "inspection", status: "cancelled" }), close])).toEqual([]);
  });

  it("with one prerequisite in time, a later one is not an edge (the task waits on the earlier one)", () => {
    expect(
      edgeList([
        task({ id: "i1", day: FRI, taskType: "inspection" }),
        task({ id: "i2", slot: "afternoon", taskType: "inspection" }),
        task({ id: "c", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" }),
      ]),
    ).toEqual(["i1>c"]);
  });

  it("an inspection waits only on the rough-in of the crew that booked it", () => {
    expect(
      edgeList([
        task({ id: "e", slot: "afternoon", crewId: "crew-electrical", taskType: "rough_in_electrical" }),
        task({ id: "i", day: FRI, crewId: "crew-plumbing", taskType: "inspection" }),
        task({ id: "c", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" }),
      ]),
    ).toEqual(["i>c"]);
  });

  it("places: a shared element links two place names; other rooms and unknown places get no edges", () => {
    expect(
      edgeList([
        task({ id: "i", day: FRI, placeId: "corridor", elementIds: ["W-08"], taskType: "inspection" }),
        task({ id: "c", placeId: "room-203", elementIds: ["W-08"], crewId: "crew-drywall", taskType: "close_wall" }),
      ]),
    ).toEqual(["i>c"]);
    expect(edgeList([task({ id: "i", slot: "afternoon", placeId: "room-203", taskType: "inspection" }), task({ id: "c", crewId: "crew-drywall", taskType: "close_wall" })])).toEqual([]);
    expect(
      edgeList([task({ id: "i", slot: "afternoon", placeId: "room-999", taskType: "inspection" }), task({ id: "c", placeId: "room-999", crewId: "crew-drywall", taskType: "close_wall" })]),
    ).toEqual([]);
  });

  it("finishesBefore uses slot order and done status", () => {
    const step = { crewId: "crew-drywall", day: SAT, slot: "afternoon" as const, taskType: "close_wall" as const, elementIds: [] };
    expect(finishesBefore(task({ id: "a", slot: "morning", taskType: "inspection" }), step)).toBe(true);
    expect(finishesBefore(task({ id: "a", slot: "full_day", taskType: "inspection" }), step)).toBe(false);
    expect(finishesBefore(task({ id: "a", day: "2026-11-15", taskType: "inspection", status: "done" }), step)).toBe(true);
  });
});

describe("critical path and slips", () => {
  it("longest chain by half-day slots: full_day counts 2; equal chains break to the smaller end id", () => {
    const tasks = [
      task({ id: "r", day: FRI, slot: "full_day", taskType: "rough_in_plumbing", placeId: "room-203" }),
      task({ id: "t", placeId: "room-203", crewId: "crew-tiling", taskType: "tile" }),
      task({ id: "i", taskType: "inspection" }),
      task({ id: "c", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" }),
    ];
    expect(graphOf(tasks).criticalPath).toEqual(["r", "t"]);
    const equal = [
      task({ id: "i2", placeId: "room-203", taskType: "inspection" }),
      task({ id: "c2", placeId: "room-203", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" }),
      task({ id: "i1", taskType: "inspection" }),
      task({ id: "c1", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" }),
    ];
    expect(graphOf(equal).criticalPath).toEqual(["i1", "c1"]);
  });

  it("no edges, no critical path", () => {
    expect(graphOf([task({ id: "a", slot: "full_day", taskType: "layout" })]).criticalPath).toEqual([]);
  });

  it("a slip pushes successors transitively and names their crews; slack absorbs it", () => {
    const tasks = [
      task({ id: "r", day: FRI, slot: "afternoon", crewId: "crew-plumbing", taskType: "rough_in_plumbing" }),
      task({ id: "i", slot: "morning", crewId: "crew-plumbing", taskType: "inspection" }),
      task({ id: "c", slot: "afternoon", crewId: "crew-drywall", taskType: "close_wall" }),
      task({ id: "early", day: "2026-11-12", taskType: "inspection", placeId: "room-203" }),
      task({ id: "c3", slot: "afternoon", placeId: "room-203", crewId: "crew-drywall", taskType: "close_wall" }),
    ];
    const g = graphOf(tasks);
    expect(g.slips).toEqual([
      { taskId: "c", blocks: [], crewIds: [] },
      { taskId: "c3", blocks: [], crewIds: [] },
      // Thursday's inspection can finish a slot late (Thursday afternoon) and the Saturday close still starts as planned.
      { taskId: "early", blocks: [], crewIds: [] },
      { taskId: "i", blocks: ["c"], crewIds: ["crew-drywall"] },
      { taskId: "r", blocks: ["c", "i"], crewIds: ["crew-drywall", "crew-plumbing"] },
    ]);
  });

  it("same input, same output, whatever the task order", () => {
    const tasks = [
      task({ id: "i", slot: "afternoon", taskType: "inspection" }),
      task({ id: "c", crewId: "crew-drywall", taskType: "close_wall" }),
      task({ id: "r", day: FRI, taskType: "rough_in_plumbing" }),
    ];
    expect(graphOf([...tasks].reverse())).toEqual(graphOf(tasks));
  });
});

describe("graph and order_of_work agree", () => {
  it("a prerequisite_later finding sits on a violated edge of a finding rule, and only there", () => {
    const tasks = [
      task({ id: "i", slot: "afternoon", taskType: "inspection" }),
      task({ id: "c", crewId: "crew-drywall", taskType: "close_wall" }),
      task({ id: "p", crewId: "crew-painting", slot: "morning", placeId: "room-203", taskType: "paint" }),
      task({ id: "f", crewId: "crew-drywall", slot: "afternoon", placeId: "room-203", taskType: "finish_drywall" }),
      task({ id: "e", crewId: "crew-electrical", slot: "afternoon", placeId: "room-203", taskType: "rough_in_electrical" }),
      task({ id: "i3", crewId: "crew-electrical", slot: "morning", placeId: "room-203", taskType: "inspection" }),
    ];
    const { scene, plan } = setup(tasks);
    const g = planGraph(scene, plan);
    const findingRule = (to: string) => PREREQUISITE_RULES.some((r) => r.findings && r.after === scene.tasks.find((t) => t.id === to)!.taskType);
    const violated = g.edges.filter((e) => e.violated && findingRule(e.to)).map((e) => e.to).sort();
    const later = runChecks(scene, plan)
      .filter((f) => f.rule?.id === "order_of_work.prerequisite_later")
      .map((f) => f.id.replace(/^f-order_of_work-m-\w+-/, ""))
      .sort();
    expect(violated).toEqual(["c", "p"]);
    expect(later).toEqual(violated);
    // The graph-only rule shows the inspection before the electrical rough-in, with no finding.
    expect(g.edges.find((e) => e.to === "i3")).toMatchObject({ from: "e", violated: true });
    expect(runChecks(scene, plan).some((f) => f.check === "order_of_work" && f.taskIds.includes("i3"))).toBe(false);
  });
});

describe("rehearse carries the graph", () => {
  it("returns the plan graph next to the frames; an empty plan has neither", () => {
    const { scene, plan } = setup([task({ id: "i", slot: "afternoon", taskType: "inspection" }), task({ id: "c", crewId: "crew-drywall", taskType: "close_wall" })]);
    const r = rehearse(scene, plan);
    expect(RehearsalSchema.parse(r)).toEqual(r);
    expect(r.graph).toEqual(planGraph(scene, plan));
    expect(r.graph?.edges.map((e) => e.violated)).toEqual([true]);
    expect(rehearse(scene, { day: SAT, tasks: [] })).toEqual({ day: SAT, frames: [] });
  });
});
