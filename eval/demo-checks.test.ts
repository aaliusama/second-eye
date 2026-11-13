import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Finding, Fix } from "@site/contracts";
import { loadGoldenReplay, loadStartScene } from "@site/server/load";
import { runReplay } from "@site/server/replay";
import { rehearsalFindings } from "./score";

// Acceptance checks on the real offline replay. These do not replace the independent labels.
let state: Awaited<ReturnType<typeof runReplay>>;

beforeAll(async () => {
  vi.stubEnv("LIVE_LLM", "0");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("The golden demo must run offline"); }));
  state = await runReplay(await loadGoldenReplay(), await loadStartScene());
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("C's four planted demo incidents on the full golden replay", () => {
  it.each([
    ["latest_change", "m-002", "W-12"],
    ["space_clash", "m-170", "room-206"],
    ["order_of_work", "m-175", "W-08"],
    ["open_decision", "m-172", "tile-205-bath"],
  ])("catches %s with its source and affected element", (check, source, element) => {
    const findings = [...state.findings, ...state.resolvedFindings, ...rehearsalFindings(state.rehearsals)];
    const hit = findings.find((f) => f.check === check &&
      [f.sourceMessageId, ...f.evidenceMessageIds].includes(source) && f.elementIds.includes(element));
    expect(hit).toBeDefined();
    expect(Finding.parse(hit)).toEqual(hit);
    if (check === "latest_change") expect(hit!.ghost).toMatchObject({ elementId: "W-12", label: "0.4 m east" });
  });

  it("retains a valid sourced fix for every open finding and produces both rehearsal slots", () => {
    for (const finding of state.findings) {
      const fix = state.fixes.find((f) => f.findingId === finding.id);
      expect(fix).toBeDefined();
      expect(Fix.parse(fix)).toEqual(fix);
      expect(fix!.sourceMessageId).toBe(finding.sourceMessageId);
    }
    const saturday = state.rehearsals.find((r) => r.day === "2026-11-14")!;
    expect(saturday.frames.map((f) => f.time)).toEqual(["2026-11-14T07:00:00", "2026-11-14T12:00:00"]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
