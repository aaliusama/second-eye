import type { ChatMessage, Element, Finding, Fix, LearningContext, PlanTask, Rehearsal, Scene } from "@site/contracts";
import { heardThread } from "../checks/geometry";
import { runChecks } from "../checks/index";
import { getPlan } from "../model/index";
import { crewPostedAfter, onWatch } from "./profiles";
import { Action, type CrewProfile } from "./schema";
import { addMinutes, atClock, dayOf, isQuiet, nextDay, quietEnds } from "./time";

// Owner: G. The site agent's policy: what the system does on its own at replay time `now`.
// PURE: same input, same actions. No wall clock, no randomness, no LLM.
// The superintendent stays in charge: a HOLD is escalated, never approved here.
// The agent may say on its own only: listen questions, CLEAR, reminders of approved fixes,
// morning briefings, and (learning loop) changes sent straight to a crew on watch.

export interface AgentInput {
  now: string;
  scene: Scene;
  /** Chat so far, including agent DMs (id "agent-<action id>") and approval DMs ("sent-<fix id>-<crew>"). */
  messages: ChatMessage[];
  findings: Finding[];
  fixes: Fix[];
  rehearsals: Rehearsal[];
  learning: LearningContext;
  crewProfiles: CrewProfile[];
  /** Ids of actions that already ran (escalations, resolutions). DMs are also read from `messages`. */
  done?: string[];
}

/** The morning starts; a silent crew must answer by then (same as REPLY_BY in checks/fixes.ts). */
export const REPLY_BY = "07:00:00";
/** After a follow-up, how long the crew gets before the superintendent is told. */
export const FOLLOW_UP_GRACE_MIN = 60;
export const BRIEFING_AT = "06:00:00";

const AGENT_MSG = "agent-";
const SEP = "~";
const actionId = (...parts: string[]) => parts.join(SEP);
const uniq = (xs: string[]) => [...new Set(xs)].sort();

/** Incident identity: one incident may show up as a live and a rehearsal finding. */
const incidentKey = (f: Finding) => [f.check, uniq(f.crewIds).join(","), uniq(f.elementIds).join(",")].join("|");

