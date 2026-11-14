import type { ChatMessage, Finding, Fix, IncidentReceipt } from "@site/contracts";
import type { AgentLogEntry } from "./api";

// Owner: D. Pure: the site agent's log, findings, fixes and crew receipts become one chain per risk.
// Every step comes from a record entry (an action, a fix status, a sent message, a receipt).
// Nothing is inferred: a step the record does not show is not drawn.

export type StepKind =
  | "noticed"
  | "told"
  | "asked"
  | "no_reply"
  | "brought"
  | "approved"
  | "declined"
  | "sent"
  | "confirmed"
  | "waiting"
  | "superseded"
  | "settled";

export interface ChainStep {
  key: string;
  kind: StepKind;
  /** Replay time. Undefined = the record has no time for it (shown as such, never guessed). */
  time?: string;
  title: string;
  text?: string;
  /** Short note in site words, e.g. why a crew was told. */
  why?: string;
  sourceIds: string[];
  /** The crew this step was sent to or is about. */
  crewId?: string;
  /** Decided, but held until `heldUntil` for quiet hours. */
  heldUntil?: string;
  /** An open state, not an event: "Waiting for reply". */
  open?: boolean;
}

export type ChainStatus = "needs_you" | "waiting_crew" | "confirmed" | "settled" | "following";

export interface Chain {
  findingId: string;
  check?: Finding["check"];
  title: string;
  /** "0.4 m east", when the risk draws a ghost. */
  ghost?: string;
  crewIds: string[];
  status: ChainStatus;
  /** The ghost-wall risk the demo leads with. */
  lead: boolean;
  lastTime: string;
  steps: ChainStep[];
  /** False when the finding itself is not in the current record. */
  findingFound: boolean;
}

type Act = {
  kind?: string;
  type?: string;
  id?: string;
  due?: string;
  crewId?: string;
  findingId?: string;
  fixId?: string;
  text?: string;
  reason?: string;
  urgency?: string;
  questionMessageId?: string;
  sourceMessageIds?: string[];
};

export interface ChainInput {
  log: AgentLogEntry[];
  findings: Finding[];
  fixes: Fix[];
  receipts: IncidentReceipt[] | null;
  messages: ChatMessage[];
  asOf?: string;
  crewName: (id: string) => string;
  elementName: (id: string) => string | undefined;
}

const CHECK_LABEL: Record<Finding["check"], string> = {
  latest_change: "Latest change missed",
  space_clash: "Two crews in one place",
  order_of_work: "Work out of order",
  open_decision: "Decision still open",
};

/** Why the agent sent a crew a message, in site words. */
const WHY: Record<string, string> = {
  watch_crew_change: "On watch: this crew has missed changes before, so it gets each one as it lands",
  listen_question: "At risk and silent: asked to confirm before work starts",
  approved_fix_reminder: "Reminder of a fix you approved, at the start of their day",
  morning_briefing: "06:00 briefing: nothing open for them, per the record",
  clear: "The risk is gone per the record",
};

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** "HOLD needs your decision: <summary> Proposed: <fix>" -> "Proposed: <fix>". The noticed step already says the summary. */
function escalationText(text: string | undefined, summary: string | undefined): string | undefined {
  if (!text) return undefined;
  const stripped = text.replace(/^HOLD needs your decision:\s*/i, "");
  const proposed = stripped.indexOf(" Proposed: ");
  if (proposed >= 0) return stripped.slice(proposed + 1);
  if (summary && stripped.trim() === summary.trim()) return undefined;
  return stripped;
}

