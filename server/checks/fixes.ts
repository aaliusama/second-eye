import type { Finding, Fix, PlanTask, Scene, Slot, TaskType } from "@site/contracts";

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

export function proposeFixes(findings: Finding[], scene: Scene): Fix[] {
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

    // Listen rule: unsure plan in rehearsal, ask the crew instead of telling them.
    const unsure =
      f.trigger === "rehearsal" &&
      tasks.length > 0 &&
      tasks.length === f.taskIds.length &&
      tasks.every((t) => t.confidence < LISTEN_THRESHOLD);
    if (unsure) {
      return {
        ...base,
        kind: "ask_crew",
        description: `Ask ${crews} to confirm the plan before the morning.`,
        messages: f.crewIds.map((crewId) => {
          const task = tasks.find((t) => t.crewId === crewId) ?? tasks[0]!;
          return {
            crewId,
            text: `Are you still planning ${lowerFirst(task.description)} ${SLOT_TEXT[task.slot]}? ${reason}`,
          };
        }),
      };
    }

    return { ...base, ...fix };
  });
}
