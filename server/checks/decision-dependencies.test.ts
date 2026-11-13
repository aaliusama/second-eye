import { describe, expect, it } from "vitest";
import type { CrewIntent, Element, PlanTask, Scene, TaskType } from "@site/contracts";
import { fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import { runChecks } from "./index";

function decision(id: string, name: string, confidence = 0.9): Element {
  return {
    id, name, type: "fixture", aliases: [], state: "proposed", version: 1,
    geometry: { kind: "point", at: [17, 4] },
    history: [{ version: 1, time: "2026-11-12T11:00:00", thread: "office", operationType: "set_status", state: "proposed", sourceMessageId: `proposal-${id}`, confidence }],
  };
}

function setup(taskType: TaskType, elementIds: string[] = []): { scene: Scene; task: PlanTask; intent: CrewIntent } {
  const scene = structuredClone(fixtureScene);
  scene.elements.push(
    decision("finish-a", "Guest room wall colour"),
    decision("finish-b", "Guest room floor tiles"),
    decision("fitting-a", "Guest room pendant light fixture"),
    decision("unknown-a", "Guest room option B"),
  );
  const task = { ...fixtureTask, taskType, elementIds };
  scene.tasks = [task];
  const intent: CrewIntent = {
    id: "intent-decision", time: scene.time, crewId: task.crewId, day: task.day, slot: task.slot,
    taskType, elementIds, placeId: task.placeId, description: task.description,
    sourceMessageId: task.sourceMessageId, confidence: task.confidence,
  };
  return { scene, task, intent };
}

const decisions = (scene: Scene, task: PlanTask, intent?: CrewIntent) =>
  runChecks(scene, { day: task.day, tasks: [task] }, intent).filter((f) => f.check === "open_decision");

describe("task-relevant open decisions inside a place", () => {
  it.each([
    ["paint", "finish-a"], ["tile", "finish-b"], ["install_fixtures", "fitting-a"],
  ] as const)("%s infers only its material or fixture, with sources, live and in rehearsal", (taskType, id) => {
    const { scene, task, intent } = setup(taskType);
    for (const findings of [decisions(scene, task), decisions(scene, task, intent)]) {
      expect(findings.map((f) => f.elementIds)).toEqual([[id]]);
      expect(findings[0]!.evidenceMessageIds).toEqual([`proposal-${id}`]);
      expect(findings[0]!.sourceMessageId).toBe(task.sourceMessageId);
    }
  });

  it("painting a named wall still depends on the room's proposed colour", () => {
    const { scene, task, intent } = setup("paint", ["W-12"]);
    expect(decisions(scene, task, intent).map((f) => f.elementIds)).toEqual([["finish-a"]]);
  });

  it("installing an approved named fixture is not blocked by another proposed fixture or finish", () => {
    const { scene, task, intent } = setup("install_fixtures", ["fitting-a"]);
    scene.elements.find((e) => e.id === "fitting-a")!.state = "approved";
    scene.elements.push(decision("fitting-b", "Guest room vanity"));
    expect(decisions(scene, task)).toEqual([]);
    expect(decisions(scene, task, intent)).toEqual([]);
  });

  it("an explicitly named proposed dependency counts even when its category is unknown", () => {
    const { scene, task } = setup("install_fixtures", ["unknown-a"]);
    expect(decisions(scene, task).map((f) => f.elementIds)).toEqual([["unknown-a"]]);
  });

  it("does not infer a dependency for unrelated work or another room", () => {
    const { scene, task } = setup("rough_in_electrical");
    expect(decisions(scene, task)).toEqual([]);
    const paintTask = { ...task, taskType: "paint" as const, placeId: "room-203" };
    expect(decisions(scene, paintTask)).toEqual([]);
  });

  it("a low-confidence proposal never gives a confident hold", () => {
    const { scene, task, intent } = setup("tile");
    scene.elements.find((e) => e.id === "finish-b")!.history[0]!.confidence = 0.4;
    for (const findings of [decisions(scene, task), decisions(scene, task, intent)]) {
      expect(findings[0]!.severity).toBe("warn");
      expect(findings[0]!.summary).toContain("record is unsure");
    }
  });
});