function actionStep(a: Act, time: string, heldUntil: string | undefined, input: ChainInput, summary?: string): ChainStep | undefined {
  const kind = a.kind ?? a.type;
  const crew = a.crewId ? input.crewName(a.crewId) : "a crew";
  const base = { key: `${a.id ?? kind}-${time}${heldUntil ? "-held" : ""}`, time, sourceIds: a.sourceMessageIds ?? [], heldUntil, crewId: a.crewId };
  if (kind === "send_dm") {
    if (a.reason === "listen_question") return { ...base, kind: "asked", title: `Asked ${crew} to confirm`, text: a.text, why: WHY[a.reason] };
    if (a.reason === "clear") return { ...base, kind: "told", title: `Told ${crew}: clear to go`, text: a.text, why: WHY[a.reason] };
    if (a.reason === "approved_fix_reminder") return { ...base, kind: "told", title: `Reminded ${crew} of your fix`, text: a.text, why: WHY[a.reason] };
    return { ...base, kind: "told", title: `Told ${crew}`, text: a.text, why: a.reason ? (WHY[a.reason] ?? a.reason.replace(/_/g, " ")) : undefined };
  }
  if (kind === "follow_up") {
    return { ...base, kind: "no_reply", title: `No reply from ${crew} by ${time.slice(11, 16)}: asked again`, text: a.text };
  }
  if (kind === "escalate") {
    const twice = /has not answered twice/i.test(a.text ?? "");
    const title = twice ? "No reply twice: brought to you now" : a.urgency === "now" ? "Brought to you now" : "Brought to you for tonight";
    return { ...base, kind: "brought", title, text: escalationText(a.text, summary) };
  }
  if (kind === "auto_resolve") return { ...base, kind: "settled", title: "Settled on its own", text: a.reason };
  return undefined;
}

