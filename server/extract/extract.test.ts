import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@site/contracts";
import { fixtureScene, W12_BEFORE } from "@site/contracts/fixtures";
import { BatchReply, type MessageFacts } from "./facts";
import { systemPrompt, userPrompt } from "./llm";
import { toResult, translate } from "./result";

// Owner: B. The rule layer between the LLM's facts and the contract. No network.

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m-900",
  time: "2026-11-13T17:40:00",
  thread: "site-group",
  senderName: "Marek (Novak Plumbing)",
  senderRole: "crew_lead",
  crewId: "crew-plumbing",
  text: "tomorrow morning we rough in the 204 bath along the east wall",
  kind: "text",
  ...over,
});

const facts = (over: Partial<MessageFacts> = {}): MessageFacts => ({ id: "m-900", plans: [], changes: [], ...over });

const plan = {
  day: "2026-11-14",
  slot: "morning" as const,
  taskType: "rough_in_plumbing" as const,
  placeId: "room-204",
  elementIds: ["W-12"],
  description: "Rough in the 204 bathroom along the east wall",
  confidence: 0.9,
};

describe("toResult", () => {
  it("a plan with a known place becomes one plan_task and one intent, sourced", () => {
    const r = toResult(msg(), facts({ plans: [plan] }), fixtureScene);
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0]).toMatchObject({ type: "plan_task", sourceMessageId: "m-900", task: { crewId: "crew-plumbing", placeId: "room-204", elementIds: ["W-12"] } });
    expect(r.intents).toEqual([expect.objectContaining({ placeId: "room-204", sourceMessageId: "m-900", day: "2026-11-14" })]);
  });

  it("a nickname place stays empty: intent only, no plan_task, nothing guessed", () => {
    const r = toResult(msg({ text: "tmrw we board the blue room" }), facts({ plans: [{ ...plan, placeId: null, placeSaid: "the blue room", elementIds: [] }] }), fixtureScene);
    expect(r.operations).toHaveLength(0);
    expect(r.intents).toHaveLength(1);
    expect(r.intents[0]!.placeId).toBeUndefined();
  });

  it("ids the floor does not have are dropped, a wall is not a place", () => {
    const r = toResult(msg(), facts({ plans: [{ ...plan, placeId: "W-12", elementIds: ["W-12", "W-99"] }] }), fixtureScene);
    expect(r.operations).toHaveLength(0);
    expect(r.intents[0]).toMatchObject({ elementIds: ["W-12"] });
    expect(r.intents[0]!.placeId).toBeUndefined();
  });

  it("plans from someone who is not a crew are ignored", () => {
    const r = toResult(msg({ crewId: undefined, senderRole: "superintendent" }), facts({ plans: [plan] }), fixtureScene);
    expect(r.operations).toHaveLength(0);
    expect(r.intents).toHaveLength(0);
  });

  it("only plans for the day after the message count; a later day in a progress report is dropped", () => {
    const later = { ...plan, day: "2026-11-16", description: "coat 2 monday" };
    const r = toResult(msg(), facts({ plans: [later, plan] }), fixtureScene);
    expect(r.intents.map((i) => i.day)).toEqual(["2026-11-14"]);
    expect(r.operations).toHaveLength(1);
  });

  it("a move with direction and distance is measured by rule from the current geometry", () => {
    const scene = structuredClone(fixtureScene);
    scene.elements.find((e) => e.id === "W-12")!.geometry = W12_BEFORE;
    const r = toResult(msg({ thread: "office", crewId: undefined }), facts({ changes: [{ kind: "move", elementId: "W-12", direction: "east", metres: 0.4, confidence: 0.9 }] }), scene);
    expect(r.operations[0]).toMatchObject({ type: "move", elementId: "W-12", note: "40 cm east", thread: "office", to: { kind: "segment", from: [18.4, 2], to: [18.4, 5] } });
  });

  it("a move without a direction is unconfirmed, never guessed", () => {
    const r = toResult(msg({ crewId: undefined }), facts({ changes: [{ kind: "move", elementId: "W-12", direction: null, metres: 0.4, confidence: 0.5 }] }), fixtureScene);
    expect(r.operations).toEqual([expect.objectContaining({ type: "set_status", elementId: "W-12", state: "unconfirmed", confidence: 0.5 })]);
  });

  it("a status change on an unknown element is dropped", () => {
    const r = toResult(msg(), facts({ changes: [{ kind: "status", elementId: "tile-999", state: "proposed", confidence: 0.9 }] }), fixtureScene);
    expect(r.operations).toHaveLength(0);
  });

  it("same input, same output", () => {
    const f = facts({ plans: [plan], changes: [{ kind: "status", elementId: "W-08", state: "built", confidence: 0.8 }] });
    expect(toResult(msg(), f, fixtureScene)).toEqual(toResult(msg(), f, fixtureScene));
  });
});

describe("translate and prompt", () => {
  it("moves points and polygons too", () => {
    expect(translate({ kind: "point", at: [1, 1] }, 0, -0.15)).toEqual({ kind: "point", at: [1, 0.85] });
    expect(translate({ kind: "polygon", points: [[0, 0], [1, 0], [1, 1]] }, 1, 0)).toEqual({ kind: "polygon", points: [[1, 0], [2, 0], [2, 1]] });
  });

  it("the prompt lists floor ids and never gives the model nicknames", () => {
    const scene = structuredClone(fixtureScene); // fixture room-204 has the alias "the blue room"
    const p = systemPrompt(scene) + userPrompt([msg()], scene);
    expect(p).toContain("room-204");
    expect(p).not.toContain("blue room");
    expect(p).toContain("Friday 2026-11-13 17:40");
  });

  it("the reply schema fills missing lists", () => {
    expect(BatchReply.parse({ results: [{ id: "m-1" }] }).results[0]).toEqual({ id: "m-1", plans: [], changes: [] });
  });
});
