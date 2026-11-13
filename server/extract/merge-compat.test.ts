import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import { extract } from "./index";
import { groqFacts } from "./llm";

vi.mock("./llm", () => ({ groqFacts: vi.fn(), groqModel: () => "test-model" }));
vi.mock("node:fs/promises", async (original) => ({
  ...await original<typeof import("node:fs/promises")>(),
  mkdir: vi.fn(), writeFile: vi.fn(),
}));

const ctx = { locationAliases: {}, crewNotes: {} };
const message = { ...fixtureMessages[0]!, id: "merge-compat-no-cache" };

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("merged extraction behavior", () => {
  it("prefers existing caches even with live extraction enabled", async () => {
    vi.stubEnv("LIVE_LLM", "1");
    expect((await extract(fixtureMessages[0]!, ctx, fixtureScene)).messageId).toBe("m-001");
    expect(groqFacts).not.toHaveBeenCalled();
  });

  it("does not call the LLM for an offline cache miss", async () => {
    vi.stubEnv("LIVE_LLM", "0");
    expect(await extract(message, ctx, fixtureScene)).toEqual({ messageId: message.id, operations: [], intents: [] });
    expect(groqFacts).not.toHaveBeenCalled();
  });

  it("measures a live move from the current scene rather than the starting floor", async () => {
    vi.stubEnv("LIVE_LLM", "1");
    const scene = structuredClone(fixtureScene);
    scene.elements.find((e) => e.id === "W-12")!.geometry = { kind: "segment", from: [20, 2], to: [20, 5], thickness: 0.12 };
    vi.mocked(groqFacts).mockResolvedValueOnce([{
      id: message.id, plans: [], changes: [{ kind: "move", elementId: "W-12", direction: "east", metres: 0.4, confidence: 0.9 }],
    }]);
    const result = await extract(message, ctx, scene);
    expect(groqFacts).toHaveBeenCalledWith([message], scene);
    expect(result.operations[0]).toMatchObject({ type: "move", sourceMessageId: message.id, to: { from: [20.4, 2], to: [20.4, 5] } });
  });

  it("returns an empty result when the live provider fails", async () => {
    vi.stubEnv("LIVE_LLM", "1");
    vi.mocked(groqFacts).mockRejectedValueOnce(new Error("provider unavailable"));
    expect(await extract(message, ctx, fixtureScene)).toEqual({ messageId: message.id, operations: [], intents: [] });
  });
});
