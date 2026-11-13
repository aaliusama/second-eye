import { describe, expect, it } from "vitest";
import type { ChatMessage, ExtractResult, LearningContext, Scene } from "@site/contracts";
import { fixtureIntent, fixtureScene } from "@site/contracts/fixtures";
import { placesNamed, resolvePlaces } from "./resolve";

/** Own scene: no nickname on any element, so run 1 cannot know "the blue room". */
const scene: Scene = { ...fixtureScene, elements: fixtureScene.elements.map((e) => ({ ...e, aliases: [] })) };
const empty: LearningContext = { locationAliases: {}, crewNotes: {} };
const learned: LearningContext = { locationAliases: { "the blue room": "room-204" }, crewNotes: {} };

const message = (text: string): ChatMessage => ({
  id: "m-blue",
  time: "2026-11-13T18:10:00",
  thread: "site-group",
  senderName: "Tom (Walsh Drywall)",
  senderRole: "crew_lead",
  crewId: "crew-drywall",
  text,
  kind: "text",
});

const { placeId: _drop, ...noPlace } = fixtureIntent;
const unsure: ExtractResult = {
  messageId: "m-blue",
  operations: [],
  intents: [{ ...noPlace, id: "intent-blue", crewId: "crew-drywall", sourceMessageId: "m-blue", taskType: "close_wall" }],
};

describe("resolvePlaces", () => {
  it("leaves an unknown nickname unresolved and reports the message", () => {
    const r = resolvePlaces(unsure, message("we close up the blue room tomorrow"), scene, empty);
    expect(r.result.intents[0]!.placeId).toBeUndefined();
    expect(r.unresolved).toEqual([{ messageId: "m-blue", crewId: "crew-drywall", text: "we close up the blue room tomorrow" }]);
  });

  it("fills the place from a learned nickname, matched on word boundaries and any case", () => {
    const before = structuredClone(unsure);
    const r = resolvePlaces(unsure, message("We close up The Blue Room tomorrow."), scene, learned);
    expect(r.result.intents[0]!.placeId).toBe("room-204");
    expect(r.unresolved).toEqual([]);
    expect(unsure).toEqual(before); // input not mutated
  });

  it("also uses aliases already on scene elements", () => {
    const withAlias: Scene = {
      ...scene,
      elements: scene.elements.map((e) => (e.id === "room-203" ? { ...e, aliases: ["the corner unit"] } : e)),
    };
    expect(resolvePlaces(unsure, message("the corner unit, morning"), withAlias, empty).result.intents[0]!.placeId).toBe("room-203");
  });

  it("does not guess when two places are named, or on a partial word", () => {
    const two: LearningContext = { locationAliases: { "the blue room": "room-204", "the corner": "room-203" }, crewNotes: {} };
    expect(resolvePlaces(unsure, message("the blue room or the corner"), scene, two).unresolved).toHaveLength(1);
    expect(placesNamed("the blue roomy bit", scene, learned)).toEqual([]);
  });

  it("ignores a nickname pointing at an element that is not in the scene", () => {
    const ghost: LearningContext = { locationAliases: { "the blue room": "room-999" }, crewNotes: {} };
    expect(resolvePlaces(unsure, message("the blue room"), scene, ghost).unresolved).toHaveLength(1);
  });

  it("returns the same result object when every intent already has a place", () => {
    const sure: ExtractResult = { messageId: "m-002", operations: [], intents: [fixtureIntent] };
    const r = resolvePlaces(sure, message("the blue room"), scene, learned);
    expect(r.result).toBe(sure);
    expect(r.unresolved).toEqual([]);
  });
});
