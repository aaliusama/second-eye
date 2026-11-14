import { ExtractResult, type ChatMessage, type CrewIntent, type Geometry, type Operation, type Scene } from "@site/contracts";
import type { MessageFacts } from "./facts";

// Owner: B. Facts from the LLM -> ExtractResult, by rule. Pure: same facts and scene, same result.
// - Ids the floor does not have are dropped, never mapped to something close.
// - A place that is not a room or zone id stays empty: intent only, no plan_task. Learning resolves nicknames later.
// - A move without a direction or distance becomes set_status "unconfirmed" with the confidence. Never guessed.
// - Plans count only from a crew sender (the crew is the sender's crew), and only for the day after the message:
//   the plan the evening rehearsal plays. "coat 2 monday" in a Friday progress report is not tomorrow's plan.

const STEP: Record<"north" | "south" | "east" | "west", [number, number]> = {
  north: [0, 1],
  south: [0, -1],
  east: [1, 0],
  west: [-1, 0],
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function translate(g: Geometry, dx: number, dy: number): Geometry {
  const p = ([x, y]: [number, number]): [number, number] => [r3(x + dx), r3(y + dy)];
  if (g.kind === "segment") return { ...g, from: p(g.from), to: p(g.to) };
  if (g.kind === "point") return { ...g, at: p(g.at) };
  return { ...g, points: g.points.map(p) };
}

/** "2026-11-13T17:40:00" -> "2026-11-14". Calendar math on the replay time only. */
export function dayAfter(t: string): string {
  const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Grounding. An element whose name carries a unit number ("Unit 202 corridor wall") counts only when
 * the message says that number or one of the element's nicknames. The model picking a neighbouring
 * unit's wall is dropped, not corrected: no id is ever mapped to something close.
 */
export function grounded(text: string, el: { name: string; aliases: string[] }): boolean {
  const unit = /\b(\d{3})\b/.exec(el.name)?.[1];
  if (!unit) return true;
  const said = text.toLowerCase();
  return new RegExp(`\\b${unit}\\b`).test(said) || el.aliases.some((a) => said.includes(a.toLowerCase()));
}

export function toResult(message: ChatMessage, facts: MessageFacts, scene: Scene): ExtractResult {
  const byId = new Map(scene.elements.map((e) => [e.id, e]));
  const isPlace = (id: string | null) => id !== null && ["room", "zone"].includes(byId.get(id)?.type ?? "");
  const said = (id: string) => {
    const el = byId.get(id);
    return el !== undefined && grounded(message.text, el);
  };
  const operations: Operation[] = [];
  const intents: CrewIntent[] = [];
  let n = 0;
  const base = (confidence: number) => {
    n++;
    return { id: `op-${message.id}-${n}`, time: message.time, sourceMessageId: message.id, thread: message.thread, confidence };
  };

  for (const c of facts.changes) {
    const el = byId.get(c.elementId);
    if (!el || !said(el.id)) continue;
    if (c.kind === "status") {
      operations.push({ ...base(c.confidence), type: "set_status", elementId: el.id, state: c.state });
    } else if (c.direction && c.metres) {
      const [sx, sy] = STEP[c.direction];
      const cm = Math.round(c.metres * 100);
      operations.push({
        ...base(c.confidence),
        type: "move",
        elementId: el.id,
        to: translate(el.geometry, sx * c.metres, sy * c.metres),
        note: `${cm} cm ${c.direction}`,
      });
    } else {
      operations.push({ ...base(c.confidence), type: "set_status", elementId: el.id, state: "unconfirmed" });
    }
  }

  if (message.crewId) {
    const crewId = message.crewId;
    const tomorrow = dayAfter(message.time);
    facts.plans.filter((p) => p.day === tomorrow).forEach((p, order) => {
      const elementIds = [...new Set(p.elementIds.filter((id) => byId.has(id) && said(id)))];
      const shared = { crewId, day: p.day, slot: p.slot, taskType: p.taskType, description: p.description, elementIds, confidence: p.confidence };
      const b = base(p.confidence);
      const suffix = b.id.slice(3);
      if (p.status === "cancelled") {
        // A dropped plan cancels what is on record; it is not an intent to work. Needs a clear place.
        if (isPlace(p.placeId)) {
          const task = { id: `task-${suffix}`, ...shared, order, placeId: p.placeId!, status: "cancelled" as const, sourceMessageId: message.id };
          operations.push({ ...b, type: "plan_task", task });
        }
        return;
      }
      if (isPlace(p.placeId)) {
        const task = { id: `task-${suffix}`, ...shared, order, placeId: p.placeId!, status: "planned" as const, sourceMessageId: message.id };
        operations.push({ ...b, type: "plan_task", task });
        intents.push({ id: `intent-${suffix}`, time: message.time, sourceMessageId: message.id, ...shared, placeId: p.placeId! });
      } else {
        intents.push({ id: `intent-${suffix}`, time: message.time, sourceMessageId: message.id, ...shared });
      }
    });
  }

  return ExtractResult.parse({ messageId: message.id, operations, intents });
}
