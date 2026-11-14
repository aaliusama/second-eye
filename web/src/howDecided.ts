import type { ChatMessage, Element, ElementChange, Finding, Fix, IncidentReceipt, Measure, PlanTask, RuleRef, Scene } from "@site/contracts";
import { crewById, crewName, elementById, heardThread, offsetLabel, threadLabel } from "./derive";
import { describeSource, type SourceView } from "./sources";

// Owner: D. "How it decided": one finding, traced from the message to the fix. Pure function of the
// record the server sent. Nothing here is inferred: a step the record does not carry says "not found".

export interface TraceFact {
  kind: "task" | "change";
  /** What was read, in a superintendent's words. */
  text: string;
  confidence: number;
  /** Whether the finding rests on this fact (its task or element). */
  used: boolean;
}

export interface TraceMessage {
  /** trigger: the crew's statement the check ran on. evidence: what proves it (e.g. the change they missed). */
  role: "trigger" | "evidence";
  source: SourceView;
  facts: TraceFact[];
}

export type FixStatus = "pending" | "rejected" | "sent" | "waiting" | "confirmed" | "superseded";

export interface TraceFix {
  id: string;
  description: string;
  status: FixStatus;
  /** One line on where the fix stands. Sent is never worded as confirmed. */
  words: string;
  to: string;
}

export interface Trace {
  messages: TraceMessage[];
  rule?: RuleRef;
  /** What the rule compared for this finding, from the record: e.g. the threads a crew reads, and whether it heard the change. */
  inputs: string[];
  finding: { check: string; severity: string; when: string; summary: string; offset?: string; numbers: string[]; note?: string };
  fixes: TraceFix[];
}

export const CHECK_LABEL: Record<Finding["check"], string> = {
  latest_change: "Latest change",
  space_clash: "Space clash",
  order_of_work: "Order of work",
  open_decision: "Open decision",
};

const SLOT: Record<PlanTask["slot"], string> = { morning: "morning", afternoon: "afternoon", full_day: "all day" };
const words = (s: string) => s.replace(/_/g, " ");
const dayWord = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
};

function taskFact(scene: Scene, t: PlanTask): string {
  const place = elementById(scene, t.placeId)?.name ?? "place not found";
  return `${crewName(scene, t.crewId)} plans ${words(t.taskType)} in ${place}, ${dayWord(t.day)} ${SLOT[t.slot]}`;
}

function changeFact(el: Element, h: ElementChange): string {
  if (h.geometry && h.operationType === "move") {
    const before = [...el.history].filter((x) => x.version < h.version && x.geometry).sort((a, b) => a.version - b.version).at(-1)?.geometry;
    return `${el.name} moved${before ? ` ${offsetLabel(before, h.geometry)}` : ""} (version ${h.version})`;
  }
  if (h.operationType === "add") return `${el.name} added (version ${h.version})`;
  if (h.operationType === "remove") return `${el.name} removed (version ${h.version})`;
  if (h.state) return `${el.name} marked ${h.state} (version ${h.version})`;
  return `${el.name}: ${words(h.operationType)} (version ${h.version})`;
}

/** What the extraction step produced from one message, as found in the scene: plan tasks and element history rows. */
export function factsFrom(scene: Scene, messageId: string, finding: Finding): TraceFact[] {
  const els = new Set([...finding.elementIds, ...(finding.ghost ? [finding.ghost.elementId] : [])]);
  const tasks = scene.tasks
    .filter((t) => t.sourceMessageId === messageId)
    .map((t): TraceFact => ({ kind: "task", text: taskFact(scene, t), confidence: t.confidence, used: finding.taskIds.includes(t.id) }));
  const changes = scene.elements.flatMap((el) =>
    el.history
      .filter((h) => h.sourceMessageId === messageId)
      .map((h): TraceFact => ({ kind: "change", text: changeFact(el, h), confidence: h.confidence, used: els.has(el.id) })),
  );
  const all = [...tasks, ...changes];
  // Show what the finding rests on; if none of it is marked, show everything read from the message.
  return all.some((f) => f.used) ? all.filter((f) => f.used) : all;
}

const OUTCOME: Record<NonNullable<Measure["clearance"]>["outcome"], string> = {
  inside_new_wall: "work on the face they believe in lands inside the recorded wall",
  gap: "work on the face they believe in leaves a gap beyond tolerance",
  within_tolerance: "within tolerance",
};

/** The measured numbers behind a finding (lane B), as short lines. Empty when nothing was measured. */
export function measureLines(scene: Scene, m: Measure | undefined): string[] {
  const out: string[] = [];
  if (m?.clearance) {
    const c = m.clearance;
    // requiredM is the clear working depth the trade needs in front of the face (contracts), not the tolerance.
    out.push(`Face offset ${c.offsetM.toFixed(2)} m ${c.direction}; the trade needs ${c.requiredM.toFixed(2)} m clear: ${OUTCOME[c.outcome]}`);
  }
  if (m?.overlap) {
    const o = m.overlap;
    const crews = [...new Set(o.zones.map((z) => crewName(scene, z.crewId)))].join(" and ");
    out.push(`Work zones overlap by ${o.areaM2.toFixed(1)} m²${crews ? ` (${crews})` : ""}`);
  }
  return out;
}

