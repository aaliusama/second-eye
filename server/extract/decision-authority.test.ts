import { describe, expect, it } from "vitest";
import type { ChatMessage, Scene } from "@site/contracts";
import { applyOperations } from "../model/index";
import { loadStartScene } from "../model/load";
import { MessageFacts } from "./facts";
import { toResult } from "./result";

// Owner: B. A question or a crew's claim never settles a decision (docs/live-latency.md bug 1). No network:
// the model's reply shape is fed in directly.

const D2: ChatMessage = {
  id: "m-live-d2",
  time: "2026-11-13T16:30:00",
  thread: "site-group",
  senderName: "Luca (Sorel Tiling)",
  senderRole: "crew_lead",
  crewId: "crew-tiling",
  text: "we lay the 205 bath tile all day saturday, owner approved it right?",
  kind: "text",
};

// What the live model answered for D2: no plan, the tile approved with confidence 1.
const d2Reply = MessageFacts.parse({
  id: D2.id,
  plans: [],
  changes: [{ kind: "status", elementId: "tile-205-bath", state: "approved", confidence: 1 }],
});

async function sceneWithProposedTile(): Promise<Scene> {
  const scene = await loadStartScene();
  return { ...scene, elements: scene.elements.map((e) => (e.id === "tile-205-bath" ? { ...e, state: "proposed" as const } : e)) };
}

const tileState = (s: Scene) => s.elements.find((e) => e.id === "tile-205-bath")!.state;

describe("only a deciding sender, stating it, settles a decision", () => {
  it("the D2 repro: a crew lead's question does not approve the 205 tile; it stays proposed", async () => {
    const scene = await sceneWithProposedTile();
    const r = toResult(D2, d2Reply, scene);
    expect(r.operations.filter((o) => o.type === "set_status")).toEqual([]);
    expect(tileState(applyOperations(scene, r.operations))).toBe("proposed");
  });

  it("a crew lead stating it without a question still does not approve", async () => {
    const scene = await sceneWithProposedTile();
    const r = toResult({ ...D2, text: "owner approved the 205 bath tile" }, d2Reply, scene);
    expect(r.operations).toEqual([]);
  });

  it("a crew lead cannot move a proposed element to built or unconfirmed either", async () => {
    const scene = await sceneWithProposedTile();
    for (const state of ["built", "unconfirmed"] as const) {
      const reply = MessageFacts.parse({ id: D2.id, changes: [{ kind: "status", elementId: "tile-205-bath", state, confidence: 0.9 }] });
      expect(toResult({ ...D2, text: "205 bath tile done" }, reply, scene).operations).toEqual([]);
    }
  });

  it("the architect asking a question does not approve", async () => {
    const scene = await sceneWithProposedTile();
    const r = toResult({ ...D2, senderName: "Lena", senderRole: "architect", crewId: undefined }, d2Reply, scene);
    expect(r.operations).toEqual([]);
  });

  it("the architect stating it approves", async () => {
    const scene = await sceneWithProposedTile();
    const msg: ChatMessage = { ...D2, senderName: "Lena", senderRole: "architect", crewId: undefined, thread: "office", text: "Owner confirmed the 205 bath tile. Approved." };
    const r = toResult(msg, d2Reply, scene);
    expect(r.operations).toEqual([expect.objectContaining({ type: "set_status", elementId: "tile-205-bath", state: "approved", sourceMessageId: msg.id })]);
    expect(tileState(applyOperations(scene, r.operations))).toBe("approved");
  });

  it("the plan in the same message is kept when the model gives it", async () => {
    const scene = await sceneWithProposedTile();
    const reply = MessageFacts.parse({
      ...d2Reply,
      plans: [{ day: "2026-11-14", slot: "full_day", taskType: "tile", placeId: "room-205", elementIds: ["tile-205-bath"], description: "Lay the 205 bath tile", confidence: 0.9 }],
    });
    const r = toResult(D2, reply, scene);
    expect(r.operations.map((o) => o.type)).toEqual(["plan_task"]);
    expect(r.intents).toHaveLength(1);
  });
});
