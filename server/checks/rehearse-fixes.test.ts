import { describe, expect, it } from "vitest";
import { Fix as FixSchema, Rehearsal as RehearsalSchema } from "@site/contracts";
import type { Finding, Plan, PlanTask, Scene } from "@site/contracts";
import { fixtureFinding, fixtureFix, fixtureScene } from "@site/contracts/fixtures";
import { rehearse } from "./rehearse";
import { proposeFixes } from "./fixes";

const base = fixtureScene.tasks[0]!;
const task = (over: Partial<PlanTask>): PlanTask => ({ ...base, ...over });

const morning = task({ id: "task-001" });
const afternoon = task({ id: "task-002", crewId: "crew-drywall", slot: "afternoon", taskType: "close_wall", description: "Close W-12" });
const allDay = task({ id: "task-003", crewId: "crew-drywall", slot: "full_day", placeId: "room-203", elementIds: ["W-08"] });

const plan = (tasks: PlanTask[]): Plan => ({ day: "2026-11-14", tasks });
const sceneWith = (tasks: PlanTask[]): Scene => ({ ...fixtureScene, tasks });

describe("rehearse", () => {
  it("empty plan gives no frames and does not need the checker", () => {
    const r = rehearse(fixtureScene, plan([]), () => {
      throw new Error("should not be called");
    });
    expect(r).toEqual({ day: "2026-11-14", frames: [] });
  });

  it("morning then afternoon frames, full_day in both, findings filtered and re-tagged", () => {
    const p = plan([afternoon, allDay, morning]);
    const other: Finding = { ...fixtureFinding, id: "f-002", taskIds: ["task-002"] };
    const r = rehearse(sceneWith(p.tasks), p, () => [fixtureFinding, other]);

    expect(RehearsalSchema.parse(r)).toEqual(r);
    expect(r.frames.map((f) => [f.step, f.time, f.activeTaskIds])).toEqual([
      [0, "2026-11-14T07:00:00", ["task-001", "task-003"]],
      [1, "2026-11-14T12:00:00", ["task-002", "task-003"]],
    ]);
    expect(r.frames[0]!.findings.map((f) => f.id)).toEqual(["f-001"]);
    expect(r.frames[1]!.findings.map((f) => f.id)).toEqual(["f-002"]);
    expect(r.frames.flatMap((f) => f.findings).every((f) => f.trigger === "rehearsal")).toBe(true);
    expect(fixtureFinding.trigger).toBe("live"); // input not mutated
  });

  it("skips slots with no tasks and is deterministic", () => {
    const p = plan([morning]);
    const a = rehearse(fixtureScene, p, () => [fixtureFinding]);
    expect(a.frames).toHaveLength(1);
    expect(a.frames[0]!.time).toBe("2026-11-14T07:00:00");
    expect(rehearse(fixtureScene, p, () => [fixtureFinding])).toEqual(a);
  });

  it("with the real runChecks, the evening rehearsal shows the ghost wall", () => {
    const r = rehearse(fixtureScene, { day: "2026-11-14", tasks: fixtureScene.tasks });
    const f = r.frames[0]!.findings.find((x) => x.check === "latest_change");
    expect(f?.trigger).toBe("rehearsal");
    expect(f?.ghost?.label).toBe("0.4 m east");
  });
});

