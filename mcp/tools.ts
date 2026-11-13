import type { CheckName, Element, Finding, Fix, PlanTask, Scene, Slot, StateResponse, TaskType } from "@site/contracts";
import { NotFound, type SiteApi } from "./api";

// Owner: F. Tool logic, independent of the MCP transport so it can be tested with a mocked fetch.
// Read-only: nothing here approves a fix or posts a crew message. Decisions stay with the superintendent.
// Wording follows AGENTS.md: everything is "per the record", never verified reality.

export interface ToolOutput {
  /** Short, readable answer for the agent. */
  text: string;
  /** The same answer as data. */
  data: Record<string, unknown>;
  isError?: boolean;
}

const fail = (text: string): ToolOutput => ({ text, data: { error: text }, isError: true });

/** full_day overlaps both halves (same rule as server/checks/rules.ts). */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a === b || a === "full_day" || b === "full_day";
}

const label = (t: string) => t.replace(/_/g, " ");
const crewName = (scene: Scene, id: string) => scene.crews.find((c) => c.id === id)?.name ?? id;
const elementName = (scene: Scene, id: string) => scene.elements.find((e) => e.id === id)?.name ?? id;
const describeTask = (scene: Scene, t: PlanTask) =>
  `${crewName(scene, t.crewId)}: ${label(t.taskType)} in ${elementName(scene, t.placeId)}, ${t.day} ${label(t.slot)} (${t.sourceMessageId})`;

/** Findings whose fix the superintendent approved count as handled. */
function openFindings(findings: Finding[], fixes: Fix[]): Finding[] {
  const approved = new Set(fixes.filter((x) => x.status === "approved").map((x) => x.findingId));
  return findings.filter((f) => !approved.has(f.id));
}

/** One finding per (id, trigger): live and rehearsal findings may share an id. */
function uniqueFindings(findings: Finding[]): Finding[] {
  return [...new Map(findings.map((f) => [`${f.id}:${f.trigger}`, f])).values()];
}

async function allFindings(api: SiteApi, state: StateResponse, day?: string): Promise<Finding[]> {
  const rehearsal = await api.rehearsal(day);
  const evening = rehearsal ? rehearsal.frames.flatMap((fr) => fr.findings) : [];
  return uniqueFindings([...state.findings, ...evening]);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------- get_site_state ----------

export async function getSiteState(api: SiteApi, args: { t?: string }): Promise<ToolOutput> {
  try {
    const s = await api.state(args.t);
    const byState: Record<string, number> = {};
    for (const e of s.scene.elements) byState[e.state] = (byState[e.state] ?? 0) + 1;
    const open = openFindings(s.findings, s.fixes);
    const pending = s.fixes.filter((f) => f.status === "pending");
    const planned = s.scene.tasks.filter((t) => t.status === "planned");
    const data = {
      t: s.t,
      floor: { id: s.scene.floorId, name: s.scene.name },
      elementsByState: byState,
      places: s.scene.elements
        .filter((e) => e.type === "room" || e.type === "zone")
        .map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, state: e.state })),
      crews: s.scene.crews.map((c) => ({ id: c.id, name: c.name, trade: c.trade })),
      plannedTasks: planned.map((t) => ({ ...t, crewName: crewName(s.scene, t.crewId), placeName: elementName(s.scene, t.placeId) })),
      openFindings: open.map((f) => ({ id: f.id, check: f.check, severity: f.severity, trigger: f.trigger, summary: f.summary, sourceMessageId: f.sourceMessageId })),
      pendingFixes: pending.map((f) => ({ id: f.id, kind: f.kind, description: f.description })),
    };
    const text = [
      `${s.scene.name} at ${s.t} (simulated site data, per the record).`,
      `Elements: ${Object.entries(byState).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}.`,
      `Crews: ${s.scene.crews.map((c) => c.name).join(", ") || "none"}.`,
      `Planned tasks: ${planned.length}. Open findings: ${open.length}. Fixes waiting for the superintendent: ${pending.length}.`,
      ...open.map((f) => `- ${f.severity.toUpperCase()} ${label(f.check)}: ${f.summary} (${f.sourceMessageId})`),
    ].join("\n");
    return { text, data };
  } catch (err) {
    return fail(errorText(err));
  }
}

