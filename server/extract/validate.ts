import { CrewIntent, ExtractResult, Operation, type ChatMessage, type Scene } from "@site/contracts";
import type { z } from "zod";

// Owner: B. Raw model JSON -> ExtractResult. The model is trusted for facts only:
// ids, time, thread and sourceMessageId are always set here from the message.
// Anything that names an element or crew that is not on record is dropped, never repaired by guessing.

export type Rejection = { reason: string; path: string; detail: string };

export type Normalised = {
  result: ExtractResult;
  /** Items that broke the schema. The caller retries once with these. */
  schemaErrors: string[];
  /** Everything dropped or trimmed, schema errors included. One log line each. */
  rejections: Rejection[];
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function issues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Returns an error string when the reply is not even {operations?: [], intents?: []}. */
export function normalise(raw: unknown, message: ChatMessage, scene: Scene): Normalised | { error: string } {
  if (!isObject(raw)) return { error: "reply is not a JSON object" };
  const rawOps = raw.operations ?? [];
  const rawIntents = raw.intents ?? [];
  if (!Array.isArray(rawOps) || !Array.isArray(rawIntents)) return { error: "operations and intents must be arrays" };

  const mid = message.id;
  const forced = { time: message.time, sourceMessageId: mid, thread: message.thread };
  const known = new Set(scene.elements.map((e) => e.id));
  const crews = new Set(scene.crews.map((c) => c.id));
  const schemaErrors: string[] = [];
  const rejections: Rejection[] = [];
  const reject = (path: string, reason: string, detail: string) => rejections.push({ path, reason, detail });

  /** Keeps known ids, logs the rest. */
  const keepKnown = (ids: unknown, path: string): unknown =>
    Array.isArray(ids)
      ? ids.filter((id) => {
          if (typeof id === "string" && known.has(id)) return true;
          reject(path, "unknown_element_dropped", String(id));
          return false;
        })
      : ids;

  const operations: Operation[] = [];
  rawOps.forEach((rawOp, i) => {
    const path = `operations[${i}]`;
    if (!isObject(rawOp)) {
      schemaErrors.push(`${path}: not an object`);
      reject(path, "schema", "not an object");
      return;
    }
    const candidate: Record<string, unknown> = { ...rawOp, id: `op-${mid}-${i + 1}`, ...forced };
    if (rawOp.type === "plan_task" && isObject(rawOp.task)) {
      candidate.task = {
        ...rawOp.task,
        id: `task-${mid}-${i + 1}`,
        sourceMessageId: mid,
        confidence: rawOp.task.confidence ?? rawOp.confidence,
        elementIds: keepKnown(rawOp.task.elementIds, `${path}.task.elementIds`),
      };
    }
    const parsed = Operation.safeParse(candidate);
    if (!parsed.success) {
      const why = issues(parsed.error);
      schemaErrors.push(`${path}: ${why}`);
      reject(path, "schema", why);
      return;
    }
    const op = parsed.data;
    switch (op.type) {
      case "add":
        if (known.has(op.element.id)) return reject(path, "add_existing_id", op.element.id);
        known.add(op.element.id);
        break;
      case "plan_task":
        if (!crews.has(op.task.crewId)) return reject(path, "unknown_crew", op.task.crewId);
        if (!known.has(op.task.placeId)) return reject(path, "unknown_element", op.task.placeId);
        break;
      default:
        if (!known.has(op.elementId)) return reject(path, "unknown_element", op.elementId);
    }
    operations.push(op);
  });

  const intents: CrewIntent[] = [];
  rawIntents.forEach((rawIntent, i) => {
    const path = `intents[${i}]`;
    if (!isObject(rawIntent)) {
      schemaErrors.push(`${path}: not an object`);
      reject(path, "schema", "not an object");
      return;
    }
    const candidate: Record<string, unknown> = {
      ...rawIntent,
      id: `intent-${mid}-${i + 1}`,
      time: message.time,
      sourceMessageId: mid,
      // The sender's crew states the intent. Only a message with no crew may name one.
      crewId: message.crewId ?? rawIntent.crewId,
      elementIds: keepKnown(rawIntent.elementIds ?? [], `${path}.elementIds`),
    };
    // An unknown place is left out, never guessed (CrewIntent.placeId is optional for this).
    if (candidate.placeId === null || (candidate.placeId !== undefined && !known.has(String(candidate.placeId)))) {
      if (candidate.placeId !== null) reject(`${path}.placeId`, "unknown_place_omitted", String(candidate.placeId));
      delete candidate.placeId;
    }
    const parsed = CrewIntent.safeParse(candidate);
    if (!parsed.success) {
      const why = issues(parsed.error);
      schemaErrors.push(`${path}: ${why}`);
      reject(path, "schema", why);
      return;
    }
    if (!crews.has(parsed.data.crewId)) return void reject(path, "unknown_crew", parsed.data.crewId);
    intents.push(parsed.data);
  });

  return { result: ExtractResult.parse({ messageId: mid, operations, intents }), schemaErrors, rejections };
}
