import { describe, expect, it } from "vitest";
import { Clearance, Finding, Overlap, PlanGraph, Rehearsal, StateResponse, type PlanTask, type Scene } from "@site/contracts";
import { fixtureFinding, fixtureFix, fixtureScene } from "@site/contracts/fixtures";
import { clearanceTone, clearanceWords, criticalPathLine, graphView, mergeRestated, overlapLabel, slipReadout, stackBars } from "./depth";
import { sampleClearance, sampleGraph, sampleOverlap, withLaneSamples } from "./fixtures/laneSamples";

const task = (id: string, crewId: string, slot: PlanTask["slot"], placeId = "room-204"): PlanTask => ({
  id, crewId, day: "2026-11-14", slot, order: 0, taskType: "close_wall", description: id, placeId, elementIds: [], status: "planned", sourceMessageId: `m-${id}`, confidence: 1,
});
const scene: Scene = {
  ...fixtureScene,
  crews: [...fixtureScene.crews, { id: "crew-painting", name: "Ortiz Painting", trade: "painting", letter: "A", threads: [] }],
  tasks: [task("a", "crew-plumbing", "morning"), task("b", "crew-drywall", "afternoon"), task("c", "crew-painting", "afternoon")],
};
const graph: PlanGraph = {
  taskIds: ["a", "b", "c", "x"],
  edges: [
    { from: "a", to: "b", placeId: "room-204", reason: "close wall needs the rough-in first", violated: false },
    { from: "b", to: "c", placeId: "room-204", reason: "paint needs the wall closed", violated: true },
    { from: "x", to: "a", placeId: "room-204", reason: "earlier day", violated: false },
  ],
  criticalPath: ["a", "b", "c"],
  slips: [{ taskId: "a", blocks: ["b", "c"], crewIds: ["crew-drywall", "crew-painting"] }],
};

describe("sample lane data", () => {
  it("matches the frozen contract shapes exactly", () => {
    expect(() => Clearance.parse(sampleClearance)).not.toThrow();
    expect(() => Overlap.parse(sampleOverlap)).not.toThrow();
    expect(() => PlanGraph.parse(sampleGraph)).not.toThrow();
  });

  it("adds measure and graph without changing the input, and stays valid", () => {
    const state: StateResponse = { t: fixtureScene.time, scene: fixtureScene, findings: [fixtureFinding], fixes: [fixtureFix] };
    const rehearsal: Rehearsal = { day: "2026-11-14", frames: [{ step: 0, time: "2026-11-14T07:00:00", activeTaskIds: [], findings: [fixtureFinding] }] };
    const out = withLaneSamples(state, rehearsal);
    expect(state.findings[0].measure).toBeUndefined();
    expect(rehearsal.graph).toBeUndefined();
    expect(out.state.findings[0].measure?.clearance).toEqual(sampleClearance);
    expect(() => StateResponse.parse(out.state)).not.toThrow();
    expect(() => Rehearsal.parse(out.rehearsal)).not.toThrow();
    expect(() => Finding.parse(out.rehearsal!.frames[0].findings[0])).not.toThrow();
  });
});

describe("measured drawings", () => {
  it("words the clearance with its numbers and keeps redline for real conflicts", () => {
    expect(clearanceWords(sampleClearance)[1]).toBe("0.40 m gap · needs 0.10 m clear");
    expect(clearanceWords({ ...sampleClearance, outcome: "inside_new_wall" })[1]).toContain("inside the recorded wall");
    expect(clearanceTone(sampleClearance, false)).toBe("redline");
    expect(clearanceTone(sampleClearance, true)).toBe("pending");
    expect(clearanceTone({ ...sampleClearance, outcome: "within_tolerance" }, false)).toBe("soft");
    expect(overlapLabel(6)).toBe("6.0 m² shared");
  });
});

describe("plan graph on the timeline", () => {
  it("draws nothing without a graph", () => {
    expect(graphView(undefined, new Set(["a"]))).toBeUndefined();
    expect(criticalPathLine(undefined, scene)).toBeUndefined();
    expect(slipReadout(undefined, "a", scene).lines).toEqual(["No plan graph on record."]);
  });

  it("marks the critical path, keeps violated flags and leaves off-timeline edges undrawn", () => {
    const v = graphView(graph, new Set(["a", "b", "c"]))!;
    expect([...v.critical]).toEqual(["a", "b", "c"]);
    expect(v.drawn.map((e) => [e.key, e.critical, e.violated])).toEqual([["a>b", true, false], ["b>c", true, true]]);
    expect(v.offTimeline.map((e) => e.key)).toEqual(["x>a"]);
  });

  it("says which crews are blocked if a task slips, only from the graph", () => {
    const r = slipReadout(graph, "a", scene);
    expect(r.title).toBe("If Novak Plumbing, close wall in Unit 204 slips");
    expect(r.lines[0]).toBe("Walsh Drywall and Ortiz Painting cannot start as planned:");
    expect(r.lines).toHaveLength(3);
    expect(slipReadout(graph, "c", scene).lines).toEqual(["Nothing else on the plan waits on it, per the plan graph."]);
    expect(slipReadout(graph, "zzz", scene).lines).toEqual(["This task is not in the plan graph."]);
    expect(criticalPathLine(graph, scene)).toBe("Critical path: Novak Plumbing → Walsh Drywall → Ortiz Painting (3 tasks)");
  });

  it("stacks bars of one crew that share a slot", () => {
    const s = stackBars([task("p", "c", "morning"), task("q", "c", "morning"), task("r", "c", "afternoon"), task("s", "c", "full_day")]);
    expect(s.rows).toBe(3);
    expect([s.row.get("p"), s.row.get("q"), s.row.get("r"), s.row.get("s")]).toEqual([0, 1, 0, 2]);
    expect(stackBars([]).rows).toBe(1);
  });

  it("shows a restated plan as one bar that carries both task ids", () => {
    const again = { ...task("a2", "crew-plumbing", "morning"), taskType: "close_wall" as const };
    const merged = mergeRestated([task("a", "crew-plumbing", "morning"), again, task("z", "crew-plumbing", "afternoon")]);
    expect(merged.map((m) => m.ids)).toEqual([["a", "a2"], ["z"]]);
  });
});