// ---------- whats_planned ----------

export async function whatsPlanned(api: SiteApi, args: { day?: string; placeId?: string; crewId?: string }): Promise<ToolOutput> {
  try {
    const { scene } = await api.state();
    if (args.placeId && !scene.elements.some((e) => e.id === args.placeId)) return fail(`not found: place ${args.placeId}`);
    if (args.crewId && !scene.crews.some((c) => c.id === args.crewId)) return fail(`not found: crew ${args.crewId}`);
    const tasks = scene.tasks
      .filter(
        (t) =>
          t.status === "planned" &&
          (!args.day || t.day === args.day) &&
          (!args.placeId || t.placeId === args.placeId) &&
          (!args.crewId || t.crewId === args.crewId),
      )
      .sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot) || a.order - b.order || a.id.localeCompare(b.id));
    const text = tasks.length
      ? `Per the record, ${tasks.length} planned task(s):\n${tasks.map((t) => `- ${describeTask(scene, t)}`).join("\n")}`
      : "Per the record, nothing is planned for that filter.";
    return { text, data: { filter: args, tasks } };
  } catch (err) {
    return fail(errorText(err));
  }
}

// ---------- get_findings / get_rehearsal ----------

export async function getFindings(api: SiteApi, args: { check?: CheckName; crewId?: string }): Promise<ToolOutput> {
  try {
    const state = await api.state();
    const open = openFindings(await allFindings(api, state), state.fixes).filter(
      (f) => (!args.check || f.check === args.check) && (!args.crewId || f.crewIds.includes(args.crewId)),
    );
    const text = open.length
      ? `Per the record, ${open.length} open finding(s):\n${open
          .map((f) => `- ${f.severity.toUpperCase()} ${label(f.check)} [${f.trigger}]: ${f.summary} (source ${f.sourceMessageId}; evidence ${f.evidenceMessageIds.join(", ") || "none"})`)
          .join("\n")}`
      : "Per the record, no open findings for that filter.";
    return { text, data: { filter: args, findings: open } };
  } catch (err) {
    return fail(errorText(err));
  }
}

export async function getRehearsal(api: SiteApi, args: { day?: string }): Promise<ToolOutput> {
  try {
    const r = await api.rehearsal(args.day);
    if (!r) return fail(`not found: no plan to rehearse${args.day ? ` for ${args.day}` : ""}`);
    const text = [
      `Rehearsal of ${r.day}, per the record:`,
      ...r.frames.map(
        (fr) =>
          `- ${fr.time.slice(11, 16)}: ${fr.activeTaskIds.length} active task(s); ${fr.findings.length ? fr.findings.map((f) => `${f.severity.toUpperCase()} ${label(f.check)}`).join(", ") : "no findings"}`,
      ),
    ].join("\n");
    return { text, data: { rehearsal: r } };
  } catch (err) {
    return fail(errorText(err));
  }
}

// ---------- element_history ----------

