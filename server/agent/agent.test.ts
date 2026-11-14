import { describe, expect, it } from "vitest";
import { Correction, type ChatMessage, type Finding, type Fix, type LearningContext, type Scene } from "@site/contracts";
import {
  W12_AFTER,
  fixtureFinding,
  fixtureFix,
  fixtureMessages,
  fixtureScene,
  fixtureTask,
} from "@site/contracts/fixtures";
import { decide, type AgentInput } from "./policy";
import { computeProfiles, suggestCorrections } from "./profiles";
import { runAgent, stepsFor } from "./runner";

// Simulated site data: the ghost-wall fixture (W-12 moved 0.4 m east in the office thread,
// Novak Plumbing reads only the site group and plans to rough in along it on Saturday morning).

const noLearning: LearningContext = { locationAliases: {}, crewNotes: {} };
const FRI = (clock: string) => `2026-11-13T${clock}`;
const SAT = (clock: string) => `2026-11-14T${clock}`;

const base = (over: Partial<AgentInput> = {}): AgentInput => ({
  now: FRI("17:40:00"),
  scene: fixtureScene,
  messages: fixtureMessages,
  findings: [fixtureFinding],
  fixes: [fixtureFix],
  rehearsals: [],
  learning: noLearning,
  crewProfiles: [],
  ...over,
});

const crewMsg = (id: string, time: string, text: string): ChatMessage => ({
  id,
  time,
  thread: "site-group",
  senderName: "Marek (Novak Plumbing)",
  senderRole: "crew_lead",
  crewId: "crew-plumbing",
  text,
  kind: "text",
});

/** The evening rehearsal found the ghost wall and plumbing has said nothing since: ask, don't tell. */
const rehearsalFinding: Finding = { ...fixtureFinding, id: "f-r", trigger: "rehearsal", time: FRI("20:00:00") };
const askFix: Fix = {
  id: "fix-r",
  findingId: "f-r",
  kind: "ask_crew",
  description: "Ask Novak Plumbing to confirm the plan before 07:00.",
  messages: [{ crewId: "crew-plumbing", text: "Are you still planning to rough in the 204 bathroom in the morning?" }],
  status: "pending",
  sourceMessageId: "m-002",
};

const ids = (run: ReturnType<typeof runAgent>) => run.timeline.flatMap((s) => s.actions.map((a) => `${s.time} ${a.id}`));

describe("ghost wall", () => {
  it("escalates the HOLD to the superintendent tonight and does not message the crew itself", () => {
    const actions = decide(base());
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "escalate",
      id: "esc~f-001",
      to: "superintendent",
      findingId: "f-001",
      fixId: "fix-001",
      urgency: "tonight",
      due: FRI("17:40:00"),
    });
    expect(actions[0]!.sourceMessageIds).toEqual(["m-001", "m-002"]);
  });

  it("after approval, reminds the crew at 06:00 on the work day and never escalates again", () => {
    const approved: Fix = { ...fixtureFix, status: "approved" };
    const sent: ChatMessage = {
      id: "sent-fix-001-crew-plumbing",
      time: FRI("18:00:00"),
      thread: "dm:crew-plumbing",
      senderName: "Second Eye",
      senderRole: "system",
      crewId: "crew-plumbing",
      text: fixtureFix.messages[0]!.text,
      kind: "text",
    };
    const messages = [...fixtureMessages, sent];
    const run = runAgent(
      { scene: fixtureScene, messages, findings: [fixtureFinding], fixes: [approved], rehearsals: [], learning: noLearning },
      stepsFor(messages, SAT("09:00:00")),
    );
    expect(ids(run)).toEqual([`${FRI("17:40:00")} esc~f-001`, `${SAT("06:00:00")} rem~f-001~crew-plumbing`]);
    const reminder = run.sent[0]!;
    expect(reminder).toMatchObject({ id: "agent-rem~f-001~crew-plumbing", thread: "dm:crew-plumbing", senderRole: "system" });
    expect(reminder.text).toContain("approved by the superintendent");
  });
});

