import { describe, expect, it } from "vitest";
import { ChatMessage, ExtractResult, Finding, Fix, LabelSet, Scene } from "../src/index";
import {
  fixtureExtractResults,
  fixtureFinding,
  fixtureFix,
  fixtureLabels,
  fixtureMessages,
  fixtureScene,
} from "./index";

describe("fixtures match the contracts", () => {
  it("messages", () => fixtureMessages.forEach((m) => expect(() => ChatMessage.parse(m)).not.toThrow()));
  it("extract results", () => fixtureExtractResults.forEach((r) => expect(() => ExtractResult.parse(r)).not.toThrow()));
  it("scene", () => expect(() => Scene.parse(fixtureScene)).not.toThrow());
  it("finding", () => expect(() => Finding.parse(fixtureFinding)).not.toThrow());
  it("fix", () => expect(() => Fix.parse(fixtureFix)).not.toThrow());
  it("labels", () => expect(() => LabelSet.parse(fixtureLabels)).not.toThrow());

  it("every element's version matches its history", () => {
    for (const el of fixtureScene.elements) expect(el.history.at(-1)?.version).toBe(el.version);
  });
});