export async function elementHistory(api: SiteApi, args: { elementId: string }): Promise<ToolOutput> {
  try {
    const [{ scene }, messages] = await Promise.all([api.state(), api.messages()]);
    const el = scene.elements.find((e) => e.id === args.elementId);
    if (!el) return fail(`not found: element ${args.elementId}`);
    const byId = new Map(messages.map((m) => [m.id, m]));
    const rows = [...el.history]
      .sort((a, b) => a.version - b.version)
      .map((h) => {
        const m = byId.get(h.sourceMessageId);
        return {
          version: h.version,
          time: h.time,
          change: h.operationType,
          state: h.state,
          geometry: h.geometry,
          thread: h.thread,
          confidence: h.confidence,
          sourceMessageId: h.sourceMessageId,
          who: m ? `${m.senderName} (${m.senderRole})` : h.thread === "drawing" ? "drawing set" : undefined,
          said: m?.text,
        };
      });
    const text = [
      `${el.name} (${el.id}), now ${el.state}, version ${el.version}. History per the record:`,
      ...rows.map(
        (r) =>
          `- v${r.version} ${r.time} ${label(r.change)}${r.state ? ` -> ${r.state}` : ""} in ${r.thread}, by ${r.who ?? "not found"} (${r.sourceMessageId})${r.said ? `: "${r.said}"` : ""}`,
      ),
    ].join("\n");
    return { text, data: { element: { id: el.id, name: el.name, state: el.state, version: el.version }, history: rows } };
  } catch (err) {
    return fail(errorText(err));
  }
}

// ---------- is_place_clear ----------

export type PlaceStatus = "clear" | "occupied" | "hold" | "unknown";

/**
 * For robots and route planners. "clear" only when the place is on record, nothing is planned
 * there in an overlapping slot and no open finding touches it. Missing data never reads as clear:
 * an unknown place is "unknown", and a server error is a tool error.
 */
export async function isPlaceClear(api: SiteApi, args: { placeId: string; day: string; slot: Slot }): Promise<ToolOutput> {
  let state: StateResponse;
  let findings: Finding[];
  try {
    state = await api.state();
    findings = await allFindings(api, state, args.day);
  } catch (err) {
    return fail(`cannot tell, treat as not clear: ${errorText(err)}`);
  }
  const { scene } = state;
  const place: Element | undefined = scene.elements.find((e) => e.id === args.placeId);
  if (!place) {
    const text = `UNKNOWN: ${args.placeId} is not on record. Do not enter.`;
    return { text, data: { placeId: args.placeId, day: args.day, slot: args.slot, status: "unknown" as PlaceStatus, reasons: [text] } };
  }

  const tasks = scene.tasks.filter(
    (t) => t.status === "planned" && t.placeId === args.placeId && t.day === args.day && slotsOverlap(t.slot, args.slot),
  );
  const taskIds = new Set(tasks.map((t) => t.id));
  const taskById = new Map(scene.tasks.map((t) => [t.id, t]));
  const touching = openFindings(findings, state.fixes).filter((f) => {
    if (f.taskIds.some((id) => taskIds.has(id))) return true;
    if (!f.elementIds.includes(args.placeId)) return false;
    // Touches the place: counts unless every task behind it is on another day or slot.
    const linked = f.taskIds.map((id) => taskById.get(id)).filter((t): t is PlanTask => t !== undefined);
    return linked.length === 0 || linked.some((t) => t.day === args.day && slotsOverlap(t.slot, args.slot));
  });

  const status: PlaceStatus = touching.some((f) => f.severity === "hold")
    ? "hold"
    : tasks.length > 0 || touching.length > 0
      ? "occupied"
      : "clear";
  const crews = [...new Set(tasks.map((t) => crewName(scene, t.crewId)))];
  // Holds first, so a one-line reader (a robot log) sees why it must stay out.
  const reasons = [
    ...touching.map((f) => `${f.severity}: ${label(f.check)} - ${f.summary} (${f.sourceMessageId})`),
    ...tasks.map((t) => `planned: ${describeTask(scene, t)}`),
  ];
  const head =
    status === "clear"
      ? `CLEAR: per the record nothing is planned in ${place.name} on ${args.day} ${label(args.slot)} and no finding touches it.`
      : `${status.toUpperCase()}: ${place.name} on ${args.day} ${label(args.slot)}${crews.length ? `, crews: ${crews.join(", ")}` : ""}.`;
  return {
    text: [head, ...reasons.map((r) => `- ${r}`)].join("\n"),
    data: {
      placeId: place.id,
      placeName: place.name,
      day: args.day,
      slot: args.slot,
      status,
      crews,
      tasks,
      findings: touching.map((f) => ({ id: f.id, check: f.check, severity: f.severity, summary: f.summary, sourceMessageId: f.sourceMessageId })),
      reasons,
    },
  };
}