describe("listen step: silent crew", () => {
  const state = { scene: fixtureScene, messages: fixtureMessages, findings: [], fixes: [askFix], rehearsals: [], learning: noLearning };
  const rehearsals = [{ day: "2026-11-14", frames: [{ step: 0, time: SAT("07:00:00"), activeTaskIds: ["task-001"], findings: [rehearsalFinding] }] }];

  it("asks, follows up at 07:00, then escalates an hour later", () => {
    const run = runAgent({ ...state, rehearsals }, [FRI("20:00:00"), SAT("06:00:00"), SAT("07:00:00"), SAT("07:30:00"), SAT("08:00:00")]);
    expect(ids(run)).toEqual([
      `${FRI("20:00:00")} ask~f-r~crew-plumbing`,
      `${SAT("07:00:00")} fu~f-r~crew-plumbing`,
      `${SAT("08:00:00")} esc~fu~f-r~crew-plumbing`,
    ]);
    const esc = run.escalations[0]!;
    expect(esc).toMatchObject({ urgency: "now", fixId: "fix-r" });
    expect(esc.sourceMessageIds).toContain("agent-ask~f-r~crew-plumbing");
    expect(esc.sourceMessageIds).toContain("agent-fu~f-r~crew-plumbing");
    // An open issue today: no CLEAR briefing for plumbing at 06:00.
    expect(run.sent.some((m) => m.id.startsWith("agent-brief~"))).toBe(false);
  });

  it("stops when the crew answers before the deadline", () => {
    const reply = crewMsg("m-050", SAT("06:30:00"), "yes, saw it, we go to the new line");
    const run = runAgent(
      { ...state, messages: [...fixtureMessages, reply], rehearsals },
      [FRI("20:00:00"), SAT("07:00:00"), SAT("08:00:00")],
    );
    expect(ids(run)).toEqual([`${FRI("20:00:00")} ask~f-r~crew-plumbing`]);
  });
});

describe("auto resolve", () => {
  // Plumbing confirms the rev C line in the site group; extraction records W-12 there (thread they read).
  const ack = crewMsg("m-003", FRI("18:30:00"), "ok saw rev C, W-12 40cm east, we work to the new line");
  const w12 = fixtureScene.elements.find((e) => e.id === "W-12")!;
  const acked: Scene = {
    ...fixtureScene,
    elements: fixtureScene.elements.map((e) =>
      e.id !== "W-12"
        ? e
        : {
            ...w12,
            version: 3,
            history: [
              ...w12.history,
              { version: 3, time: FRI("18:30:00"), sourceMessageId: "m-003", thread: "site-group", operationType: "move" as const, geometry: W12_AFTER, confidence: 0.9 },
            ],
          },
    ),
  };
  const input = base({ scene: acked, messages: [...fixtureMessages, ack] });

  it("does not resolve before the acknowledgement is in the record", () => {
    const actions = decide({ ...input, now: FRI("18:00:00") });
    expect(actions.map((a) => a.kind)).toEqual(["escalate"]);
  });

  it("resolves once the checks no longer reproduce it, cites the acknowledgement, and sends CLEAR", () => {
    const actions = decide({ ...input, now: FRI("18:30:00"), done: ["esc~f-001"] });
    expect(actions.map((a) => a.id)).toEqual(["res~f-001", "clr~f-001~crew-plumbing"]);
    expect(actions[0]).toMatchObject({ kind: "auto_resolve", sourceMessageIds: ["m-003"] });
    expect(actions[1]).toMatchObject({ kind: "send_dm", reason: "clear" });
    expect((actions[1] as { text: string }).text.startsWith("CLEAR:")).toBe(true);
    // Resolved stays resolved.
    expect(decide({ ...input, now: FRI("19:00:00"), done: ["esc~f-001", "res~f-001", "clr~f-001~crew-plumbing"] })).toEqual([]);
  });
});

describe("quiet hours", () => {
  it("holds a crew DM decided at 22:00 until 06:00", () => {
    const late: Finding = { ...rehearsalFinding, time: FRI("22:00:00") };
    const run = runAgent(
      { scene: fixtureScene, messages: fixtureMessages, findings: [late], fixes: [askFix], rehearsals: [], learning: noLearning },
      [FRI("22:00:00"), FRI("23:00:00"), SAT("06:00:00")],
    );
    expect(run.timeline[0]).toMatchObject({ time: FRI("22:00:00"), actions: [] });
    expect(run.timeline[0]!.queued.map((a) => [a.id, a.due])).toEqual([["ask~f-r~crew-plumbing", SAT("06:00:00")]]);
    expect(run.timeline.some((s) => s.time === FRI("23:00:00"))).toBe(false);
    expect(ids(run)).toEqual([`${SAT("06:00:00")} ask~f-r~crew-plumbing`]);
    expect(run.sent[0]!.time).toBe(SAT("06:00:00"));
  });

  it("lets an urgent escalation through at night", () => {
    const todayTask = { ...fixtureTask, day: "2026-11-13" };
    const scene: Scene = { ...fixtureScene, tasks: [todayTask] };
    const actions = decide(base({ now: FRI("22:00:00"), scene, findings: [{ ...fixtureFinding, time: FRI("22:00:00") }] }));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "escalate", urgency: "now", due: FRI("22:00:00") });
  });
});

