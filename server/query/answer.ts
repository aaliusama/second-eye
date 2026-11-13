import type { ChatMessage, CrewIntent, Element, ElementChange, Finding, Fix, PlanTask, Point, Scene, Slot } from "@site/contracts";
import { heardThread, knownGeometry, midpoint, moveLabel, sameGeometry, unheardGeometryChanges } from "../checks/geometry";
import { runChecks } from "../checks/index";
import { slotsOverlap } from "../checks/rules";
import { getPlan } from "../model/index";
import type { Answer, Question, StructuredQuery } from "./schema";

// Owner: E. StructuredQuery -> Answer. Pure and deterministic: same record, same answer.
// No LLM here. Rules answer from the record; decisions go to the superintendent.

/** What the answers read. The lead's API passes the live session. */
export interface QueryState {
  /** Session replay time ("now"). */
  t: string;
  scene: Scene;
  findings: Finding[];
  messages: ChatMessage[];
  fixes: Fix[];
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-14" -> "Sat 14 Nov". */
export function dayText(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
/** "2026-11-12T14:02:00" -> "Thu 12 Nov 14:02". */
export const timeText = (t: string) => `${dayText(t)} ${t.slice(11, 16)}`;
export const SLOT_TEXT: Record<Slot, string> = { morning: "morning", afternoon: "afternoon", full_day: "all day" };

export const crewName = (s: Scene, id: string) => s.crews.find((c) => c.id === id)?.name ?? id;
export const elementName = (s: Scene, id: string) => s.elements.find((e) => e.id === id)?.name ?? id;
const taskWords = (t: string) => t.replace(/_/g, " ");

const NOT_FOUND = "I could not tell what you asked; forwarded to the superintendent.";

export function notFound(q: Question, reason = "question not understood"): Answer {
  return {
    questionId: q.id,
    kind: "not_found",
    text: NOT_FOUND,
    sourceMessageIds: [],
    elementIds: [],
    escalation: { to: "superintendent", reason },
  };
}

/** Is a point inside a polygon (ray casting)? */
function inside([x, y]: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A place and the elements whose midpoint lies inside it (walls on its edge count, nudged inward). */
export function elementsAt(scene: Scene, placeId: string): Element[] {
  const place = scene.elements.find((e) => e.id === placeId);
  if (!place) return [];
  if (place.geometry.kind !== "polygon") return [place];
  const poly = place.geometry.points;
  const [cx, cy] = midpoint(place.geometry);
  const within = scene.elements.filter((e) => {
    if (e.id === placeId || e.type === "room" || e.type === "zone") return false;
    const [mx, my] = midpoint(e.geometry);
    // Nudge 5 cm toward the place centre so a wall on the boundary counts.
    const len = Math.hypot(cx - mx, cy - my) || 1;
    return inside([mx + ((cx - mx) / len) * 0.05, my + ((cy - my) / len) * 0.05], poly);
  });
  return [place, ...within];
}

/** Changes after the first drawing entry, newest first. */
function realChanges(el: Element, since?: string): ElementChange[] {
  return [...el.history]
    .filter((h) => h.version > 1 && !h.sourceMessageId.startsWith("drawing:") && (since === undefined || h.time > since))
    .sort((a, b) => b.version - a.version);
}

function changeText(scene: Scene, el: Element, h: ElementChange, prev?: ElementChange): string {
  if (h.operationType === "move" && h.geometry) {
    const before = prev?.geometry;
    const label = before && !sameGeometry(before, h.geometry) ? moveLabel(before, h.geometry) : "moved";
    return `${el.name} moved ${label} (${h.sourceMessageId}, ${timeText(h.time)}, ${h.thread} thread)`;
  }
  if (h.state) return `${el.name} set to ${h.state} (${h.sourceMessageId}, ${timeText(h.time)}, ${h.thread} thread)`;
  return `${el.name} changed (${h.sourceMessageId}, ${timeText(h.time)})`;
}

/** The latest geometry entry before version v. */
const geometryBefore = (el: Element, v: number) =>
  [...el.history].filter((h) => h.version < v && h.geometry).sort((a, b) => b.version - a.version)[0];

function taskLine(scene: Scene, t: PlanTask, withCrew = true): string {
  const who = withCrew ? `${crewName(scene, t.crewId)}: ` : "";
  return `${dayText(t.day)} ${SLOT_TEXT[t.slot]}, ${who}${t.description} in ${elementName(scene, t.placeId)} (${t.sourceMessageId})`;
}

// ---------- One function per query kind ----------

function whatsPlanned(q: Question, query: Extract<StructuredQuery, { kind: "whats_planned" }>, s: QueryState): Answer {
  const from = q.time.slice(0, 10);
  const tasks = s.scene.tasks
    .filter((t) => t.status === "planned")
    .filter((t) => (query.day ? t.day === query.day : t.day >= from))
    .filter((t) => query.placeId === undefined || t.placeId === query.placeId)
    .filter((t) => query.crewId === undefined || t.crewId === query.crewId);
  const days = uniq(tasks.map((t) => t.day)).sort();
  const ordered = days.flatMap((d) => getPlan({ ...s.scene, tasks }, d).tasks);
  const where = query.placeId ? ` in ${elementName(s.scene, query.placeId)}` : "";
  const who = query.crewId ? ` for ${crewName(s.scene, query.crewId)}` : "";
  const when = query.day ? ` on ${dayText(query.day)}` : "";
  if (ordered.length === 0) {
    return {
      questionId: q.id,
      kind: "answer",
      text: `Per the record, nothing is planned${where}${who}${when}.`,
      sourceMessageIds: [],
      elementIds: query.placeId ? [query.placeId] : [],
      query,
    };
  }
  const holds = s.findings.filter((f) => f.severity === "hold" && f.taskIds.some((id) => ordered.some((t) => t.id === id)));
  const holdText = holds.length ? ` ${holds.length} on hold: ${uniq(holds.map((f) => f.summary)).join(" ")}` : "";
  return {
    questionId: q.id,
    kind: "answer",
    text: `Per the record${where}${who}${when}: ${ordered.map((t) => taskLine(s.scene, t, !query.crewId)).join("; ")}.${holdText}`,
    sourceMessageIds: uniq([...ordered.map((t) => t.sourceMessageId), ...holds.flatMap((f) => f.evidenceMessageIds)]),
    elementIds: uniq([...(query.placeId ? [query.placeId] : []), ...ordered.flatMap((t) => [t.placeId, ...t.elementIds])]),
    query,
  };
}

function whereIs(q: Question, query: Extract<StructuredQuery, { kind: "where_is" }>, s: QueryState): Answer {
  const el = s.scene.elements.find((e) => e.id === query.elementId)!;
  const latest = [...el.history].filter((h) => h.geometry).sort((a, b) => b.version - a.version)[0];
  const g = el.geometry;
  const where =
    g.kind === "segment"
      ? `runs from (${g.from.join(", ")}) to (${g.to.join(", ")}) m`
      : g.kind === "point"
        ? `is at (${g.at.join(", ")}) m`
        : `is the area around (${midpoint(g).map((v) => v.toFixed(1)).join(", ")}) m`;
  const sources = latest ? [latest.sourceMessageId] : [];
  let text = `Per the record, ${el.name} ${where}, version ${el.version}, state ${el.state}`;
  text += latest && !latest.sourceMessageId.startsWith("drawing:") ? `, last moved per ${latest.sourceMessageId} (${timeText(latest.time)}).` : ", as drawn.";

  const crew = s.scene.crews.find((c) => c.id === q.crewId);
  if (crew) {
    const missed = unheardGeometryChanges(el, crew);
    const heard = knownGeometry(el, crew);
    if (missed.length > 0 && !sameGeometry(heard, el.geometry)) {
      text = `HOLD: ${text} You may have the old line: it moved ${moveLabel(heard, el.geometry)} in the ${uniq(missed.map((m) => m.thread)).join(", ")} thread, which you do not read.`;
      sources.push(...missed.map((m) => m.sourceMessageId));
    }
  }
  return { questionId: q.id, kind: "answer", text, sourceMessageIds: uniq(sources), elementIds: [el.id], query };
}

function whatChanged(q: Question, query: Extract<StructuredQuery, { kind: "what_changed" }>, s: QueryState): Answer {
  const els = query.elementId
    ? s.scene.elements.filter((e) => e.id === query.elementId)
    : elementsAt(s.scene, query.placeId!);
  const crew = s.scene.crews.find((c) => c.id === q.crewId);
  const lines: string[] = [];
  const sources: string[] = [];
  const touched: string[] = [];
  let unheard = 0;
  for (const el of els) {
    for (const h of realChanges(el, query.since)) {
      const missed = crew ? !heardThread(h.thread, crew) : false;
      if (missed) unheard++;
      lines.push(changeText(s.scene, el, h, geometryBefore(el, h.version)) + (missed ? " - not in a thread you read" : ""));
      sources.push(h.sourceMessageId);
      touched.push(el.id);
    }
  }
  const subject = query.elementId ? elementName(s.scene, query.elementId) : elementName(s.scene, query.placeId!);
  const since = query.since ? ` since ${timeText(query.since)}` : "";
  if (lines.length === 0) {
    return {
      questionId: q.id,
      kind: "answer",
      text: `Per the record, nothing changed in ${subject}${since}.`,
      sourceMessageIds: [],
      elementIds: els.map((e) => e.id),
      query,
    };
  }
  const lead = unheard > 0 ? "HOLD: " : "";
  return {
    questionId: q.id,
    kind: "answer",
    text: `${lead}Per the record, ${lines.length} change${lines.length > 1 ? "s" : ""} in ${subject}${since}: ${lines.join("; ")}.`,
    sourceMessageIds: uniq(sources),
    elementIds: uniq(touched),
    query,
  };
}

function whoIsIn(q: Question, query: Extract<StructuredQuery, { kind: "who_is_in" }>, s: QueryState): Answer {
  const tasks = getPlan(s.scene, query.day).tasks.filter(
    (t) => t.placeId === query.placeId && (query.slot === undefined || slotsOverlap(t.slot, query.slot)),
  );
  const place = elementName(s.scene, query.placeId);
  const when = `${dayText(query.day)}${query.slot ? ` ${SLOT_TEXT[query.slot]}` : ""}`;
  if (tasks.length === 0) {
    return {
      questionId: q.id,
      kind: "answer",
      text: `Per the record, no crew is planned in ${place} on ${when}.`,
      sourceMessageIds: [],
      elementIds: [query.placeId],
      query,
    };
  }
  const crews = uniq(tasks.map((t) => t.crewId));
  const clash = crews.length > 1 && tasks.some((a) => tasks.some((b) => a.crewId !== b.crewId && slotsOverlap(a.slot, b.slot)));
  return {
    questionId: q.id,
    kind: "answer",
    text: `${clash ? "HOLD: " : ""}Per the record, ${crews.length} crew${crews.length > 1 ? "s" : ""} in ${place} on ${when}: ${tasks
      .map((t) => `${crewName(s.scene, t.crewId)} ${SLOT_TEXT[t.slot]}, ${t.description} (${t.sourceMessageId})`)
      .join("; ")}.${clash ? " They overlap; the superintendent decides who moves." : ""}`,
    sourceMessageIds: uniq(tasks.map((t) => t.sourceMessageId)),
    elementIds: [query.placeId],
    query,
  };
}

function canIStart(q: Question, query: Extract<StructuredQuery, { kind: "can_i_start" }>, s: QueryState): Answer {
  const plan = getPlan(s.scene, query.day);
  const own = plan.tasks.filter((t) => t.crewId === query.crewId && t.placeId === query.placeId);
  const intent: CrewIntent = {
    id: `intent-${q.id}`,
    crewId: query.crewId,
    time: q.time,
    sourceMessageId: q.id,
    confidence: 1,
    day: query.day,
    slot: query.slot,
    taskType: query.taskType,
    description: `${taskWords(query.taskType)} in ${elementName(s.scene, query.placeId)}`,
    placeId: query.placeId,
    // The elements of the crew's own planned tasks there; with none on record, the elements in that place.
    elementIds: own.length
      ? uniq(own.flatMap((t) => t.elementIds))
      : elementsAt(s.scene, query.placeId)
          .filter((e) => e.id !== query.placeId)
          .map((e) => e.id),
  };
  const findings = runChecks(s.scene, plan, intent);
  const holds = findings.filter((f) => f.severity === "hold");
  const warns = findings.filter((f) => f.severity === "warn");
  const what = `${taskWords(query.taskType)} in ${elementName(s.scene, query.placeId)} ${dayText(query.day)} ${SLOT_TEXT[query.slot]}`;
  const evidence = uniq(findings.flatMap((f) => f.evidenceMessageIds));

  if (holds.length > 0) {
    return {
      questionId: q.id,
      kind: "answer",
      text: `HOLD: ${holds.map((f) => f.summary).join(" ")} Sources: ${evidence.join(", ") || "plan"}. The superintendent has been told.`,
      sourceMessageIds: evidence,
      elementIds: uniq(findings.flatMap((f) => f.elementIds)),
      query,
      findings,
      escalation: { to: "superintendent", reason: `hold on ${what}` },
    };
  }
  const elementSources = intent.elementIds
    .map((id) => s.scene.elements.find((e) => e.id === id))
    .flatMap((e) => (e ? [[...e.history].sort((a, b) => b.version - a.version)[0].sourceMessageId] : []));
  const sources = uniq([...own.map((t) => t.sourceMessageId), ...elementSources, ...evidence]);
  const note = warns.length ? ` Note: ${warns.map((f) => f.summary).join(" ")}` : "";
  return {
    questionId: q.id,
    kind: "answer",
    text: `CLEAR: per the record nothing blocks ${what} (checked latest changes, other crews, order of work, open decisions).${note}`,
    sourceMessageIds: sources,
    elementIds: uniq([query.placeId, ...intent.elementIds]),
    query,
    findings,
  };
}

function decisionNeeded(q: Question, query: Extract<StructuredQuery, { kind: "decision_needed" }>, s: QueryState): Answer {
  const open = s.scene.elements.filter((e) => e.state === "proposed");
  const openText = open.length
    ? ` Open decisions per the record: ${open
        .map((e) => {
          const h = [...e.history].sort((a, b) => b.version - a.version).find((x) => x.state === "proposed");
          return `${e.name}${h ? ` (${h.sourceMessageId})` : ""}`;
        })
        .join("; ")}.`
    : "";
  return {
    questionId: q.id,
    kind: "escalated",
    text: `That is a decision for the superintendent. I have forwarded it; until then, work to the current record.${openText}`,
    sourceMessageIds: uniq(
      open.flatMap((e) => [...e.history].filter((h) => h.state === "proposed").map((h) => h.sourceMessageId)),
    ).filter((id) => !id.startsWith("drawing:")),
    elementIds: open.map((e) => e.id),
    query,
    escalation: { to: "superintendent", reason: query.topic },
  };
}

/** The answer for a parsed question. `null` query -> not found, forwarded. */
export function answerQuery(q: Question, query: StructuredQuery | null, s: QueryState): Answer {
  if (!query) return notFound(q);
  switch (query.kind) {
    case "whats_planned":
      return whatsPlanned(q, query, s);
    case "where_is":
      return whereIs(q, query, s);
    case "what_changed":
      return whatChanged(q, query, s);
    case "who_is_in":
      return whoIsIn(q, query, s);
    case "can_i_start":
      return canIStart(q, query, s);
    case "decision_needed":
      return decisionNeeded(q, query, s);
  }
}
