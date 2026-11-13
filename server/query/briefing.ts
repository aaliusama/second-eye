import type { CheckName, Finding, Fix, Id } from "@site/contracts";
import { heardThread } from "../checks/geometry";
import { runChecks } from "../checks/index";
import { getPlan } from "../model/index";
import { crewName, dayText, elementName, SLOT_TEXT, timeText, type QueryState } from "./answer";

// Owner: E. The morning briefing per crew and the superintendent's evening digest.
// Pure functions of the record. Findings come from a fresh rehearsal check of that day's plan.

export interface CrewBriefing {
  crewId: Id;
  day: string;
  tasks: {
    taskId: Id;
    slot: string;
    order: number;
    description: string;
    placeId: Id;
    sourceMessageId: Id;
    holds: { findingId: Id; check: CheckName; severity: Finding["severity"]; summary: string; sourceMessageIds: Id[] }[];
  }[];
  /** Changes to elements their tasks touch, after the crew last posted. `heard` = said in a thread they read. */
  changes: { elementId: Id; name: string; version: number; time: string; sourceMessageId: Id; thread: string; heard: boolean }[];
  /** When the crew last posted, if ever. */
  lastPosted?: string;
  text: string;
}

export function briefing(s: QueryState, crewId: Id, day: string): CrewBriefing {
  const crew = s.scene.crews.find((c) => c.id === crewId);
  if (!crew) throw new Error(`not found: crew ${crewId}`);
  const plan = getPlan(s.scene, day);
  const mine = plan.tasks.filter((t) => t.crewId === crewId && t.status === "planned");
  const findings = runChecks(s.scene, plan).filter((f) => f.crewIds.includes(crewId));
  const lastPosted = s.messages
    .filter((m) => m.crewId === crewId && m.senderRole !== "system")
    .map((m) => m.time)
    .sort()
    .at(-1);

  const tasks = mine.map((t) => ({
    taskId: t.id,
    slot: t.slot,
    order: t.order,
    description: t.description,
    placeId: t.placeId,
    sourceMessageId: t.sourceMessageId,
    holds: findings
      .filter((f) => f.taskIds.includes(t.id))
      .map((f) => ({
        findingId: f.id,
        check: f.check,
        severity: f.severity,
        summary: f.summary,
        sourceMessageIds: [...new Set([f.sourceMessageId, ...f.evidenceMessageIds])],
      })),
  }));

  const touched = [...new Set(mine.flatMap((t) => [t.placeId, ...t.elementIds]))];
  const changes = touched.flatMap((id) => {
    const el = s.scene.elements.find((e) => e.id === id);
    if (!el) return [];
    return el.history
      .filter((h) => h.version > 1 && !h.sourceMessageId.startsWith("drawing:") && (lastPosted === undefined || h.time > lastPosted || !heardThread(h.thread, crew)))
      .map((h) => ({
        elementId: el.id,
        name: el.name,
        version: h.version,
        time: h.time,
        sourceMessageId: h.sourceMessageId,
        thread: h.thread,
        heard: heardThread(h.thread, crew),
      }));
  });

  const lines = [`${crew.name}, ${dayText(day)}, per the record:`];
  if (tasks.length === 0) lines.push("No work planned for you.");
  for (const t of tasks) {
    const status = t.holds.some((h) => h.severity === "hold") ? "HOLD" : "CLEAR";
    lines.push(`${status} ${SLOT_TEXT[t.slot as keyof typeof SLOT_TEXT]}: ${t.description} in ${elementName(s.scene, t.placeId)} (${t.sourceMessageId})`);
    for (const h of t.holds) lines.push(`  - ${h.summary} Sources: ${h.sourceMessageIds.join(", ")}.`);
  }
  if (changes.length) {
    lines.push("Changed on what you touch:");
    for (const c of changes) lines.push(`  - ${c.name} v${c.version}, ${timeText(c.time)} (${c.sourceMessageId})${c.heard ? "" : ", said in a thread you do not read"}`);
  }
  return { crewId, day, tasks, changes, lastPosted, text: lines.join("\n") };
}

export interface Digest {
  day: string;
  counts: Record<CheckName, { hold: number; warn: number }>;
  openDecisions: { elementId: Id; name: string; sourceMessageId?: Id }[];
  /** Crews with a finding on this day who have posted nothing since the risk entered the record. */
  silentCrews: { crewId: Id; name: string; since: string }[];
  pendingFixes: { fixId: Id; kind: Fix["kind"]; description: string }[];
  text: string;
}

export function digest(s: QueryState, day: string): Digest {
  const findings = runChecks(s.scene, getPlan(s.scene, day));
  const counts = {
    latest_change: { hold: 0, warn: 0 },
    space_clash: { hold: 0, warn: 0 },
    order_of_work: { hold: 0, warn: 0 },
    open_decision: { hold: 0, warn: 0 },
  } satisfies Digest["counts"];
  for (const f of findings) counts[f.check][f.severity]++;

  const openDecisions = s.scene.elements
    .filter((e) => e.state === "proposed")
    .map((e) => ({
      elementId: e.id,
      name: e.name,
      sourceMessageId: [...e.history].sort((a, b) => b.version - a.version).find((h) => h.state === "proposed")?.sourceMessageId,
    }));

  const msgTime = (id: string) => s.messages.find((m) => m.id === id)?.time;
  const silent = new Map<Id, string>();
  for (const f of findings) {
    const since = f.evidenceMessageIds.map(msgTime).filter((t): t is string => !!t).sort()[0] ?? msgTime(f.sourceMessageId);
    if (!since) continue;
    for (const crewId of f.crewIds) {
      const spoke = s.messages.some((m) => m.crewId === crewId && m.senderRole !== "system" && m.time > since);
      if (!spoke && (!silent.has(crewId) || since < silent.get(crewId)!)) silent.set(crewId, since);
    }
  }
  const silentCrews = [...silent.entries()]
    .map(([crewId, since]) => ({ crewId, name: crewName(s.scene, crewId), since }))
    .sort((a, b) => a.crewId.localeCompare(b.crewId));
  const pendingFixes = s.fixes.filter((f) => f.status === "pending").map((f) => ({ fixId: f.id, kind: f.kind, description: f.description }));

  const holds = findings.filter((f) => f.severity === "hold").length;
  const warns = findings.length - holds;
  const lines = [`Evening digest for ${dayText(day)}, per the record: ${holds} hold${holds === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}.`];
  for (const [check, c] of Object.entries(counts)) if (c.hold + c.warn) lines.push(`  - ${check.replace(/_/g, " ")}: ${c.hold} hold, ${c.warn} warn`);
  if (openDecisions.length) lines.push(`Open decisions: ${openDecisions.map((d) => `${d.name}${d.sourceMessageId ? ` (${d.sourceMessageId})` : ""}`).join("; ")}.`);
  if (silentCrews.length) lines.push(`Silent since the change: ${silentCrews.map((c) => `${c.name} (since ${timeText(c.since)})`).join("; ")}.`);
  lines.push(pendingFixes.length ? `${pendingFixes.length} fix${pendingFixes.length === 1 ? "" : "es"} waiting for your approval.` : "No fixes waiting.");
  return { day, counts, openDecisions, silentCrews, pendingFixes, text: lines.join("\n") };
}
