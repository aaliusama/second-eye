import type { ChatMessage, Finding, Fix, PlanTask, Scene, Slot, TaskType } from "@site/contracts";
import { slotsOverlap } from "./rules";

// Owner: C. One proposed fix per finding. Pure and deterministic, same order as findings.

const LISTEN_THRESHOLD = 0.7;

const WORK_ORDER: TaskType[] = [
  "layout",
  "rough_in_plumbing",
  "rough_in_electrical",
  "inspection",
  "close_wall",
  "finish_drywall",
  "paint",
  "tile",
  "install_fixtures",
  "other",
];

const SLOT_TEXT: Record<Slot, string> = { morning: "in the morning", afternoon: "in the afternoon", full_day: "all day" };

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** When the morning starts; a silent crew must answer before this. */
const REPLY_BY = "07:00";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * How a crew message cites its sources: people, threads and times ("Lena Hofer, office, Thu 14:02"),
 * because a crew lead cannot look up a message id. Ids stay only when the message is not known.
 * Pure: the weekday comes from the replay-time string, never the clock.
 */
export function cite(ids: string[], messages?: ChatMessage[]): string {
  return ids
    .map((id) => {
      const m = messages?.find((x) => x.id === id);
      if (!m) return "";
      const d = new Date(`${m.time.slice(0, 10)}T00:00:00Z`);
      const when = `${DAYS[d.getUTCDay()]} ${m.time.slice(11, 16)}`;
      const who = m.senderName.replace(/\s*\(.*\)$/, "");
      const where = m.thread.startsWith("dm:") ? "direct message" : m.thread.replace(/-/g, " ");
      return `${who}, ${where}, ${when}`;
    })
    .filter(Boolean)
    .join("; ");
}

/**
 * The time the risk entered the record: the earliest evidence message found in `messages`,
 * else the finding's source message. Undefined if neither is in `messages`.
 */
function riskTime(f: Finding, messages: ChatMessage[]): string | undefined {
  const times = f.evidenceMessageIds
    .map((id) => messages.find((m) => m.id === id)?.time)
    .filter((t): t is string => t !== undefined)
    .sort();
  return times[0] ?? messages.find((m) => m.id === f.sourceMessageId)?.time;
}

/**
 * Only messages from people count as a crew response. A system DM addressed to a crew is not its reply.
 */
function silentCrews(f: Finding, messages: ChatMessage[]): string[] {
  const since = riskTime(f, messages);
  if (since === undefined) return [];
  return f.crewIds.filter((crewId) => !messages.some((m) =>
    m.crewId === crewId && m.senderRole !== "system" && m.time >= since,
  ));
}

/**
 * One fix per finding. With `messages` (the chat so far), an evening rehearsal finding whose
 * crews have all been silent since the change becomes an ask_crew question; mixed findings question only
 * the silent crews. Without `messages`, only the low-confidence fallback applies. Live findings never become ask_crew, but with `messages`
 * every other crew on a live finding that has been silent since the statement gets a question instead of a HOLD.
 */
