import { describe, expect, it, vi } from "vitest";
import { fixtureFinding, fixtureLabels, fixtureMessages } from "@site/contracts/fixtures";

const files = vi.hoisted(() => ({ write: vi.fn(async (_path: unknown, _content: unknown) => {}) }));

vi.mock("node:fs/promises", async () => {
  const { fixtureLabels } = await import("@site/contracts/fixtures");
  return { readFile: vi.fn(async () => JSON.stringify(fixtureLabels)), writeFile: files.write };
});
vi.mock("@site/server/load", async () => {
  const { fixtureScene } = await import("@site/contracts/fixtures");
  return { loadGoldenReplay: vi.fn(async () => ({ id: "resolved-fixture", events: [] })), loadStartScene: vi.fn(async () => fixtureScene) };
});
vi.mock("@site/server/replay", async () => {
  const { fixtureFinding, fixtureMessages, fixtureScene } = await import("@site/contracts/fixtures");
  return { runReplay: vi.fn(async () => ({
    findings: [],
    resolvedFindings: [fixtureFinding, { ...fixtureFinding, id: "resolved-false-alarm", sourceMessageId: "m-false", elementIds: ["W-08"] }],
    rehearsals: [], scene: fixtureScene, messages: fixtureMessages,
  })) };
});

describe("evaluation runner", () => {
  it("scores the full live alert history, including resolved catches and resolved false alarms", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await import("./run");
      const results = files.write.mock.calls.map((call) => JSON.parse(String(call[1])));
      const summary = results.find((r) => r.total);
      const detail = results.find((r) => r.findings);
      expect(summary).toMatchObject({ replayId: "resolved-fixture", cases: fixtureLabels.cases.length, total: { caught: 1, missed: 0, falseAlarms: 1 } });
      expect(detail.findings.live).toBe(2);
      expect(detail.cases[0].findingIds).toContain(fixtureFinding.id);
      expect(detail.perTrigger.live).toEqual(summary.total);
      expect(detail.messages.total).toBe(fixtureMessages.length);
    } finally {
      log.mockRestore();
    }
  });
});
