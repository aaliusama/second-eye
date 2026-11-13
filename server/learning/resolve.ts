import type { ChatMessage, ExtractResult, Id, LearningContext, Scene } from "@site/contracts";

// Owner: A. Learning applied to extraction output, by rule, after the LLM (or its cache).
// An intent whose place the extraction could not tell gets one if the message names exactly one
// known nickname: an element alias in the scene or a stored location_alias correction.
// No match or more than one match: the intent stays without a place and is reported unresolved,
// so the superintendent can map the nickname (POST /api/corrections) and the next run knows it.

export interface Unresolved {
  messageId: Id;
  crewId?: Id;
  text: string;
}

export interface Resolved {
  result: ExtractResult;
  unresolved: Unresolved[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every known nickname (lower case) and the element it names. */
function nicknames(scene: Scene, ctx: LearningContext): Map<string, Set<Id>> {
  const map = new Map<string, Set<Id>>();
  const add = (alias: string, id: Id) => {
    const key = alias.trim().toLowerCase();
    if (!key) return;
    (map.get(key) ?? map.set(key, new Set()).get(key)!).add(id);
  };
  for (const el of scene.elements) for (const a of el.aliases) add(a, el.id);
  for (const [alias, id] of Object.entries(ctx.locationAliases)) add(alias, id);
  return map;
}

/** Element ids named by a nickname in the text, matched on word boundaries. Sorted. */
export function placesNamed(text: string, scene: Scene, ctx: LearningContext): Id[] {
  const lower = text.toLowerCase();
  const found = new Set<Id>();
  for (const [alias, ids] of nicknames(scene, ctx)) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escape(alias)}($|[^\\p{L}\\p{N}])`, "u").test(lower)) {
      for (const id of ids) found.add(id);
    }
  }
  return [...found].sort();
}

/** Pure: returns a new result; the input is not mutated. */
export function resolvePlaces(result: ExtractResult, message: ChatMessage, scene: Scene, ctx: LearningContext): Resolved {
  const open = result.intents.filter((i) => i.placeId === undefined);
  if (open.length === 0) return { result, unresolved: [] };

  const named = placesNamed(message.text, scene, ctx).filter((id) => scene.elements.some((e) => e.id === id));
  if (named.length !== 1) {
    return { result, unresolved: [{ messageId: message.id, crewId: message.crewId, text: message.text }] };
  }
  const placeId = named[0]!;
  return {
    result: { ...result, intents: result.intents.map((i) => (i.placeId === undefined ? { ...i, placeId } : i)) },
    unresolved: [],
  };
}
