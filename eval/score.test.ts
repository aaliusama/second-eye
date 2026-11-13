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

  it.each([
    { elementIds: ["W-08"] },
    { crewIds: ["crew-drywall"] },
  ])("does not credit the right message and check on the wrong crew or element: %j", (over) => {
    const wrong: Finding = { ...fixtureFinding, ...over };
    expect(score("fixture", fixtureLabels, [wrong]).total).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
    const detail = scoreDetail("fixture", fixtureLabels, [wrong], [], []);
    expect(detail.cases[0]!.caughtBy).toBe("none");
    expect(detail.perTrigger.live).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
  });

  it("matches all labelled crews and elements while allowing extra evidence elements", () => {
    const extra: Finding = { ...fixtureFinding, elementIds: ["room-204", "W-12"], crewIds: ["crew-drywall", "crew-plumbing"] };
    expect(score("fixture", fixtureLabels, [extra]).total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
    const labels: LabelSet = { cases: [{ ...fixtureLabels.cases[0]!, elementIds: ["W-12", "W-08"] }] };
    expect(score("fixture", labels, [extra]).total).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
    const twoCrews: LabelSet = { cases: [{ ...fixtureLabels.cases[0]!, crewIds: ["crew-plumbing", "crew-drywall"] }] };
    expect(score("fixture", twoCrews, [fixtureFinding]).total).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
    expect(score("fixture", twoCrews, [extra]).total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
  });

  it("two cases from one message require findings for each labelled element", () => {
    const labels: LabelSet = {
      cases: [...fixtureLabels.cases, { ...fixtureLabels.cases[0]!, id: "case-002", elementIds: ["W-08"] }],
    };
    expect(score("fixture", labels, [fixtureFinding]).total).toEqual({ caught: 1, missed: 1, falseAlarms: 0 });
  });

  it("counts an unlabelled finding as a false alarm", () => {
    const stray = { ...fixtureFinding, id: "f-x", sourceMessageId: "m-999", elementIds: ["W-08"] };
    expect(score("fixture", fixtureLabels, [fixtureFinding, stray]).total.falseAlarms).toBe(1);
  });

  it("a later restatement of a caught incident (same check, crews, elements) is a repeat, not a false alarm", () => {
    const again = { ...fixtureFinding, id: "f-again", sourceMessageId: "m-090" };
    expect(score("fixture", fixtureLabels, [fixtureFinding, again]).total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
    // Without the caught one it is just an unlabelled alarm.
    expect(score("fixture", fixtureLabels, [again]).total).toEqual({ caught: 0, missed: 1, falseAlarms: 1 });
    const d = scoreDetail("x", fixtureLabels, [fixtureFinding, again], [], []);
    expect(d.repeats.map((i) => i.messageIds)).toEqual([["m-090"]]);
    expect(d.falseAlarms).toEqual([]);
  });

  it("counts a new risk source for the same crews and elements as a false alarm, not a repeat", () => {
    const later: Finding = { ...fixtureFinding, id: "f-later", sourceMessageId: "m-090", evidenceMessageIds: ["m-new-change"] };
    const d = scoreDetail("x", fixtureLabels, [fixtureFinding, later], [], []);
    expect(d.repeats).toEqual([]);
    expect(d.falseAlarms.map((i) => i.findingIds)).toEqual([["f-later"]]);
    expect(score("x", fixtureLabels, [fixtureFinding, later]).total.falseAlarms).toBe(1);
  });

  it("does not infer a restatement without risk evidence", () => {
    const caught: Finding = { ...fixtureFinding, evidenceMessageIds: [] };
    const later = { ...caught, id: "f-later", sourceMessageId: "m-090" };
    expect(score("x", fixtureLabels, [caught, later]).total).toEqual({ caught: 1, missed: 0, falseAlarms: 1 });
  });

  it("does not suppress another clash pair in the same room with the same crews", () => {
    const clash: Finding = { ...fixtureFinding, check: "space_clash", elementIds: ["room-206"], crewIds: ["crew-electrical", "crew-painting"], sourceMessageId: "m-061", evidenceMessageIds: ["m-060"] };
    const labels: LabelSet = { cases: [{ id: "clash", check: "space_clash", triggerMessageId: "m-061", crewIds: clash.crewIds, elementIds: clash.elementIds, note: "" }] };
    const later = { ...clash, id: "f-later", sourceMessageId: "m-091", evidenceMessageIds: ["m-090"] };
    const d = scoreDetail("x", labels, [clash, later], [], []);
    expect(d.repeats).toEqual([]);
    expect(d.falseAlarms).toHaveLength(1);
  });

  it("lists all four checks even with no cases and no findings", () => {
    const r = score("x", { cases: [] }, []);
    expect(Object.keys(r.perCheck).sort()).toEqual(["latest_change", "open_decision", "order_of_work", "space_clash"]);
    expect(r.total).toEqual({ caught: 0, missed: 0, falseAlarms: 0 });
    expect(scoreDetail("x", { cases: [] }, [], [], []).thresholds.every((t) => Object.keys(t.perCheck).length === 4)).toBe(true);
  });

  it("a finding of another check on a labelled message is still a false alarm, under its own check", () => {
    const wrong: Finding = { ...fixtureFinding, id: "f-w", check: "open_decision", ghost: undefined };
    const r = score("x", fixtureLabels, [fixtureFinding, wrong]);
    expect(r.perCheck.open_decision.falseAlarms).toBe(1);
    expect(r.perCheck.latest_change).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
  });

  it("counts false alarms on messages with no label, and flags labels missing from the replay", () => {
    const stray: Finding = { ...fixtureFinding, id: "f-x", sourceMessageId: "m-050", elementIds: ["W-08"] };
    const labels: LabelSet = { cases: [...fixtureLabels.cases, { ...fixtureLabels.cases[0]!, id: "c2", triggerMessageId: "m-404" }] };
    const d = scoreDetail("x", labels, [fixtureFinding, stray], [], [], ["m-001", "m-002", "m-050", "m-051"]);
    expect(d.messages).toEqual({ total: 4, labelled: 1, unlabelled: 3, unlabelledWithFalseAlarm: 1 });
    expect(d.labelsNotInReplay).toEqual(["m-404"]);
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
