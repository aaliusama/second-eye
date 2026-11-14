import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureFinding, fixtureScene } from "@site/contracts/fixtures";
import { configureDismissals, dismissalState, dismissFinding, resetDismissals, undoDismissal } from "./dismissals";

describe("narrow reversible dismissal memory", () => {
  beforeEach(() => configureDismissals());
  it("remembers the same incident across runs without changing findings", () => {
    const original = structuredClone(fixtureFinding);
    const rule = dismissFinding(fixtureFinding, fixtureScene, "Reviewed with crew; duplicate reminder", fixtureScene.time);
    resetDismissals(true);
    expect(dismissalState([fixtureFinding], fixtureScene).matches).toEqual([{ findingId: fixtureFinding.id, ruleId: rule.id }]);
    expect(fixtureFinding).toEqual(original);
  });
  it("does not suppress new evidence, another day or revised geometry", () => {
    dismissFinding(fixtureFinding, fixtureScene, "Already reviewed", fixtureScene.time);
    expect(dismissalState([{ ...fixtureFinding, sourceMessageId: "new-message" }], fixtureScene).matches).toEqual([]);
    const scene = structuredClone(fixtureScene);
    const element = scene.elements.find((e) => fixtureFinding.elementIds.includes(e.id))!;
    element.version++;
    expect(dismissalState([fixtureFinding], scene).matches).toEqual([]);
    const taskScene = structuredClone(fixtureScene);
    const task = taskScene.tasks.find((t) => fixtureFinding.taskIds.includes(t.id))!;
    task.day = "2026-11-15";
    expect(dismissalState([fixtureFinding], taskScene).matches).toEqual([]);
  });
  it("undo restores attention and clean reset removes memory", () => {
    const rule = dismissFinding(fixtureFinding, fixtureScene, "Already reviewed", fixtureScene.time);
    expect(undoDismissal(rule.id, fixtureScene.time)).toBe(true);
    expect(dismissalState([fixtureFinding], fixtureScene).matches).toEqual([]);
    expect(dismissalState([], fixtureScene).rules[0]?.active).toBe(false);
    resetDismissals(false);
    expect(dismissalState([], fixtureScene).rules).toEqual([]);
  });
  it("is idempotent for repeat dismissals and validates the reason", () => {
    const first = dismissFinding(fixtureFinding, fixtureScene, "Already reviewed", fixtureScene.time);
    expect(dismissFinding(fixtureFinding, fixtureScene, "Already reviewed again", fixtureScene.time).id).toBe(first.id);
    configureDismissals();
    expect(() => dismissFinding(fixtureFinding, fixtureScene, " ", fixtureScene.time)).toThrow();
  });
  it("persists review and undo across restarts in a companion file", () => {
    const dir = mkdtempSync(join(tmpdir(), "site-dismissals-"));
    const path = join(dir, "learning.json");
    try {
      configureDismissals(path);
      const rule = dismissFinding(fixtureFinding, fixtureScene, "Reviewed on site", fixtureScene.time);
      configureDismissals(path);
      expect(dismissalState([fixtureFinding], fixtureScene).matches).toHaveLength(1);
      undoDismissal(rule.id, fixtureScene.time);
      configureDismissals(path);
      expect(dismissalState([fixtureFinding], fixtureScene).matches).toEqual([]);
      expect(dismissalState([], fixtureScene).rules[0]?.undoneAt).toBe(fixtureScene.time);
    } finally { configureDismissals(); rmSync(dir, { recursive: true, force: true }); }
  });
});
