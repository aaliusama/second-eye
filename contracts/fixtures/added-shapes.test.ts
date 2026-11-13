import { describe, expect, expectTypeOf, it } from "vitest";
import {
  Action,
  AgentLogResponse,
  Answer,
  AskRequest,
  AskResponse,
  BriefingResponse,
  CrewBriefing,
  CrewProfile,
  Digest,
  DigestResponse,
  Question,
  ResetResponse,
  StructuredQuery,
  TimelineStep,
  Unresolved,
  UnresolvedResponse,
} from "../src/index";
import { fixtureFinding } from "./index";
import type { CrewBriefing as ServerCrewBriefing, Digest as ServerDigest } from "../../server/query/briefing";
import { answerQuery } from "../../server/query/answer";
import { briefing, digest } from "../../server/query/briefing";
import { runAgent, stepsFor } from "../../server/agent/runner";
import { applyOperations } from "../../server/model/index";
import { fixtureMessages, fixtureOperations, fixtureScene } from "./index";

// Shapes lifted from server/query, server/agent and server/learning, plus the added API responses.
// Each parses a realistic sample, and real outputs of the server's pure functions round-trip.

const escalate = {
  id: "esc~f-latest_change-m-002-W-12",
  due: "2026-11-13T17:40:00",
  sourceMessageIds: ["m-001", "m-002"],
  kind: "escalate" as const,
  to: "superintendent" as const,
  findingId: "f-latest_change-m-002-W-12",
  fixId: "fix-f-latest_change-m-002-W-12",
  text: "HOLD needs your decision: per the record, W-12 moved 0.4 m east.",
  urgency: "tonight" as const,
};

describe("lifted shapes parse realistic samples", () => {
  it("Question, StructuredQuery, Answer, AskRequest", () => {
    expect(Question.parse({ id: "q-1", time: "2026-11-13T20:01:00", crewId: "crew-plumbing", text: "can we start 204?" }).id).toBe("q-1");
    const q = StructuredQuery.parse({
      kind: "can_i_start",
      crewId: "crew-plumbing",
      taskType: "rough_in_plumbing",
      placeId: "room-204",
      day: "2026-11-14",
      slot: "morning",
    });
    expect(q.kind).toBe("can_i_start");
    expect(() => StructuredQuery.parse({ kind: "where_is" })).toThrow();
    const a = Answer.parse({
      questionId: "q-1",
      kind: "answer",
      text: "HOLD: per the record, W-12 moved 0.4 m east. Sources: m-001.",
      sourceMessageIds: ["m-001"],
      elementIds: ["W-12"],
      query: q,
      findings: [fixtureFinding],
    });
    expect(AskResponse.parse(a)).toEqual(a);
    expect(AskRequest.parse({ text: "where is the 204 east wall?" }).crewId).toBeUndefined();
    expect(() => AskRequest.parse({ text: "" })).toThrow();
  });

  it("Action, CrewProfile, TimelineStep, AgentLogResponse", () => {
    expect(Action.parse(escalate).kind).toBe("escalate");
    expect(() => Action.parse({ ...escalate, sourceMessageIds: [] })).toThrow(); // no source, no action
    expect(
      CrewProfile.parse({
        crewId: "crew-plumbing",
        missedChanges: 1,
        unansweredQuestions: 0,
        approvedFixes: 0,
        risk: "watch",
        evidenceMessageIds: ["m-002"],
      }).risk,
    ).toBe("watch");
    const step = TimelineStep.parse({ time: "2026-11-13T17:40:00", actions: [escalate], queued: [] });
    expect(AgentLogResponse.parse({ timeline: [step], escalations: [escalate] }).escalations).toHaveLength(1);
  });

  it("Unresolved, UnresolvedResponse, ResetResponse", () => {
    const u = Unresolved.parse({ messageId: "m-040", crewId: "crew-drywall", text: "closing up the blue room tmrw" });
    expect(UnresolvedResponse.parse({ items: [u] }).items[0]!.messageId).toBe("m-040");
    expect(ResetResponse.parse({ ok: true, keepLearning: true, learnedCrews: 1, t: "2026-11-13T20:00:00" }).learnedCrews).toBe(1);
    expect(() => ResetResponse.parse({ ok: true, keepLearning: true, learnedCrews: -1, t: "2026-11-13T20:00:00" })).toThrow();
  });
});

describe("real server outputs round-trip through the contracts", () => {
  const scene = applyOperations(fixtureScene, fixtureOperations);
  const messages = fixtureMessages;
  const state = { t: scene.time, scene, findings: [], messages, fixes: [] };

  it("briefing and digest", () => {
    const crewId = scene.crews[0]!.id;
    const day = scene.tasks[0]?.day ?? "2026-11-14";
    const b = briefing(state, crewId, day);
    expect(BriefingResponse.parse(b)).toEqual(CrewBriefing.parse(b));
    const d = digest(state, day);
    expect(DigestResponse.parse(d)).toEqual(Digest.parse(d));
  });

  it("answerQuery", () => {
    const a = answerQuery({ id: "q-2", time: scene.time, text: "where?" }, { kind: "where_is", elementId: scene.elements[0]!.id }, state);
    expect(Answer.parse(a)).toEqual(a);
  });

  it("runAgent timeline", () => {
    const run = runAgent(
      { scene, messages, findings: [fixtureFinding], fixes: [], rehearsals: [], learning: { locationAliases: {}, crewNotes: {} } },
      stepsFor(messages, "2026-11-14T08:00:00"),
    );
    const body = AgentLogResponse.parse({ timeline: run.timeline, escalations: run.escalations });
    expect(body.timeline).toHaveLength(run.timeline.length);
  });
});

describe("the server's own briefing types match the contract", () => {
  it("are assignable both ways", () => {
    expectTypeOf<ServerCrewBriefing>().toExtend<CrewBriefing>();
    expectTypeOf<CrewBriefing>().toExtend<ServerCrewBriefing>();
    expectTypeOf<ServerDigest>().toExtend<Digest>();
    expectTypeOf<Digest>().toExtend<ServerDigest>();
  });
});
