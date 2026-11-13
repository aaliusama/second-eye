import { describe, expect, it, vi } from "vitest";
import type { Crew, Operation, Scene } from "@site/contracts";
import { W12_AFTER, W12_BEFORE, fixtureOperations, fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import { applyOperations, knownGeometry, knownVersion } from "./index";

/** fixtureScene with W-12 reset to its drawing (v1) state. */
function startScene(): Scene {
  const scene = structuredClone(fixtureScene);
  const w12 = scene.elements.find((e) => e.id === "W-12")!;
  w12.geometry = W12_BEFORE;
  w12.version = 1;
  w12.history = w12.history.slice(0, 1);
  scene.time = "2026-11-10T08:00:00";
  scene.tasks = [];
  return scene;
}

const w12 = (s: Scene) => s.elements.find((e) => e.id === "W-12")!;

describe("applyOperations", () => {
  it("applies the rev C move: W-12 at version 2 with W12_AFTER", () => {
    const out = applyOperations(startScene(), fixtureOperations);
    const el = w12(out);
    expect(el.version).toBe(2);
    expect(el.geometry).toEqual(W12_AFTER);
    expect(el.history).toHaveLength(2);
    expect(el.history[1]).toMatchObject({
      version: 2,
      sourceMessageId: "m-001",
      thread: "office",
      operationType: "move",
      geometry: W12_AFTER,
      confidence: 0.92,
    });
    expect(out.time).toBe("2026-11-12T14:02:00");
    // Matches the fixture scene's W-12.
    expect(el).toEqual(w12(fixtureScene));
  });

  it("does not mutate inputs and is deterministic", () => {
    const scene = startScene();
    const before = structuredClone(scene);
    const ops = structuredClone(fixtureOperations);
    const a = applyOperations(scene, ops);
    const b = applyOperations(scene, ops);
    expect(scene).toEqual(before);
    expect(ops).toEqual(fixtureOperations);
    expect(a).toEqual(b);
  });

  it("copy-on-write: changed elements are new objects, untouched ones shared, input unchanged", () => {
    const scene = startScene();
    const before = structuredClone(scene);
    const move = fixtureOperations.find((o) => o.type === "move")!;
    const twice = [move, { ...move, id: "op-again", time: "2026-11-12T15:00:00" }];
    const out = applyOperations(scene, twice);
    expect(scene).toEqual(before);
    expect(w12(out)).not.toBe(w12(scene));
    expect(w12(out).version).toBe(3);
    expect(w12(out).history).toHaveLength(3);
    const other = scene.elements.find((e) => e.id !== "W-12")!;
    expect(out.elements.find((e) => e.id === other.id)).toBe(other);
    expect(out.elements).not.toBe(scene.elements);
    expect(out.tasks).not.toBe(scene.tasks);
  });

  it("plan_task upserts by task id", () => {
    const op = (desc: string, id: string): Operation => ({
      id,
      type: "plan_task",
      time: "2026-11-13T17:40:00",
      sourceMessageId: "m-002",
      thread: "site-group",
      confidence: 0.88,
      task: { ...fixtureTask, description: desc },
    });
    const out = applyOperations(startScene(), [op("first", "op-a"), op("second", "op-b")]);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0].description).toBe("second");
  });

  it("skips an unknown element without throwing", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const scene = startScene();
    const op: Operation = { ...fixtureOperations[0], id: "op-x", elementId: "W-99" } as Operation;
    const out = applyOperations(scene, [op]);
    expect(out.elements).toEqual(scene.elements);
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain('"kind":"model.not_found"');
    spy.mockRestore();
  });
});

describe("knownGeometry / knownVersion", () => {
  const plumbing = fixtureScene.crews.find((c) => c.id === "crew-plumbing")!;
  const office: Crew = { ...plumbing, id: "crew-office", threads: ["site-group", "office"] };

  it("plumbing (site-group only) still sees the old line", () => {
    expect(knownGeometry(w12(fixtureScene), plumbing)).toEqual(W12_BEFORE);
    expect(knownVersion(w12(fixtureScene), plumbing).version).toBe(1);
  });

  it("a crew reading office sees the move", () => {
    expect(knownGeometry(w12(fixtureScene), office)).toEqual(W12_AFTER);
    expect(knownVersion(w12(fixtureScene), office).version).toBe(2);
  });

  it("a DM to the crew counts as heard", () => {
    const el = structuredClone(w12(fixtureScene));
    el.history[1].thread = "dm:crew-plumbing";
    expect(knownGeometry(el, plumbing)).toEqual(W12_AFTER);
  });
});
