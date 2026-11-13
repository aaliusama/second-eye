import { describe, expect, it } from "vitest";
import type { Finding, LabelSet, Rehearsal } from "@site/contracts";
import { fixtureFinding, fixtureLabels, fixtureTask } from "@site/contracts/fixtures";
import { rehearsalFindings, score, scoreDetail, toIncidents } from "./score";

const rehearsalCopy: Finding = { ...fixtureFinding, id: "f-001", trigger: "rehearsal" };

describe("score", () => {
  it("counts a matching finding as caught", () => {
    const r = score("fixture", fixtureLabels, [fixtureFinding]);
    expect(r.total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
  });

  it("counts a missing finding as missed", () => {
    expect(score("fixture", fixtureLabels, []).total).toEqual({ caught: 0, missed: 1, falseAlarms: 0 });
  });

  it("counts an unlabelled finding as a false alarm", () => {
    const stray = { ...fixtureFinding, id: "f-x", sourceMessageId: "m-999" };
    expect(score("fixture", fixtureLabels, [fixtureFinding, stray]).total.falseAlarms).toBe(1);
  });

  it("live and rehearsal alerts for one incident count once", () => {
    const r = score("fixture", fixtureLabels, [fixtureFinding, rehearsalCopy, { ...rehearsalCopy, id: "f-again" }]);
    expect(r.total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
  });

  it("a repeated unlabelled alert is one false alarm, not three", () => {
    const stray = { ...fixtureFinding, id: "f-x", sourceMessageId: "m-999" };
    const r = score("fixture", fixtureLabels, [stray, { ...stray, trigger: "rehearsal" as const }, { ...stray, id: "f-y" }]);
    expect(r.total).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
  });

  it("space clash: live (second crew) and rehearsal (smaller task id) are one incident", () => {
    const base: Finding = {
      ...fixtureFinding,
      check: "space_clash",
      elementIds: ["room-206"],
      crewIds: ["crew-electrical", "crew-painting"],
      ghost: undefined,
    };
    const live: Finding = { ...base, id: "f-live", sourceMessageId: "m-061", evidenceMessageIds: ["m-060"] };
    const reh: Finding = { ...base, id: "f-reh", trigger: "rehearsal", sourceMessageId: "m-060", evidenceMessageIds: ["m-061"] };
    expect(toIncidents([live, reh])).toHaveLength(1);
    const labels: LabelSet = {
      cases: [{ id: "c", check: "space_clash", triggerMessageId: "m-061", crewIds: [], elementIds: ["room-206"], note: "" }],
    };
    expect(score("x", labels, [live, reh]).total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
    expect(score("x", labels, [reh]).total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
  });

  it("rehearsalFindings takes each finding once per rehearsal", () => {
    const r: Rehearsal = {
      day: "2026-11-14",
      frames: [
        { step: 0, time: "2026-11-14T07:00:00", activeTaskIds: ["task-001"], findings: [rehearsalCopy] },
        { step: 1, time: "2026-11-14T12:00:00", activeTaskIds: ["task-001"], findings: [rehearsalCopy] },
      ],
    };
    expect(rehearsalFindings([r])).toHaveLength(1);
  });
});

describe("scoreDetail", () => {
  it("says which trigger caught each case", () => {
    const tasks = [fixtureTask];
    expect(scoreDetail("x", fixtureLabels, [fixtureFinding], [rehearsalCopy], tasks).cases[0]!.caughtBy).toBe("both");
    expect(scoreDetail("x", fixtureLabels, [fixtureFinding], [], tasks).cases[0]!.caughtBy).toBe("live");
    expect(scoreDetail("x", fixtureLabels, [], [rehearsalCopy], tasks).cases[0]!.caughtBy).toBe("rehearsal");
    const none = scoreDetail("x", fixtureLabels, [], [], tasks);
    expect(none.cases[0]).toMatchObject({ caught: false, caughtBy: "none" });
    expect(none.perCrew["crew-plumbing"]).toEqual({ caught: 0, missed: 1, falseAlarms: 0 });
  });

  it("drops incidents under a confidence threshold (task confidence 0.88)", () => {
    const d = scoreDetail("x", fixtureLabels, [fixtureFinding], [], [fixtureTask]);
    expect(d.thresholds.map((t) => [t.threshold, t.total.caught])).toEqual([
      [0.5, 1],
      [0.7, 1],
      [0.9, 0],
    ]);
  });

  it("lists false alarms with their triggers", () => {
    const stray = { ...fixtureFinding, id: "f-x", sourceMessageId: "m-999" };
    const d = scoreDetail("x", fixtureLabels, [stray], [{ ...stray, trigger: "rehearsal" }], []);
    expect(d.falseAlarms).toHaveLength(1);
    expect(d.falseAlarms[0]!.triggers).toEqual(["live", "rehearsal"]);
    expect(d.perTrigger.live.falseAlarms).toBe(1);
    expect(d.perCrew["crew-plumbing"]).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
  });
});