function fixOf(scene: Scene, finding: Finding, fix: Fix, receipts: IncidentReceipt[] | undefined): TraceFix {
  const to = [...new Set(fix.messages.map((m) => crewName(scene, m.crewId)))].join(" and ");
  const base = { id: fix.id, description: fix.description, to };
  if (fix.status === "pending") return { ...base, status: "pending", words: `Proposed, not sent. Waiting for the superintendent's approval.` };
  if (fix.status === "rejected") return { ...base, status: "rejected", words: "Rejected by the superintendent. Nothing was sent." };
  const receipt = receipts?.find((r) => r.fixId === fix.id);
  if (receipt?.status === "confirmed") return { ...base, status: "confirmed", words: `Sent to ${to}, and ${to} confirmed the sent revision. This confirms receipt, not completed work.` };
  if (receipt?.status === "superseded") return { ...base, status: "superseded", words: "Sent, but a newer revision is on record. A new correction is needed." };
  if (fix.kind === "ask_crew") return { ...base, status: "waiting", words: `Question sent to ${to}. Waiting for a reply.` };
  if (receipt || finding.check === "latest_change") return { ...base, status: "waiting", words: `Sent to ${to}, waiting for reply. Sent is not confirmed.` };
  return { ...base, status: "sent", words: `Sent to ${to}.` };
}

/**
 * The whole chain for one finding. `receipts` comes from /api/acknowledgements; undefined when it
 * could not be loaded (a sent fix then reads "waiting", never "confirmed").
 */
export function traceOf(
  finding: Finding,
  scene: Scene,
  messages: ChatMessage[],
  fixes: Fix[],
  receipts: IncidentReceipt[] | undefined,
  when: (t: string) => string = (t) => t,
): Trace {
  const name = (id: string) => crewName(scene, id);
  const ids = [finding.sourceMessageId, ...finding.evidenceMessageIds.filter((id) => id !== finding.sourceMessageId)];
  return {
    messages: [...new Set(ids)].map((id, i) => ({
      role: i === 0 ? "trigger" : "evidence",
      source: describeSource(id, messages, name),
      facts: factsFrom(scene, id, finding),
    })),
    rule: finding.rule,
    inputs: ruleInputs(finding, scene),
    finding: {
      check: CHECK_LABEL[finding.check],
      severity: finding.severity === "hold" ? "Hold" : "Confirm first",
      when: `${finding.trigger === "live" ? "Live check" : "Evening rehearsal"}, ${when(finding.time)}`,
      summary: finding.summary,
      offset: finding.ghost?.label,
      numbers: measureLines(scene, finding.measure),
      note: finding.measure?.clearance?.text ?? finding.measure?.overlap?.text,
    },
    fixes: fixes.filter((f) => f.findingId === finding.id).map((f) => fixOf(scene, finding, f, receipts)),
  };
}

/**
 * The inputs the rule compared, read from the record with the same "heard" rule as the lens (derive.ts).
 * latest_change: the threads each crew reads, and for each change behind the finding where it was said
 * and whether that crew heard it. open_decision: the element's state. Other checks: none here, their
 * numbers are in the measured result. Missing crews or elements say "not found".
 */
export function ruleInputs(finding: Finding, scene: Scene): string[] {
  if (finding.check === "open_decision") {
    return finding.elementIds.map((id) => {
      const el = elementById(scene, id);
      return el ? `${el.name} is ${el.state} per the record` : "Element not found in the record";
    });
  }
  if (finding.check !== "latest_change") return [];
  const out: string[] = [];
  const elementIds = finding.ghost ? [finding.ghost.elementId] : finding.elementIds;
  const evidence = new Set(finding.evidenceMessageIds);
  for (const crewId of finding.crewIds) {
    const crew = crewById(scene, crewId);
    if (!crew) {
      out.push("Crew not found in the record");
      continue;
    }
    const reads = crew.threads.map((t) => threadLabel(scene, t).toLowerCase());
    out.push(`${crew.name} reads: ${reads.length ? reads.join(", ") : "no shared threads"}, and its own direct messages`);
    for (const id of elementIds) {
      const el = elementById(scene, id);
      if (!el) {
        out.push("Element not found in the record");
        continue;
      }
      for (const h of el.history.filter((x) => evidence.has(x.sourceMessageId))) {
        const heard = heardThread(h.thread, crew) ? "heard" : `not heard by ${crew.name}`;
        out.push(`${el.name}, version ${h.version}: said in the ${threadLabel(scene, h.thread).toLowerCase()} · ${heard}`);
      }
    }
  }
  return out;
}

/**
 * Below this confidence a reading is unsure. Mirrors UNSURE_BELOW in server/checks/rules.ts (a finding
 * resting on an unsure entry is a warn, never a hold); howDecided.test.ts fails if the two drift.
 */
export const UNSURE_BELOW = 0.7;

export interface ConfidenceView {
  /** "88%", the stored confidence rounded. */
  pct: string;
  /** Below UNSURE_BELOW: the reading is shown as unconfirmed. */
  unsure: boolean;
}

export function confidenceView(c: number): ConfidenceView {
  return { pct: `${Math.round(c * 100)}%`, unsure: c < UNSURE_BELOW };
}

/** How a fix's crew receipt reads at a glance: amber until the crew confirms, green only on a confirmation. */
export type ReceiptTone = "waiting" | "confirmed" | "closed";
export const RECEIPT_TONE: Record<FixStatus, ReceiptTone> = {
  pending: "waiting",
  waiting: "waiting",
  sent: "waiting",
  superseded: "waiting",
  confirmed: "confirmed",
  rejected: "closed",
};
