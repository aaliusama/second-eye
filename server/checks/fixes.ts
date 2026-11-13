import type { ChatMessage, Finding, Fix, PlanTask, Scene, Slot, TaskType } from "@site/contracts";

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
 * Listen step: a crew is silent about a finding when it has posted nothing after the risk
 * entered the record. Every crew on the finding must be silent. Unknown risk time: not silent.
 */
function allCrewsSilent(f: Finding, messages: ChatMessage[]): boolean {
  const since = riskTime(f, messages);
  if (since === undefined) return false;
  return f.crewIds.every((crewId) => !messages.some((m) => m.crewId === crewId && m.time > since));
}

/**
 * One fix per finding. With `messages` (the chat so far), an evening rehearsal finding whose
 * crews have all been silent since the change becomes an ask_crew question. Without `messages`,
 * only the low-confidence listen rule applies. Live findings never become ask_crew.
 */
export function proposeFixes(findings: Finding[], scene: Scene, messages?: ChatMessage[]): Fix[] {
  const elementName = (id: string | undefined) =>
    id === undefined ? "the element" : (scene.elements.find((e) => e.id === id)?.name ?? id);
  const crewName = (id: string) => scene.crews.find((c) => c.id === id)?.name ?? id;
  const tasksOf = (f: Finding) =>
    f.taskIds.map((id) => scene.tasks.find((t) => t.id === id)).filter((t): t is PlanTask => t !== undefined);

  return findings.map((f) => {
    const sources = (f.evidenceMessageIds.length > 0 ? f.evidenceMessageIds : [f.sourceMessageId]).join(", ");
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
          ? `${element} moved ${f.ghost.label} per the record (${sources}).`
          : `${element} changed per the record (${sources}).`;
        fix = {
          kind: "notify_crew",
          description: `Send the latest ${element} position to ${crews} before they start.`,
          messages: toAll(`HOLD: ${reason} Work to the new line.`),
        };
        break;
      }
      case "space_clash": {
        const place = elementName(tasks[0]?.placeId ?? f.elementIds[0]);
        const messages = f.crewIds.map((crewId) => {
          const own = tasks.find((t) => t.crewId === crewId);
          const others = joinNames(f.crewIds.filter((c) => c !== crewId).map(crewName)) || "another crew";
          const slot = own?.slot ?? "morning";
          const move =
            slot === "morning"
              ? "Move to the afternoon."
              : slot === "afternoon"
                ? "Move to the morning."
                : "Split the day or move to another day.";
          return {
            crewId,
            text: `HOLD: ${others} is also in ${place} ${SLOT_TEXT[slot]} per the record (${sources}). ${move}`,
          };
        });
        reason = `${place} is booked twice in the same slot per the record (${sources}).`;
        fix = { kind: "reorder", description: `Move one crew to the other slot so ${place} is clear.`, messages };
        break;
      }
      case "order_of_work": {
        const prereq = [...tasks].sort((a, b) => WORK_ORDER.indexOf(a.taskType) - WORK_ORDER.indexOf(b.taskType))[0];
        const prereqText = tasks.length > 1 && prereq ? lowerFirst(prereq.description) : "the prerequisite work";
        reason = `${prereqText.charAt(0).toUpperCase()}${prereqText.slice(1)} is not done yet per the record (${sources}).`;
        fix = {
          kind: "hold",
          description: `Hold ${crews} until ${prereqText} is done.`,
          messages: toAll(`HOLD: ${reason} Wait on ${element} until it is done.`),
        };
        break;
      }
      case "open_decision": {
        reason = `The decision on ${element} is not approved per the record (${sources}).`;
        fix = {
          kind: "hold",
          description: `Hold ${crews} until the decision on ${element} is approved.`,
          messages: toAll(`HOLD: ${reason} Wait until it is approved.`),
        };
        break;
      }
    }

    // Listen rule, evening only: ask instead of tell when the crews went quiet since the change
    // (needs `messages`), or when every plan task behind the finding is low confidence.
    if (f.trigger !== "rehearsal") return { ...base, ...fix };
    const silent = messages !== undefined && allCrewsSilent(f, messages);
    const unsure =
      tasks.length > 0 &&
      tasks.length === f.taskIds.length &&
      tasks.every((t) => t.confidence < LISTEN_THRESHOLD);
    if (silent || unsure) {
      const replyBy = silent ? ` Reply before ${REPLY_BY}.` : "";
      return {
        ...base,
        kind: "ask_crew",
        description: silent
          ? `Ask ${crews} to confirm the plan before ${REPLY_BY}; they have not posted since the change.`
          : `Ask ${crews} to confirm the plan before the morning.`,
        messages: f.crewIds.map((crewId) => {
          const task = tasks.find((t) => t.crewId === crewId) ?? tasks[0];
          const question = task
            ? `Are you still planning ${lowerFirst(task.description)} ${SLOT_TEXT[task.slot]}?`
            : `Are you still planning work on ${element}?`;
          return { crewId, text: `${question} ${reason}${replyBy}` };
        }),
      };
    }

    return { ...base, ...fix };
  });
}