export function proposeFixes(findings: Finding[], scene: Scene, messages?: ChatMessage[]): Fix[] {
  const elementName = (id: string | undefined) =>
    id === undefined ? "the element" : (scene.elements.find((e) => e.id === id)?.name ?? id);
  const crewName = (id: string) => scene.crews.find((c) => c.id === id)?.name ?? id;
  const tasksOf = (f: Finding) =>
    f.taskIds.map((id) => scene.tasks.find((t) => t.id === id)).filter((t): t is PlanTask => t !== undefined);

  return findings.map((f) => {
    const sources = cite(f.evidenceMessageIds.length > 0 ? f.evidenceMessageIds : [f.sourceMessageId], messages);
    const sourceNote = sources ? ` Source: ${sources}.` : " See the incident source record.";
    const tasks = tasksOf(f);
    const mainElementId = f.ghost?.elementId ?? f.elementIds[0];
    const element = elementName(mainElementId);
    const crews = joinNames(f.crewIds.map(crewName));
    const base = { id: `fix-${f.id}`, findingId: f.id, status: "pending" as const, sourceMessageId: f.sourceMessageId };
    const toAll = (text: string) => f.crewIds.map((crewId) => ({ crewId, text }));

    // The reason, worded "per the record", used by every kind and by the listen-rule question.
    let reason: string;
    let fix: Omit<Fix, "id" | "findingId" | "status" | "sourceMessageId">;

    switch (f.check) {
      case "latest_change": {
        reason = f.ghost
          ? `${element} moved ${f.ghost.label} per the record.`
          : `${element} changed per the record.`;
        fix = {
          kind: "notify_crew",
          description: `Send the latest ${element} position to ${crews} before they start.`,
          messages: toAll(`HOLD: ${reason}${sourceNote} Work to the new line.`),
        };
        break;
      }
      case "space_clash": {
        const place = elementName(tasks[0]?.placeId ?? f.elementIds[0]);
        // Keep the earlier trade in place; move only the later trade, and only into a free afternoon.
        // Full-day work cannot be squeezed into a half-day. Otherwise ask for a revised slot.
        const ordered = [...tasks].sort(
          (a, b) => WORK_ORDER.indexOf(a.taskType) - WORK_ORDER.indexOf(b.taskType) || a.id.localeCompare(b.id),
        );
        const [stay, move] = ordered;
        const canMove =
          ordered.length === 2 && f.crewIds.length === 2 && stay.crewId !== move.crewId &&
          stay.day === move.day && stay.placeId === move.placeId && stay.slot === "morning" && move.slot === "morning" &&
          !scene.tasks.some((t) =>
            t.id !== move.id && t.status === "planned" && t.day === move.day && slotsOverlap(t.slot, "afternoon") &&
            (t.placeId === move.placeId || t.crewId === move.crewId),
          );
        const messages = f.crewIds.map((crewId) => {
          const own = tasks.find((t) => t.crewId === crewId);
          const others = joinNames(f.crewIds.filter((c) => c !== crewId).map(crewName)) || "another crew";
          const when = own ? SLOT_TEXT[own.slot] : "in an overlapping slot";
          const correction = canMove
            ? crewId === move.crewId
              ? `Move to the afternoon. ${crewName(stay.crewId)} keeps the morning slot.`
              : `Keep your morning slot. ${crewName(move.crewId)} moves to the afternoon.`
            : "Confirm a revised slot with the superintendent.";
          return {
            crewId,
            text: `HOLD: ${others} is also in ${place} ${when} per the record.${sourceNote} ${correction}`,
          };
        });
        reason = `${place} is booked twice in the same slot per the record.`;
        fix = {
          kind: "reorder",
          description: canMove
            ? `Keep ${crewName(stay.crewId)} in the morning; move ${crewName(move.crewId)} to the afternoon in ${place}.`
            : `Agree a revised slot with ${crews} so ${place} is clear.`,
          messages,
        };
        break;
      }
      case "order_of_work": {
        const prereq = [...tasks].sort((a, b) => WORK_ORDER.indexOf(a.taskType) - WORK_ORDER.indexOf(b.taskType))[0];
        const prereqText = tasks.length > 1 && prereq ? lowerFirst(prereq.description) : "the prerequisite work";
        reason = `${prereqText.charAt(0).toUpperCase()}${prereqText.slice(1)} is not done yet per the record.`;
        fix = {
          kind: "hold",
          description: `Hold ${crews} until ${prereqText} is done.`,
          messages: toAll(`HOLD: ${reason}${sourceNote} Wait on ${element} until it is done.`),
        };
        break;
      }
      case "open_decision": {
        reason = `The decision on ${element} is not approved per the record.`;
        fix = {
          kind: "hold",
          description: `Hold ${crews} until the decision on ${element} is approved.`,
          messages: toAll(`HOLD: ${reason}${sourceNote} Wait until it is approved.`),
        };
        break;
      }
    }

    // An unsure record can request confirmation; it must not turn a warning into a work order.
    if (f.severity === "warn") {
      reason = f.summary;
      fix = {
        kind: "notify_crew",
        description: `Ask ${crews} to confirm the record before changing the plan.`,
        messages: toAll(`WARN: ${reason}${sourceNote} Please confirm the record before changing the plan.`),
      };
    }

    const question = (crewId: string) => {
      const task = tasks.find((t) => t.crewId === crewId);
      return task
        ? `Are you still planning ${lowerFirst(task.description)} ${SLOT_TEXT[task.slot]}?`
        : `Are you still planning work on ${element}?`;
    };

    // Listen rule, live: the crew that just spoke gets the fix; any other crew on the finding that has
    // said nothing since that statement is at risk and silent, so it gets a question, not an order.
    if (f.trigger !== "rehearsal") {
      const said = messages?.find((m) => m.id === f.sourceMessageId);
      if (!said?.crewId) return { ...base, ...fix };
      const silent = (crewId: string) =>
        crewId !== said.crewId && !messages!.some((m) => m.crewId === crewId && m.senderRole !== "system" && m.time >= said.time);
      return {
        ...base,
        ...fix,
        messages: fix.messages.map((m) =>
          silent(m.crewId) ? { crewId: m.crewId, text: `${question(m.crewId)} ${reason}${sourceNote} Reply before ${REPLY_BY}.` } : m,
        ),
      };
    }

    // Listen rule, evening: ask instead of tell when the crews went quiet since the change
    // (needs `messages`), or as a fallback without chat when every plan task is low confidence.
    const quiet = messages === undefined ? [] : silentCrews(f, messages);
    const silent = quiet.length === f.crewIds.length;
    const unsure =
      tasks.length > 0 &&
      tasks.length === f.taskIds.length &&
      tasks.every((t) => t.confidence < LISTEN_THRESHOLD) && messages === undefined;
    if (silent || unsure) {
      const replyBy = silent ? ` Reply before ${REPLY_BY}.` : "";
      return {
        ...base,
        kind: "ask_crew",
        description: silent
          ? `Ask ${crews} to confirm the plan before ${REPLY_BY}; they have not posted since the change.`
          : `Ask ${crews} to confirm the plan before the morning.`,
        messages: f.crewIds.map((crewId) => ({ crewId, text: `${question(crewId)} ${reason}${sourceNote}${replyBy}` })),
      };
    }

    return {
      ...base,
      ...fix,
      messages: fix.messages.map((m) => quiet.includes(m.crewId)
        ? { crewId: m.crewId, text: `${question(m.crewId)} ${reason}${sourceNote} Reply before ${REPLY_BY}.` }
        : m),
    };
  });
}
