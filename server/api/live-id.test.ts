import { describe, expect, it } from "vitest";
import { liveCacheId, normaliseText } from "./live-id";

describe("live message ids", () => {
  it("normalises case, spaces and trailing punctuation", () => {
    expect(normaliseText("  Tomorrow   we rough in\tthe 204 bath!! ")).toBe("tomorrow we rough in the 204 bath");
  });

  it("same words from the same crew give the same cache id", () => {
    const a = liveCacheId("Tomorrow we rough in the 204 bath.", "crew-plumbing");
    expect(a).toMatch(/^live-[0-9a-f]{10}$/);
    expect(liveCacheId("tomorrow  we rough in the 204 bath", "crew-plumbing")).toBe(a);
  });

  it("another crew or other words give another id", () => {
    const a = liveCacheId("tomorrow we rough in the 204 bath", "crew-plumbing");
    expect(liveCacheId("tomorrow we rough in the 204 bath", "crew-drywall")).not.toBe(a);
    expect(liveCacheId("tomorrow we rough in the 205 bath", "crew-plumbing")).not.toBe(a);
  });
});