describe("idempotency", () => {
  it("same input, same actions", () => {
    expect(decide(base())).toEqual(decide(base()));
  });

  it("each action runs once across repeated and fine-grained steps, and a second run adds nothing", () => {
    const state = { scene: fixtureScene, messages: fixtureMessages, findings: [fixtureFinding], fixes: [fixtureFix], rehearsals: [], learning: noLearning };
    const steps = [...stepsFor(fixtureMessages, SAT("10:00:00")), FRI("17:40:00"), FRI("17:40:00"), FRI("18:15:00")];
    const run = runAgent(state, steps);
    const all = run.timeline.flatMap((s) => s.actions.map((a) => a.id));
    expect(new Set(all).size).toBe(all.length);
    const again = runAgent({ ...state, messages: [...fixtureMessages, ...run.sent], done: run.done }, steps);
    expect(again.timeline.flatMap((s) => s.actions)).toEqual([]);
  });

  it("drops an action with no source", () => {
    const noSource: Finding = { ...fixtureFinding, sourceMessageId: "", evidenceMessageIds: [] };
    expect(decide(base({ findings: [noSource] }))).toEqual([]);
  });
});

describe("learning loop: crews on watch", () => {
  it("run 1 profiles plumbing as watch and suggests a crew_misread correction", () => {
    const profiles = computeProfiles(fixtureScene.crews, [fixtureFinding], [fixtureFix], fixtureMessages);
    expect(profiles.map((p) => [p.crewId, p.risk, p.missedChanges])).toEqual([
      ["crew-drywall", "normal", 0],
      ["crew-plumbing", "watch", 1],
    ]);
    const [corr] = suggestCorrections(profiles, FRI("21:00:00"));
    expect(Correction.parse(corr)).toMatchObject({ kind: "crew_misread", crewId: "crew-plumbing", sourceMessageId: "m-002" });
  });

  it("counts an unanswered agent question", () => {
    const ask: ChatMessage = {
      id: "agent-ask~f-r~crew-drywall",
      time: FRI("20:00:00"),
      thread: "dm:crew-drywall",
      senderName: "Second Eye",
      senderRole: "system",
      crewId: "crew-drywall",
      text: "Are you still closing the 203 wall?",
      kind: "text",
    };
    const [drywall] = computeProfiles(fixtureScene.crews, [], [], [ask]);
    expect(drywall).toMatchObject({ crewId: "crew-drywall", unansweredQuestions: 1, risk: "watch" });
  });

  // Run 2: plumbing stated its plan on Thursday morning; the architect moves W-12 that afternoon.
  const planned = crewMsg("m-010", "2026-11-12T09:00:00", "sat morning we rough in 204 bath on the east wall");
  const run2Scene: Scene = { ...fixtureScene, tasks: [{ ...fixtureTask, sourceMessageId: "m-010" }] };
  const run2 = (learning: LearningContext, now: string) =>
    decide({ ...base(), now, scene: run2Scene, messages: [planned, fixtureMessages[0]!], findings: [], fixes: [], learning });
  const watched: LearningContext = { locationAliases: {}, crewNotes: { "crew-plumbing": ["missed a change"] } };

  it("run 2 sends the change to a watched crew the moment it lands, before any intent", () => {
    expect(run2(watched, "2026-11-12T14:00:00")).toEqual([]);
    const actions = run2(watched, "2026-11-12T14:02:00");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "send_dm",
      id: "pro~W-12~v2~crew-plumbing",
      crewId: "crew-plumbing",
      reason: "watch_crew_change",
      text: "Change to Unit 204 bathroom east wall per the record: moved 0.4 m east (said in the office thread, Thu 14:02). Work to the new line and reply to confirm.",
      sourceMessageIds: ["m-001"],
      due: "2026-11-12T14:02:00",
    });
  });

  it("a crew not on watch gets nothing proactive", () => {
    expect(run2(noLearning, "2026-11-12T14:02:00")).toEqual([]);
  });
});