export function decide(input: AgentInput): Action[] {
  const { now, scene, learning, crewProfiles } = input;
  const messages = input.messages.filter((m) => m.time <= now);
  const msgTime = new Map(input.messages.map((m) => [m.id, m.time]));
  const done = new Set(input.done ?? []);
  for (const m of messages) if (m.id.startsWith(AGENT_MSG)) done.add(m.id.slice(AGENT_MSG.length));
  const crewName = (id: string) => scene.crews.find((c) => c.id === id)?.name ?? id;
  const taskById = new Map(scene.tasks.map((t) => [t.id, t]));
  /** A task is known once its source message is in the record (unknown source time: known). */
  const taskKnown = (t: PlanTask) => (msgTime.get(t.sourceMessageId) ?? "") <= now;

  // ---------- Findings in play: live + rehearsal, one per incident, known by now ----------
  const pool = new Map<string, Finding>();
  for (const f of [...input.findings, ...input.rehearsals.flatMap((r) => r.frames.flatMap((fr) => fr.findings))]) {
    if (f.time <= now && !pool.has(f.id)) pool.set(f.id, f);
  }
  const incidents = new Map<string, Finding[]>();
  for (const f of [...pool.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const k = incidentKey(f);
    incidents.set(k, [...(incidents.get(k) ?? []), f]);
  }

  const out: Action[] = [];
  /** (findingId, crewId) pairs that already got a DM: at most one per crew per finding. */
  const dmed = new Set<string>();
  for (const id of done) {
    const [kind, findingId, crewId] = id.split(SEP);
    if (["ask", "rem", "clr"].includes(kind ?? "") && findingId && crewId) dmed.add(`${findingId}${SEP}${crewId}`);
  }
  const dueFor = (urgentNow = false) => (urgentNow || !isQuiet(now) ? now : quietEnds(now));
  const push = (a: Action) => {
    if (done.has(a.id) || out.some((x) => x.id === a.id)) return;
    a = { ...a, sourceMessageIds: a.sourceMessageIds.filter((id) => id.length > 0) };
    if (a.sourceMessageIds.length === 0) return; // no source, no action
    if (a.kind === "send_dm" && a.findingId) {
      const key = `${a.findingId}${SEP}${a.crewId}`;
      if (dmed.has(key)) return;
      dmed.add(key);
    }
    out.push(Action.parse(a));
  };

  /** Crews with an open (unresolved, not approved) finding today, for the briefing. */
  const openCrews = new Set<string>();
  /** Crews that get a reminder this morning. */
  const remindedCrews = new Set<string>();

  for (const group of incidents.values()) {
    const lead = group[0]!;
    const fix = group.map((f) => input.fixes.find((x) => x.findingId === f.id)).find((x) => x !== undefined);
    const resolved = group.some((f) => done.has(actionId("res", f.id)));
    if (resolved) continue;
    const tasks = uniq(group.flatMap((f) => f.taskIds))
      .map((id) => taskById.get(id))
      .filter((t): t is PlanTask => t !== undefined);
    const workDay = tasks.map((t) => t.day).sort()[0] ?? nextDay(dayOf(lead.time));

    // Approved fix: the superintendent decided. Remind the crew at the start of the work day
    // if the approval came before it (an approval during the day already sent its own DM).
    // The approval time is the time of its DMs; a fix approved after `now` still counts as pending.
    const approvedAt =
      fix?.status === "approved"
        ? fix.messages
            .map((m) => msgTime.get(`sent-${fix.id}-${m.crewId}`))
            .filter((t): t is string => t !== undefined)
            .sort()[0]
        : undefined;
    if (fix && fix.status === "approved" && (approvedAt === undefined || approvedAt <= now)) {
      const morning = atClock(workDay, BRIEFING_AT);
      if (approvedAt !== undefined && approvedAt < morning && now >= morning && dayOf(now) === workDay && !isQuiet(now)) {
        for (const m of fix.messages) {
          remindedCrews.add(m.crewId);
          push({
            kind: "send_dm",
            id: actionId("rem", lead.id, m.crewId),
            due: now,
            crewId: m.crewId,
            reason: "approved_fix_reminder",
            findingId: lead.id,
            text: `Reminder for today, approved by the superintendent: ${m.text}`,
            sourceMessageIds: uniq([`sent-${fix.id}-${m.crewId}`, ...lead.evidenceMessageIds, lead.sourceMessageId]),
          });
        }
      }
      continue;
    }
    if (fix && fix.status === "rejected") continue;

    // Has the record moved on? Re-run the checks on the current scene and look for the incident.
    const resolution = resolutionSources(group, tasks, scene, input.messages, now);
    if (resolution && !reproduces(lead, tasks, scene)) {
      push({
        kind: "auto_resolve",
        id: actionId("res", lead.id),
        due: now,
        findingId: lead.id,
        reason: `Per the record the risk is gone: ${resolution.why}.`,
        sourceMessageIds: resolution.sources,
      });
      for (const crewId of lead.crewIds) {
        push({
          kind: "send_dm",
          id: actionId("clr", lead.id, crewId),
          due: dueFor(),
          crewId,
          reason: "clear",
          findingId: lead.id,
          text: `CLEAR: ${resolution.why} per the record. Go ahead as planned.`,
          sourceMessageIds: resolution.sources,
        });
      }
      continue;
    }

    for (const c of lead.crewIds) if (dayOf(now) === workDay) openCrews.add(c);
    const urgency: "now" | "tonight" = dayOf(now) >= workDay ? "now" : "tonight";
    const sources = uniq([lead.sourceMessageId, ...group.flatMap((f) => f.evidenceMessageIds)]);

    // Listen step: an ask_crew fix is a question the system may ask by itself.
    if (fix && fix.kind === "ask_crew") {
      const deadline = atClock(workDay, REPLY_BY);
      for (const m of fix.messages) {
        const askId = actionId("ask", lead.id, m.crewId);
        const asked = messages.find((x) => x.id === `${AGENT_MSG}${askId}`);
        if (!asked) {
          push({
            kind: "send_dm",
            id: askId,
            due: dueFor(),
            crewId: m.crewId,
            reason: "listen_question",
            findingId: lead.id,
            text: m.text,
            sourceMessageIds: sources,
          });
          continue;
        }
        if (crewPostedAfter(messages, m.crewId, asked.time)) continue; // answered; checks take it from here
        const fuId = actionId("fu", lead.id, m.crewId);
        const followed = messages.find((x) => x.id === `${AGENT_MSG}${fuId}`);
        if (!followed) {
          if (now < deadline) continue;
          push({
            kind: "follow_up",
            id: fuId,
            due: dueFor(),
            crewId: m.crewId,
            findingId: lead.id,
            questionMessageId: asked.id,
            text: `No answer yet. ${m.text} The superintendent will be told at ${addMinutes(now, FOLLOW_UP_GRACE_MIN).slice(11, 16)}.`,
            sourceMessageIds: uniq([asked.id, ...sources]),
          });
          continue;
        }
        if (now < addMinutes(followed.time, FOLLOW_UP_GRACE_MIN)) continue;
        push({
          kind: "escalate",
          id: actionId("esc", "fu", lead.id, m.crewId),
          due: now,
          to: "superintendent",
          findingId: lead.id,
          fixId: fix.id,
          urgency: "now",
          text: `${crewName(m.crewId)} has not answered twice. ${lead.summary} Decide before they start.`,
          sourceMessageIds: uniq([asked.id, followed.id, ...sources]),
        });
      }
      continue;
    }

    // Any other HOLD needs the superintendent's decision. Warnings wait for the briefing.
    if (lead.severity !== "hold") continue;
    push({
      kind: "escalate",
      id: actionId("esc", lead.id),
      due: urgency === "now" ? now : dueFor(),
      to: "superintendent",
      findingId: lead.id,
      ...(fix ? { fixId: fix.id } : {}),
      urgency,
      text: fix ? `HOLD needs your decision: ${lead.summary} Proposed: ${fix.description}` : `HOLD needs your decision: ${lead.summary}`,
      sourceMessageIds: sources,
    });
  }

  // ---------- Learning loop: crews on watch get a change the moment it lands ----------
  for (const crew of scene.crews) {
    if (!onWatch(crew.id, crewProfiles, learning)) continue;
    const planned = scene.tasks.filter((t) => t.crewId === crew.id && t.status === "planned" && taskKnown(t));
    const touched = new Set(planned.flatMap((t) => [...t.elementIds, t.placeId]));
    for (const el of [...scene.elements].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!touched.has(el.id)) continue;
      const change = latestUnheardChange(el, crew, now);
      if (!change) continue;
      push({
        kind: "send_dm",
        id: actionId("pro", el.id, `v${change.version}`, crew.id),
        due: dueFor(),
        crewId: crew.id,
        reason: "watch_crew_change",
        text: `Change to ${el.name} per the record (${change.sourceMessageId}, ${change.thread} thread): ${describeChange(change)}. Work to the latest version.`,
        sourceMessageIds: [change.sourceMessageId],
      });
    }
  }

  // ---------- 06:00 briefing: CLEAR for crews with work today and nothing open ----------
  const today = dayOf(now);
  const morning = atClock(today, BRIEFING_AT);
  if (now >= morning && !isQuiet(now)) {
    for (const crew of scene.crews) {
      const todays = scene.tasks
        .filter((t) => t.crewId === crew.id && t.day === today && t.status === "planned" && taskKnown(t))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      if (todays.length === 0 || openCrews.has(crew.id) || remindedCrews.has(crew.id)) continue;
      const place = (id: string) => scene.elements.find((e) => e.id === id)?.name ?? id;
      push({
        kind: "send_dm",
        id: actionId("brief", today, crew.id),
        due: now,
        crewId: crew.id,
        reason: "morning_briefing",
        text: `CLEAR: per the record today you have ${todays.map((t) => `${t.description} (${place(t.placeId)}, ${t.slot.replace("_", " ")})`).join("; ")}. No open issues.`,
        sourceMessageIds: uniq(todays.map((t) => t.sourceMessageId)),
      });
    }
  }

  return out;
}

