import { describe, expect, it } from "vitest";
import { Fix as FixSchema, Rehearsal as RehearsalSchema } from "@site/contracts";
import type { ChatMessage, Finding, Plan, PlanTask, Scene } from "@site/contracts";
import { fixtureFinding, fixtureFix, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import { rehearse } from "./rehearse";
import { cite, proposeFixes } from "./fixes";
import { runChecks } from "./index";

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
      "HOLD: Unit 204 bathroom east wall moved 0.4 m east per the record. See the incident source record. Work to the new line.",
    );
    expect(fix!.messages[0]!.text).not.toContain("m-001");
    expect(fix!.description).toBe("Send the latest Unit 204 bathroom east wall position to Novak Plumbing before they start.");
  });

  it("space_clash moves one crew and keeps the other in its morning slot", () => {
    const clashTask = task({ id: "task-004", crewId: "crew-drywall", slot: "morning", taskType: "finish_drywall", sourceMessageId: "m-003" });
    const s = sceneWith([morning, clashTask]);
    const f = runChecks(s, plan(s.tasks)).find((x) => x.check === "space_clash")!;
    const [fix] = proposeFixes([f], s);
    expect(fix!.kind).toBe("reorder");
    const text = Object.fromEntries(fix!.messages.map((m) => [m.crewId, m.text]));
    expect(text["crew-plumbing"]).toContain("Keep your morning slot.");
    expect(text["crew-drywall"]).toContain("Move to the afternoon.");
    expect(fix!.messages.filter((m) => m.text.includes("Move to the afternoon."))).toHaveLength(1);
    expect(proposeFixes([f], sceneWith([clashTask, morning]))).toEqual([fix]);
    const corrected = [morning, { ...clashTask, slot: "afternoon" as const }];
    expect(runChecks(sceneWith(corrected), plan(corrected)).filter((x) => x.check === "space_clash")).toEqual([]);
    expect(FixSchema.parse(fix)).toEqual(fix);
  });

  it.each(["full_day", "afternoon"] as const)("does not invent a free slot when the clash occupies %s", (slot) => {
    const other = task({ id: "task-004", crewId: "crew-drywall", slot, taskType: "finish_drywall" });
    const own = { ...morning, slot };
    const s = sceneWith([own, other]);
    const f = runChecks(s, plan(s.tasks)).find((x) => x.check === "space_clash")!;
    const [fix] = proposeFixes([f], s);
    expect(fix!.messages.every((m) => m.text.includes("Confirm a revised slot with the superintendent."))).toBe(true);
    expect(fix!.messages.some((m) => /Move to the (morning|afternoon)\./.test(m.text))).toBe(false);
  });

  it("does not move a crew into another recorded booking", () => {
    const other = task({ id: "task-004", crewId: "crew-drywall", taskType: "finish_drywall" });
    const booking = task({ id: "task-005", crewId: "crew-plumbing", slot: "afternoon" });
    const s = sceneWith([morning, other, booking]);
    const f = runChecks(s, plan(s.tasks)).find((x) => x.check === "space_clash")!;
    expect(proposeFixes([f], s)[0]!.messages.every((m) => m.text.includes("Confirm a revised slot with the superintendent."))).toBe(true);
  });

  it("does not move a crew that already has afternoon work elsewhere", () => {
    const other = task({ id: "task-004", crewId: "crew-drywall", taskType: "finish_drywall" });
    const booking = task({ id: "task-005", crewId: "crew-drywall", slot: "afternoon", placeId: "room-203" });
    const s = sceneWith([morning, other, booking]);
    const f = runChecks(s, plan(s.tasks)).find((x) => x.check === "space_clash")!;
    expect(proposeFixes([f], s)[0]!.messages.every((m) => m.text.includes("Confirm a revised slot with the superintendent."))).toBe(true);
  });

  it("does not guess a morning slot when the live intent has no recorded task", () => {
    const f: Finding = {
      ...fixtureFinding, check: "space_clash", crewIds: ["crew-plumbing", "crew-drywall"], taskIds: [morning.id], ghost: undefined,
    };
    const [fix] = proposeFixes([f], sceneWith([morning]));
    expect(fix!.messages.find((m) => m.crewId === "crew-drywall")!.text).toContain("in an overlapping slot");
    expect(fix!.messages.every((m) => m.text.includes("Confirm a revised slot with the superintendent."))).toBe(true);
  });

  it("does not shorten full-day work to fit it in the afternoon", () => {
    const other = task({ id: "task-004", crewId: "crew-drywall", slot: "full_day", taskType: "finish_drywall" });
    const s = sceneWith([morning, other]);
    const f = runChecks(s, plan(s.tasks)).find((x) => x.check === "space_clash")!;
    expect(proposeFixes([f], s)[0]!.messages.every((m) => m.text.includes("Confirm a revised slot with the superintendent."))).toBe(true);
  });

  it.each(["latest_change", "space_clash", "order_of_work", "open_decision"] as const)("a %s warning stays a request to confirm in the crew message", (check) => {
    for (const trigger of ["live", "rehearsal"] as const) {
      const f: Finding = { ...fixtureFinding, check, trigger, severity: "warn" };
      const [fix] = proposeFixes([f], fixtureScene, fixtureMessages);
      expect(fix!.kind).toBe("notify_crew");
      expect(fix!.messages[0]!.text).toMatch(/^WARN:/);
      expect(fix!.messages[0]!.text).toContain("Please confirm the record before changing the plan.");
      expect(fix!.messages[0]!.text).not.toMatch(/HOLD:|Work to the new line|Move to the|Wait until/);
      expect(fix!.sourceMessageId).toBe(f.sourceMessageId);
      expect(FixSchema.parse(fix)).toEqual(fix);
    }
  });

  it("order_of_work and open_decision become holds", () => {
    const inspect = task({ id: "task-005", crewId: "crew-plumbing", taskType: "inspection", description: "Plumbing inspection at W-12" });
    const order: Finding = { ...fixtureFinding, id: "f-order", check: "order_of_work", ghost: undefined, crewIds: ["crew-drywall"], taskIds: ["task-002", "task-005"] };
    const open: Finding = { ...fixtureFinding, id: "f-open", check: "open_decision", ghost: undefined };
    const fixes = proposeFixes([order, open], sceneWith([afternoon, inspect]));
    expect(fixes.map((x) => [x.id, x.kind])).toEqual([["fix-f-order", "hold"], ["fix-f-open", "hold"]]);
    expect(fixes[0]!.messages[0]!.text).toBe(
      "HOLD: Plumbing inspection at W-12 is not done yet per the record. See the incident source record. Wait on Unit 204 bathroom east wall until it is done.",
    );
    expect(fixes[1]!.messages[0]!.text).toBe(
      "HOLD: The decision on Unit 204 bathroom east wall is not approved per the record. See the incident source record. Wait until it is approved.",
    );
    fixes.forEach((x) => FixSchema.parse(x));
  });

  it("listen rule: unsure rehearsal finding asks the crew", () => {
    const unsure = task({ id: "task-001", confidence: 0.5 });
    const f: Finding = { ...fixtureFinding, trigger: "rehearsal" };
    const [fix] = proposeFixes([f], sceneWith([unsure]));
    expect(fix!.kind).toBe("ask_crew");
    expect(fix!.messages[0]!.text).toBe(
      "Are you still planning rough in the 204 bathroom along the east wall in the morning? Unit 204 bathroom east wall moved 0.4 m east per the record. See the incident source record.",
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

  describe("listen rule with messages", () => {
    const [change, plumbing] = fixtureMessages as [ChatMessage, ChatMessage];
    // Evening finding on a plan task whose crew last spoke before the change.
    const evening: Finding = { ...fixtureFinding, id: "f-eve", trigger: "rehearsal", sourceMessageId: "m-000" };
    const before: ChatMessage = { ...plumbing, id: "m-000", time: "2026-11-11T16:00:00" };

    it("silent crew gets an ask_crew question naming the risk", () => {
      const [fix] = proposeFixes([evening], fixtureScene, [before, change]);
      expect(FixSchema.parse(fix)).toEqual(fix);
      expect(fix!.kind).toBe("ask_crew");
      expect(fix!.messages).toEqual([
        {
          crewId: "crew-plumbing",
          text: "Are you still planning rough in the 204 bathroom along the east wall in the morning? Unit 204 bathroom east wall moved 0.4 m east per the record. Source: Lena Hofer, office, Thu 14:02. Reply before 07:00.",
        },
      ]);
    });

    it("cites people, threads and times; hides unknown internal ids", () => {
      expect(cite(["m-001"], [change])).toBe("Lena Hofer, office, Thu 14:02");
      expect(cite(["m-001", "m-404"], [change])).toBe("Lena Hofer, office, Thu 14:02");
      expect(cite(["m-001"])).toBe("");
    });

    it("crew that posted after the change gets the normal fix", () => {
      const [fix] = proposeFixes([evening], fixtureScene, [before, change, plumbing]);
      expect(fix!.kind).toBe("notify_crew");
      // Another crew posting does not count.
      const other: ChatMessage = { ...plumbing, id: "m-009", crewId: "crew-drywall" };
      expect(proposeFixes([evening], fixtureScene, [before, change, other])[0]!.kind).toBe("ask_crew");
    });

    it("multi-crew finding asks each silent crew, while a crew that spoke gets the normal fix", () => {
      const clash: Finding = { ...evening, crewIds: ["crew-drywall", "crew-plumbing"], evidenceMessageIds: ["m-001"] };
      expect(proposeFixes([clash], fixtureScene, [before, change])[0]!.kind).toBe("ask_crew");
      expect(proposeFixes([clash], fixtureScene, [before, change, plumbing])[0]!.kind).toBe("notify_crew");
      const mixed = proposeFixes([clash], fixtureScene, [before, change, plumbing])[0]!;
      expect(mixed.messages.find((m) => m.crewId === "crew-drywall")!.text).toMatch(/^Are you still planning/);
      expect(mixed.messages.find((m) => m.crewId === "crew-plumbing")!.text).toMatch(/^HOLD:/);
    });

    it("no evidence in messages falls back to the source message time; none at all is not silent", () => {
      const noEvidence: Finding = { ...evening, evidenceMessageIds: ["m-404"] };
      expect(proposeFixes([noEvidence], fixtureScene, [before])[0]!.kind).toBe("notify_crew");
      expect(proposeFixes([noEvidence], fixtureScene, [])[0]!.kind).toBe("notify_crew");
    });

    it("live finding never becomes ask_crew", () => {
      const unsure = task({ id: "task-001", confidence: 0.5 });
      expect(proposeFixes([{ ...evening, trigger: "live" }], fixtureScene, [before, change])[0]!.kind).toBe("notify_crew");
      expect(proposeFixes([fixtureFinding], sceneWith([unsure]), [change])[0]!.kind).toBe("notify_crew");
    });

    it("undefined messages preserves the fallback; low confidence alone does not ask a crew that has replied", () => {
      const fs = [evening, fixtureFinding];
      expect(proposeFixes(fs, fixtureScene, undefined)).toEqual(proposeFixes(fs, fixtureScene));
      expect(proposeFixes(fs, fixtureScene).map((x) => x.kind)).toEqual(["notify_crew", "notify_crew"]);
      const unsure = task({ id: "task-001", confidence: 0.5 });
      const [fix] = proposeFixes([evening], sceneWith([unsure]), [before, change, plumbing]);
      expect(fix!.kind).toBe("notify_crew");
      expect(fix!.messages[0]!.text.endsWith("Reply before 07:00.")).toBe(false);
    });

    it("a system DM does not make a silent crew look like it replied", () => {
      const system: ChatMessage = { ...plumbing, id: "agent-question", senderRole: "system", text: "Are you still planning?" };
      expect(proposeFixes([evening], fixtureScene, [before, change, system])[0]!.kind).toBe("ask_crew");
    });
  });
});
