import { describe, expect, it } from "vitest";
import { fixtureOperations, fixtureScene, W12_AFTER, W12_BEFORE } from "@site/contracts/fixtures";
import type { Operation, Scene } from "@site/contracts";
import { applyOperations, getPlan } from "./index";

const base = (): Scene => structuredClone(fixtureScene);
const common = { time: "2026-11-13T18:00:00", sourceMessageId: "m-x", thread: "site-group", confidence: 0.7 } as const;

describe("applyOperations", () => {
  it("move bumps version, keeps history with source and confidence", () => {
    const start = base();
    const w = start.elements.find((e) => e.id === "W-12")!;
    w.geometry = W12_BEFORE;
    w.version = 1;
    w.history = [w.history[0]!];
    const out = applyOperations(start, fixtureOperations);
    const moved = out.elements.find((e) => e.id === "W-12")!;
    expect(moved.version).toBe(2);
    expect(moved.geometry).toEqual(W12_AFTER);
    expect(moved.history.at(-1)).toMatchObject({ sourceMessageId: "m-001", thread: "office", confidence: 0.92 });
  });

  it("does not mutate the input scene", () => {
    const start = base();
    const copy = structuredClone(start);
    applyOperations(start, fixtureOperations);
    expect(start).toEqual(copy);
  });

  it("is deterministic", () => {
    expect(applyOperations(base(), fixtureOperations)).toEqual(applyOperations(base(), fixtureOperations));
  });

  it("set_status changes state and history", () => {
    const op: Operation = { ...common, id: "o1", type: "set_status", elementId: "room-204", state: "unconfirmed" };
    const el = applyOperations(base(), [op]).elements.find((e) => e.id === "room-204")!;
    expect(el.state).toBe("unconfirmed");
    expect(el.version).toBe(2);
    expect(el.history.at(-1)?.state).toBe("unconfirmed");
  });

  it("add creates version 1 with history; duplicate add is skipped", () => {
    const op: Operation = {
      ...common,
      id: "o2",
      type: "add",
      element: { id: "fx-1", type: "fixture", name: "Vanity", aliases: [], geometry: { kind: "point", at: [17, 4] }, state: "proposed" },
    };
    const once = applyOperations(base(), [op]);
    const el = once.elements.find((e) => e.id === "fx-1")!;
    expect(el.version).toBe(1);
    expect(el.history).toHaveLength(1);
    expect(applyOperations(once, [op]).elements.filter((e) => e.id === "fx-1")).toHaveLength(1);
  });

  it("remove drops the element", () => {
    const op: Operation = { ...common, id: "o3", type: "remove", elementId: "W-08" };
    expect(applyOperations(base(), [op]).elements.some((e) => e.id === "W-08")).toBe(false);
  });

  it("unknown element is skipped, scene unchanged", () => {
    const op: Operation = { ...common, id: "o4", type: "set_status", elementId: "nope", state: "built" };
    expect(applyOperations(base(), [op]).elements).toEqual(base().elements);
  });

  it("plan_task adds a task and getPlan returns it", () => {
    const task = { ...fixtureScene.tasks[0]!, id: "task-new", order: 1 };
    const op: Operation = { ...common, id: "o5", type: "plan_task", task };
    const out = applyOperations(base(), [op]);
    expect(getPlan(out, "2026-11-14").tasks.map((t) => t.id)).toEqual(["task-001", "task-new"]);
  });

  it("scene time follows the latest operation", () => {
    const op: Operation = { ...common, id: "o6", type: "set_status", elementId: "room-204", state: "built" };
    expect(applyOperations(base(), [op]).time).toBe("2026-11-13T18:00:00");
  });
});