export function buildChains(input: ChainInput): Chain[] {
  const { asOf, messages } = input;
  const inTime = (t: string | undefined) => !asOf || (t !== undefined && t <= asOf);
  const msgTime = new Map(messages.map((m) => [m.id, m.time]));

  // Actions per finding, in log order. A queued action that later ran is drawn once, as it ran.
  const ran = new Set<string>();
  for (const e of input.log) if (inTime(e.time)) for (const a of e.actions as Act[]) if (a.id) ran.add(a.id);
  const byFinding = new Map<string, { time: string; a: Act; held: boolean }[]>();
  for (const e of input.log) {
    if (!inTime(e.time)) continue;
    const rows = [
      ...(e.actions as Act[]).map((a) => ({ time: e.time, a, held: false })),
      ...((e.queued ?? []) as Act[]).filter((a) => !a.id || !ran.has(a.id)).map((a) => ({ time: e.time, a, held: true })),
    ];
    for (const r of rows) {
      if (!r.a.findingId) continue;
      const list = byFinding.get(r.a.findingId) ?? [];
      list.push(r);
      byFinding.set(r.a.findingId, list);
    }
  }

  // Risks the agent handled: an action names it, or an approved fix sent words for it.
  const ids = uniq([
    ...byFinding.keys(),
    ...input.fixes.filter((f) => f.status !== "pending").map((f) => f.findingId),
  ]);

  const chains = ids.map((findingId): Chain => {
    const finding = input.findings.find((f) => f.id === findingId);
    const fix = input.fixes.find((f) => f.findingId === findingId);
    const rows = byFinding.get(findingId) ?? [];
    const steps: ChainStep[] = [];

    // 1. Noticed: the finding, with the message that triggered it and the evidence.
    if (finding) {
      steps.push({
        key: `noticed-${finding.id}`,
        kind: "noticed",
        time: finding.time,
        title: "Noticed in the record",
        text: finding.summary,
        sourceIds: uniq([finding.sourceMessageId, ...finding.evidenceMessageIds]),
      });
    } else if (rows[0]) {
      steps.push({
        key: `noticed-${findingId}`,
        kind: "noticed",
        time: rows[0].time,
        title: "Noticed a risk",
        text: `${rows[0].a.text ? `In the agent's words: ${rows[0].a.text.replace(/^HOLD needs your decision:\s*/i, "").split(" Proposed: ")[0]} ` : ""}The finding itself is not found in the current state.`,
        sourceIds: rows[0].a.sourceMessageIds ?? [],
      });
    }

    // 2. What the agent did, in order.
    for (const r of rows) {
      const s = actionStep(r.a, r.time, r.held ? (r.a.due ?? "") : undefined, input, finding?.summary);
      if (s) steps.push(s);
    }

    // 3. The superintendent's decision, timed by the messages it sent.
    const sentIds = fix ? fix.messages.map((m) => `sent-${fix.id}-${m.crewId}`).filter((id) => msgTime.has(id) && inTime(msgTime.get(id))) : [];
    if (fix?.status === "approved") {
      const approvedAt = sentIds.map((id) => msgTime.get(id)!).sort()[0];
      steps.push({ key: `approved-${fix.id}`, kind: "approved", time: approvedAt, title: "You approved the fix", text: fix.description, sourceIds: sentIds });
      for (const m of fix.messages) {
        const id = `sent-${fix.id}-${m.crewId}`;
        if (!sentIds.includes(id)) continue;
        steps.push({ key: `sent-${id}`, kind: "sent", time: msgTime.get(id), title: `Correction sent to ${input.crewName(m.crewId)}`, text: m.text, sourceIds: [id], crewId: m.crewId });
      }
    } else if (fix?.status === "rejected") {
      steps.push({ key: `declined-${fix.id}`, kind: "declined", title: "You declined the fix", text: fix.description, sourceIds: [fix.sourceMessageId] });
    }

    // 4. Crew replies: only what the receipt records.
    const receipt = input.receipts?.find((r) => r.findingId === findingId || (fix && r.fixId === fix.id));
    if (receipt && inTime(receipt.sentAt)) {
      for (const c of receipt.crews) {
        if (c.acknowledgedAt && c.acknowledgedMessageId && inTime(c.acknowledgedAt)) {
          steps.push({
            key: `ack-${receipt.fixId}-${c.crewId}`,
            kind: "confirmed",
            time: c.acknowledgedAt,
            title: `${c.crewName} confirmed`,
            text: "Confirms the correction was received, not that the work is done.",
            sourceIds: [c.acknowledgedMessageId],
          });
        } else if (receipt.status === "superseded") {
          steps.push({ key: `sup-${receipt.fixId}-${c.crewId}`, kind: "superseded", title: "Replaced by a newer change before a reply", sourceIds: [c.sentMessageId], open: true });
        } else {
          steps.push({ key: `wait-${receipt.fixId}-${c.crewId}`, kind: "waiting", title: `Waiting for reply from ${c.crewName}`, sourceIds: [c.sentMessageId], open: true });
        }
      }
    } else if (fix?.status === "approved") {
      for (const id of sentIds) {
        const crewId = fix.messages.find((m) => id === `sent-${fix.id}-${m.crewId}`)?.crewId ?? "";
        steps.push({ key: `wait-${id}`, kind: "waiting", title: `No reply from ${input.crewName(crewId)} on record yet`, sourceIds: [id], open: true });
      }
    }

    const kinds = new Set(steps.map((s) => s.kind));
    const status: ChainStatus = kinds.has("settled")
      ? "settled"
      : kinds.has("confirmed") && !kinds.has("waiting")
        ? "confirmed"
        : kinds.has("approved") || kinds.has("waiting")
          ? "waiting_crew"
          : kinds.has("brought") && fix?.status !== "rejected"
            ? "needs_you"
            : "following";
    const timed = steps.map((s) => s.time).filter((t): t is string => !!t).sort();
    const elementId = finding?.elementIds[0] ?? finding?.ghost?.elementId;
    const place = elementId ? input.elementName(elementId) : undefined;
    return {
      findingId,
      check: finding?.check,
      title: finding ? `${CHECK_LABEL[finding.check]}${place ? `: ${place}` : ""}` : "Finding not found in the current state",
      ghost: finding?.ghost?.label,
      crewIds: finding?.crewIds ?? uniq(rows.map((r) => r.a.crewId).filter((c): c is string => !!c)),
      status,
      lead: false,
      lastTime: timed[timed.length - 1] ?? "",
      steps,
      findingFound: !!finding,
    };
  });

  // The ghost-wall risk leads: the most recent latest-change finding that draws a ghost.
  const ghostWall = chains
    .filter((c) => c.check === "latest_change" && c.ghost)
    .sort((a, b) => (a.steps[0]?.time ?? "").localeCompare(b.steps[0]?.time ?? ""))
    .pop();
  if (ghostWall) ghostWall.lead = true;
  return chains.sort((a, b) => Number(b.lead) - Number(a.lead) || Number(b.findingFound) - Number(a.findingFound) || b.lastTime.localeCompare(a.lastTime) || a.findingId.localeCompare(b.findingId));
}
