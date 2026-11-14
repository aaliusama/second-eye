import type { ChatMessage, Finding, Fix, PlanTask, Scene } from "@site/contracts";
import { resolvedFindingIds } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";

// Ordered for the superintendent's first question: which crew is about to build on old information?
const checkPriority: Record<Finding["check"], number> = {
  latest_change: 0, order_of_work: 1, space_clash: 2, open_decision: 3,
};

const title: Record<Finding["check"], string> = {
  latest_change: "A change may not have reached the crew",
  order_of_work: "Check what must happen first",
  open_decision: "A decision is still open",
  space_clash: "Two plans need the same space",
};

const incidentKey = (finding: Finding) => [
  finding.check, [...finding.crewIds].sort().join("+"), [...finding.elementIds].sort().join("+"),
].join("|");

const slotWord: Record<PlanTask["slot"], string> = { morning: "morning", afternoon: "afternoon", full_day: "all day" };
const task = (t: string) => t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
/** Formatting only: a recorded YYYY-MM-DD shown as "Sat 14 Nov". */
const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/** A short decision list over the existing record, not another checking engine. */
export function IncidentFocus({ scene, findings, fixes, messages, onInspect }: {
  scene: Scene;
  findings: Finding[];
  fixes: Fix[];
  messages: ChatMessage[];
  onInspect: (finding: Finding) => void;
}) {
  const approve = useSite((s) => s.approve);
  const busy = useSite((s) => s.busy);
  const error = useSite((s) => s.error);
  const crewName = (id: string) => scene.crews.find((crew) => crew.id === id)?.name ?? "Crew not found";
  const resolved = resolvedFindingIds(fixes, findings);
  const active = findings.filter((finding) => !resolved.has(finding.id)).sort((a, b) =>
    Number(a.severity !== "hold") - Number(b.severity !== "hold") ||
    checkPriority[a.check] - checkPriority[b.check] ||
    a.time.localeCompare(b.time) || a.id.localeCompare(b.id) || a.trigger.localeCompare(b.trigger),
  );
  const groups = new Map<string, Finding[]>();
  for (const finding of active) {
    const key = incidentKey(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  const all = [...groups.values()];
  const incidents = all.slice(0, 3);
  const firstWork = scene.tasks
    .filter((t) => t.status === "planned" && all.some((g) => g.some((f) => f.taskIds.includes(t.id))))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.slot === "afternoon" ? 1 : 0) - (b.slot === "afternoon" ? 1 : 0))[0];

  return <section className="incident-focus" aria-label="Priority site decisions">
    <header>
      <p className="incident-count">
        {all.length === 0 ? "Nothing flagged" : `${all.length} to settle`}
        {firstWork && <span> before {dayLabel(firstWork.day)} {slotWord[firstWork.slot]}</span>}
      </p>
      {all.length > incidents.length && <p className="meta">Showing the first {incidents.length}. The rest are under Record and in the approval list below.</p>}
    </header>
    {incidents.length === 0 && <div className="incident-empty">
      <h3>No open findings in this view</h3>
      <p className="meta">The record has no flagged conflict here. This does not verify the work on site.</p>
    </div>}
    <ol className="incident-list">
      {incidents.map((group) => {
        const finding = group[0]!;
        const ids = new Set(group.map((item) => item.id));
        const relatedFixes = fixes.filter((fix) => ids.has(fix.findingId));
        const pending = relatedFixes.find((fix) => fix.status === "pending");
        const sent = relatedFixes.some((fix) => fix.status === "approved");
        const tasks = scene.tasks.filter((t) => group.some((item) => item.taskIds.includes(t.id)));
        const places = [...new Set([
          ...tasks.map((t) => t.placeId),
          ...finding.elementIds.filter((id) => scene.elements.some((element) => element.id === id && (element.type === "room" || element.type === "zone"))),
        ])].map((id) => scene.elements.find((element) => element.id === id)?.name).filter(Boolean);
        const place = places.join(" / ") || scene.elements.find((element) => finding.elementIds.includes(element.id))?.name || "Place not found";
        const crews = finding.crewIds.map(crewName).join(" + ");
        const sources = [...new Set(group.flatMap((item) => [item.sourceMessageId, ...item.evidenceMessageIds]))];
        const state = sent && !pending ? "awaiting" : finding.severity;
        const recipients = pending ? [...new Set(pending.messages.map((message) => crewName(message.crewId)))].join(" + ") : "";
        const work = [...new Set(tasks.map((t) => `${crewName(t.crewId)}: ${task(t.taskType)}, ${dayLabel(t.day)} ${slotWord[t.slot]}`))].slice(0, 2);
        return <li className={`incident-item ${state}`} key={incidentKey(finding)}>
          <div className="incident-place"><span>{place}</span><span className="severity">{state === "awaiting" ? "Waiting for reply" : finding.severity === "hold" ? "Hold" : "Confirm"}</span></div>
          <h3 className="incident-title">{title[finding.check]}</h3>
          {work.length > 0 ? <ul className="incident-work">{work.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="incident-crew">{crews}</p>}
          {finding.ghost && <p className="incident-offset">{finding.ghost.label} <span className="meta">between the line the crew last heard and the latest recorded line</span></p>}
          {pending && <button className="incident-action primary" type="button" disabled={!!busy} onClick={() => void approve(pending.id)}>
            {busy === pending.id ? "Sending…" : pending.kind === "ask_crew" ? `Ask ${recipients}` : `Send correction to ${recipients}`}
          </button>}
          {state === "awaiting" && <p className="incident-waiting">Sent to {crews}. Still held until they reply; sending is not confirmation.</p>}
          <div className="incident-links">
            <button className="quiet" type="button" onClick={() => onInspect(finding)}>Show on plan</button>
            <details className="incident-detail">
              <summary>{pending ? "Why, and the exact message" : "Why"}</summary>
              <p>{finding.summary}</p>
              {finding.severity === "warn" && <p className="meta">The record is uncertain. Confirm the missing information before treating this as a conflict.</p>}
              {sources.map((id) => {
                const source = describeSource(id, messages, crewName);
                return <blockquote key={id}><p>{source.text ?? "Source text not found"}</p><footer>{sourceLine(source)}</footer></blockquote>;
              })}
              {pending ? <div className="incident-next">
                <h4>What will be sent</h4>
                {pending.messages.map((message, index) => <blockquote key={`${message.crewId}-${index}`}><p>{message.text}</p><footer>To {crewName(message.crewId)}</footer></blockquote>)}
              </div> : !sent && <p className="meta">No pending correction found. Review the source record with the superintendent.</p>}
            </details>
          </div>
        </li>;
      })}
    </ol>
    {error && <p className="error" role="alert">{error}</p>}
    <span className="sim">Simulated site data</span>
  </section>;
}