// ---------- check_plan ----------

export interface PlanQuestion {
  crewId: string;
  taskType: TaskType;
  placeId: string;
  day: string;
  slot: Slot;
  elementIds?: string[];
}

/**
 * HOLD or CLEAR for a plan before anyone states it in the chat. Asks the server's query endpoint
 * (POST /api/ask) when it exists; otherwise answers from existing findings and bookings only.
 * Never posts a crew message.
 */
export async function checkPlan(api: SiteApi, args: PlanQuestion): Promise<ToolOutput> {
  let state: StateResponse;
  try {
    state = await api.state();
  } catch (err) {
    return fail(`cannot check, treat as HOLD: ${errorText(err)}`);
  }
  const { scene } = state;
  if (!scene.crews.some((c) => c.id === args.crewId)) return fail(`not found: crew ${args.crewId}`);
  if (!scene.elements.some((e) => e.id === args.placeId)) return fail(`not found: place ${args.placeId}`);

  const question = `Can ${crewName(scene, args.crewId)} ${label(args.taskType)} in ${elementName(scene, args.placeId)} on ${args.day} ${label(args.slot)}${
    args.elementIds?.length ? ` touching ${args.elementIds.join(", ")}` : ""
  }?`;
  try {
    const answer = await api.ask({ crewId: args.crewId, text: question });
    const verdict = /^\s*HOLD/i.test(answer.text) ? "HOLD" : /^\s*CLEAR/i.test(answer.text) ? "CLEAR" : "ANSWER";
    return { text: answer.text, data: { basis: "ask", question, verdict, answer } };
  } catch (err) {
    if (!(err instanceof NotFound)) return fail(`cannot check, treat as HOLD: ${errorText(err)}`);
  }

  // Fallback: only what is already on record (bookings and findings). It cannot run the checks itself.
  let findings: Finding[];
  try {
    findings = await allFindings(api, state, args.day);
  } catch (err) {
    return fail(`cannot check, treat as HOLD: ${errorText(err)}`);
  }
  const elementIds = new Set([args.placeId, ...(args.elementIds ?? [])]);
  const others = scene.tasks.filter(
    (t) => t.status === "planned" && t.crewId !== args.crewId && t.placeId === args.placeId && t.day === args.day && slotsOverlap(t.slot, args.slot),
  );
  const own = new Set(
    scene.tasks.filter((t) => t.crewId === args.crewId && t.day === args.day && t.placeId === args.placeId).map((t) => t.id),
  );
  const relevant = openFindings(findings, state.fixes).filter(
    (f) => f.taskIds.some((id) => own.has(id)) || (f.crewIds.includes(args.crewId) && f.elementIds.some((id) => elementIds.has(id))),
  );
  const reasons = [
    ...others.map((t) => `space: ${describeTask(scene, t)}`),
    ...relevant.map((f) => `${label(f.check)}: ${f.summary} (${f.sourceMessageId})`),
  ];
  const verdict = reasons.length ? "HOLD" : "CLEAR";
  const text =
    verdict === "HOLD"
      ? [`HOLD: ${question}`, ...reasons.map((r) => `- ${r}`)].join("\n")
      : `CLEAR per the record: ${question} No booking or open finding conflicts. (Fallback: the query endpoint is not available, so new changes were not re-checked.)`;
  return { text, data: { basis: "record", question, verdict, reasons } };
}

// ---------- ask_site ----------

export async function askSite(api: SiteApi, args: { text: string; crewId?: string }): Promise<ToolOutput> {
  try {
    const answer = await api.ask(args);
    return { text: answer.text, data: { answer } };
  } catch (err) {
    if (err instanceof NotFound) return fail("query endpoint not available");
    return fail(errorText(err));
  }
}
