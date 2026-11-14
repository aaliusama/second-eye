import { describe, expect, it } from "vitest";
import type { Crew, Element, Scene } from "@site/contracts";
import { knownGeometry } from "../../server/checks/geometry";
import { beliefGeometry, flaggedPairs, knowledgeMatrix } from "./derive";

const crew = (id: string, threads: string[]): Crew => ({ id, name: id, trade: "general", letter: id[0].toUpperCase(), threads });
const seg = (x: number) => ({ kind: "segment" as const, from: [x, 0] as [number, number], to: [x, 3] as [number, number], thickness: 0.1 });
const wall: Element = {
  id: "W-1", type: "wall", name: "East wall", aliases: [], geometry: seg(5.4), state: "approved", version: 3,
  history: [
    { version: 1, time: "2026-11-12T07:00:00", sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add", geometry: seg(5), confidence: 1 },
    { version: 2, time: "2026-11-12T09:00:00", sourceMessageId: "m-1", thread: "site-group", operationType: "move", geometry: seg(5.2), confidence: 0.9 },
    { version: 3, time: "2026-11-12T14:00:00", sourceMessageId: "m-2", thread: "office", operationType: "move", geometry: seg(5.4), confidence: 0.9 },
  ],
};
const plumber = crew("plumbing", ["site-group"]);
const painter = crew("painting", ["site-group", "office"]);
const drywall = crew("drywall", []);
const scene: Scene = { floorId: "L2", name: "Level 2", time: "2026-11-12T15:00:00", elements: [wall], crews: [plumber, painter, drywall], tasks: [] };

describe("who knows what", () => {
  it("matches the checks' rule for every crew", () => {
    for (const c of scene.crews) expect(beliefGeometry(wall, c)).toEqual(knownGeometry(wall, c));
  });

  it("gives each crew the latest change it could have heard", () => {
    expect(beliefGeometry(wall, plumber)).toEqual(seg(5.2));
    expect(beliefGeometry(wall, painter)).toEqual(seg(5.4));
    expect(beliefGeometry(wall, drywall)).toEqual(seg(5));
    expect(beliefGeometry(wall, undefined)).toEqual(wall.geometry);
  });

  it("counts distinct versions of the floor and marks only flagged pairs red", () => {
    const { rows, versions } = knowledgeMatrix(scene, flaggedPairs([{ crewIds: ["plumbing"], elementIds: ["W-1"] } as never]));
    expect(versions).toBe(3);
    expect(rows.map((r) => r.cells.map((c) => (c.heard ? "H" : c.exposed ? "X" : "-")).join(""))).toEqual(["HH-", "XH-"]);
  });
});