/** The latest change to an element the crew has not heard, if it is the element's latest change. */
function latestUnheardChange(el: Element, crew: Scene["crews"][number], now: string) {
  const history = [...el.history].filter((h) => h.time <= now).sort((a, b) => a.version - b.version);
  const last = history[history.length - 1];
  if (!last || last.thread === "drawing" || history.length < 2) return undefined;
  if (last.operationType !== "move" && last.operationType !== "set_status") return undefined;
  if (heardThread(last.thread, crew)) return undefined;
  return last;
}

function describeChange(h: Element["history"][number]): string {
  if (h.operationType === "move") return "it moved";
  return `its status is now ${h.state ?? "changed"}`;
}

/**
 * New record entries after the finding that could explain the risk going away, known by `now`:
 * changes to the finding's elements, and later restatements, completions or cancellations of its tasks.
 */
function resolutionSources(
  group: Finding[],
  tasks: PlanTask[],
  scene: Scene,
  messages: ChatMessage[],
  now: string,
): { sources: string[]; why: string } | undefined {
  const since = group.map((f) => f.time).sort()[0]!;
  const timeOf = (id: string) => messages.find((m) => m.id === id)?.time;
  const sources: string[] = [];
  const why: string[] = [];
  for (const elementId of uniq(group.flatMap((f) => f.elementIds))) {
    const el = scene.elements.find((e) => e.id === elementId);
    for (const h of el?.history ?? []) {
      if (h.time > since && h.time <= now) {
        sources.push(h.sourceMessageId);
        why.push(`${el!.name} was confirmed in the ${h.thread} thread`);
      }
    }
  }
  const findingSources = new Set(group.map((f) => f.sourceMessageId));
  for (const t of tasks) {
    const at = timeOf(t.sourceMessageId);
    if (findingSources.has(t.sourceMessageId) || at === undefined || at <= since || at > now) continue;
    sources.push(t.sourceMessageId);
    why.push(t.status === "planned" ? `the plan for ${t.description.toLowerCase()} changed` : `${t.description.toLowerCase()} is ${t.status}`);
  }
  if (sources.length === 0) return undefined;
  return { sources: uniq(sources), why: uniq(why).join("; ") };
}

/** Whether the evening checks on the current scene still produce this incident. */
function reproduces(lead: Finding, tasks: PlanTask[], scene: Scene): boolean {
  const days = uniq(tasks.map((t) => t.day));
  if (days.length === 0) return true; // nothing to re-check against: assume still open
  return days.some((day) =>
    runChecks(scene, getPlan(scene, day)).some(
      (f) =>
        f.check === lead.check &&
        f.crewIds.some((c) => lead.crewIds.includes(c)) &&
        f.elementIds.some((e) => lead.elementIds.includes(e)),
    ),
  );
}