describe("proposeFixes", () => {
  it("ghost-wall finding gives the fixture-equivalent fix", () => {
    const [fix] = proposeFixes([fixtureFinding], fixtureScene);
    expect(FixSchema.parse(fix)).toEqual(fix);
    expect(fix!.id).toBe("fix-f-001");
    expect(fix!.findingId).toBe(fixtureFix.findingId);
    expect(fix!.kind).toBe(fixtureFix.kind);
    expect(fix!.status).toBe(fixtureFix.status);
    expect(fix!.sourceMessageId).toBe(fixtureFix.sourceMessageId);
    expect(fix!.messages.map((m) => m.crewId)).toEqual(fixtureFix.messages.map((m) => m.crewId));
    expect(fix!.messages[0]!.text).toBe(
      "HOLD: Unit 204 bathroom east wall moved 0.4 m east per the record (m-001). Work to the new line.",
    );
    expect(fix!.description).toBe("Send the latest Unit 204 bathroom east wall position to Novak Plumbing before they start.");
  });

  it("space_clash suggests the other slot to each crew", () => {
    const clashTask = task({ id: "task-004", crewId: "crew-drywall", slot: "afternoon" });
    const f: Finding = {
      ...fixtureFinding, id: "f-clash", check: "space_clash", severity: "warn", ghost: undefined,
      crewIds: ["crew-plumbing", "crew-drywall"], taskIds: ["task-001", "task-004"], evidenceMessageIds: [],
    };
    const [fix] = proposeFixes([f], sceneWith([morning, clashTask]));
    expect(fix!.kind).toBe("reorder");
    expect(fix!.messages.map((m) => m.crewId)).toEqual(["crew-plumbing", "crew-drywall"]);
    expect(fix!.messages[0]!.text).toMatch(/^HOLD: Walsh Drywall is also in Unit 204 in the morning per the record \(m-002\)\. Move to the afternoon\.$/);
    expect(fix!.messages[1]!.text).toMatch(/Move to the morning\.$/);
  });

  it("order_of_work and open_decision become holds", () => {
    const inspect = task({ id: "task-005", crewId: "crew-plumbing", taskType: "inspection", description: "Plumbing inspection at W-12" });
    const order: Finding = { ...fixtureFinding, id: "f-order", check: "order_of_work", ghost: undefined, crewIds: ["crew-drywall"], taskIds: ["task-002", "task-005"] };
    const open: Finding = { ...fixtureFinding, id: "f-open", check: "open_decision", ghost: undefined };
    const fixes = proposeFixes([order, open], sceneWith([afternoon, inspect]));
    expect(fixes.map((x) => [x.id, x.kind])).toEqual([["fix-f-order", "hold"], ["fix-f-open", "hold"]]);
    expect(fixes[0]!.messages[0]!.text).toBe(
      "HOLD: Plumbing inspection at W-12 is not done yet per the record (m-001). Wait on Unit 204 bathroom east wall until it is done.",
    );
    expect(fixes[1]!.messages[0]!.text).toBe(
      "HOLD: The decision on Unit 204 bathroom east wall is not approved per the record (m-001). Wait until it is approved.",
    );
    fixes.forEach((x) => FixSchema.parse(x));
  });

  it("listen rule: unsure rehearsal finding asks the crew", () => {
    const unsure = task({ id: "task-001", confidence: 0.5 });
    const f: Finding = { ...fixtureFinding, trigger: "rehearsal" };
    const [fix] = proposeFixes([f], sceneWith([unsure]));
    expect(fix!.kind).toBe("ask_crew");
    expect(fix!.messages[0]!.text).toBe(
      "Are you still planning rough in the 204 bathroom along the east wall in the morning? Unit 204 bathroom east wall moved 0.4 m east per the record (m-001).",
    );
    // Same finding live, or confident in rehearsal: no question.
    expect(proposeFixes([fixtureFinding], sceneWith([unsure]))[0]!.kind).toBe("notify_crew");
    expect(proposeFixes([f], fixtureScene)[0]!.kind).toBe("notify_crew");
  });

  it("keeps finding order and is deterministic", () => {
    const fs = [{ ...fixtureFinding, id: "b" }, { ...fixtureFinding, id: "a" }];
    expect(proposeFixes(fs, fixtureScene).map((x) => x.id)).toEqual(["fix-b", "fix-a"]);
    expect(proposeFixes(fs, fixtureScene)).toEqual(proposeFixes(fs, fixtureScene));
    expect(proposeFixes([], fixtureScene)).toEqual([]);
  });
});
