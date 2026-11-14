import { useState } from "react";
import type { ChatMessage, Finding, Fix, PlanTask, Rehearsal, Scene } from "@site/contracts";
import { clock, resolvedFindingIds } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";

// Ordered for the superintendent's first question: which crew is about to build on old information?
const checkPriority: Record<Finding["check"], number> = {
  latest_change: 0, order_of_work: 1, space_clash: 2, open_decision: 3,
};

const title: Record<Finding["check"], string> = {
  latest_change: "Changed since the crew last heard",
  order_of_work: "Booked before the work it depends on",
  open_decision: "Booked before it is decided",
  space_clash: "Two crews booked in one place",
};

const incidentKey = (finding: Finding) => [
  finding.check, [...finding.crewIds].sort().join("+"), [...finding.elementIds].sort().join("+"),
].join("|");

const slotWord: Record<PlanTask["slot"], string> = { morning: "morning", afternoon: "afternoon", full_day: "all day" };
const task = (t: string) => t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
/** What the crew will do, as a superintendent says it. "other" has no verb: the sentence leaves it out. */
const verb: Partial<Record<PlanTask["taskType"], string>> = {
  layout: "lay out", rough_in_plumbing: "rough in", rough_in_electrical: "rough in", inspection: "inspect",
  close_wall: "close the wall", finish_drywall: "finish drywall", paint: "paint", tile: "tile", install_fixtures: "install fixtures",
};
/** Replay-clock day arithmetic only: "2026-11-14" is "Tomorrow" when the record's time is on 13 Nov. */
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** Formatting only: a recorded YYYY-MM-DD shown as "Sat 14 Nov". */
const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/**
 * Open incidents in the order the superintendent settles them, and the first planned work they touch.
 * Shared by the desk list and the page heading so both always agree on what comes first.
 */
export function rankIncidents(scene: Scene, findings: Finding[], fixes: Fix[], rehearsal?: Rehearsal, now?: string) {
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
  const firstWork = scene.tasks
    .filter((t) => t.status === "planned" && all.some((g) => g.some((f) => f.taskIds.includes(t.id))))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.slot === "afternoon" ? 1 : 0) - (b.slot === "afternoon" ? 1 : 0))[0];
  // "Tomorrow 07:00": the day relative to the record's clock, the hour from the rehearsal frame where that work starts.
  const today = now?.slice(0, 10);
  const relDay = firstWork && (firstWork.day === today ? "Today" : today && firstWork.day === nextDay(today) ? "Tomorrow" : dayLabel(firstWork.day));
  const frame = firstWork && rehearsal?.day === firstWork.day ? rehearsal.frames.find((f) => f.activeTaskIds.includes(firstWork.id)) : undefined;
  const start = firstWork ? `${relDay} ${frame ? clock(frame.time) : slotWord[firstWork.slot]}` : undefined;
  return { all, firstWork, start, when: firstWork ? `${dayLabel(firstWork.day)} ${slotWord[firstWork.slot]}` : undefined };
}

/**
 * The worst open incident as one sentence a superintendent would say, e.g.
 * "<crew> plans to rough in against <wall>, which moved <offset>." Every part comes from the finding
 * and its tasks; a part that is not on record is left out.
 */
export function worstLine(scene: Scene, finding: Finding): string {
  const name = (id: string) => scene.elements.find((e) => e.id === id)?.name;
  const crewNames = finding.crewIds.map((id) => scene.crews.find((c) => c.id === id)?.name).filter(Boolean);
  const crews = crewNames.join(" and ");
  const t = scene.tasks.find((x) => finding.taskIds.includes(x.id));
  const doing = t && verb[t.taskType];
  const place = (t && name(t.placeId)) ?? finding.elementIds.map(name).find(Boolean);
  if (finding.check === "latest_change" && finding.ghost && crews) {
    const found = name(finding.ghost.elementId);
    const el = found ? `the ${found}` : "a wall";
    const plan = doing ? `${crews} plans to ${doing} against ${el}` : `${crews} works against ${el}`;
    return `${plan}${finding.ghost.label ? `, which moved ${finding.ghost.label}` : ""}. They may not have heard.`;
  }
  if (finding.check === "space_clash" && crewNames.length > 1) return `${crews} are both booked in ${place ?? "the same place"} at the same time.`;
  if (finding.check === "open_decision" && crews) return `${crews} ${doing ? `plans to ${doing}` : "is booked"}${place ? ` in ${place}` : ""} before it is decided.`;
  return incidentLead(scene, finding);
}

/** The top incident in one sentence, from the finding itself. */
export function incidentLead(scene: Scene, finding: Finding): string {
  const name = (id: string) => scene.elements.find((e) => e.id === id)?.name;
  const crews = finding.crewIds.map((id) => scene.crews.find((c) => c.id === id)?.name ?? id).join(" and ");
  if (finding.check === "latest_change" && finding.ghost) {
    const el = name(finding.ghost.elementId) ?? "a wall";
    return `${el} moved ${finding.ghost.label}, and ${crews} may not have heard.`;
  }
  const place = finding.elementIds.map(name).find(Boolean);
  return `${title[finding.check]}${place ? `: ${place}` : ""}, ${crews}.`;
}

/** A short decision list over the existing record, not another checking engine. */
export function IncidentFocus({ scene, findings, fixes, messages, onInspect, onTrace }: {
  scene: Scene;
  findings: Finding[];
  fixes: Fix[];
  messages: ChatMessage[];
  onInspect: (finding: Finding) => void;
  /** Open "How it decided" for this finding. */
  onTrace?: (finding: Finding) => void;
}) {
  const approve = useSite((s) => s.approve);
  const busy = useSite((s) => s.busy);
  const error = useSite((s) => s.error);
  const crewName = (id: string) => scene.crews.find((crew) => crew.id === id)?.name ?? "Crew not found";
  const { all, firstWork } = rankIncidents(scene, findings, fixes);
  const [showAll, setShowAll] = useState(false);
  const incidents = showAll ? all : all.slice(0, 3);

  return <section className="incident-focus" aria-label="Priority site decisions">
    <header>
      <p className="incident-count">
        {all.length === 0 ? "Nothing to settle" : "The plan, in this order"}
        {all.length > 0 && firstWork && <span> before {dayLabel(firstWork.day)} {slotWord[firstWork.slot]}</span>}
      </p>
      {all.length > 3 && <p className="meta">{showAll ? `All ${all.length}, most urgent first.` : `The 3 most urgent of ${all.length}.`}</p>}
    </header>
    {incidents.length === 0 && <div className="incident-empty">
      <h3>Nothing flagged for this day</h3>
      <p className="meta">The record shows no clash here. That does not mean the work on site is checked.</p>
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
        const crews = finding.crewIds.map(crewName).join(" and ");
        const sources = [...new Set(group.flatMap((item) => [item.sourceMessageId, ...item.evidenceMessageIds]))];
        const state = sent && !pending ? "awaiting" : finding.severity;
        const recipients = pending ? [...new Set(pending.messages.map((message) => crewName(message.crewId)))].join(" and ") : "";
        const work = [...new Set(tasks.map((t) => `${crewName(t.crewId)}: ${task(t.taskType)}, ${dayLabel(t.day)} ${slotWord[t.slot]}`))].slice(0, 2);
        return <li className={`incident-item ${state}`} key={incidentKey(finding)}>
          <div className="incident-place"><span>{place}</span><span className="severity">{state === "awaiting" ? "Waiting for reply" : finding.severity === "hold" ? "Hold" : "Check"}</span></div>
          <h3 className="incident-title">{title[finding.check]}</h3>
          {work.length > 0 ? <ul className="incident-work">{work.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="incident-crew">{crews}</p>}
          {finding.ghost && <p className="incident-offset">{finding.ghost.label} <span className="meta">from where they last heard it was</span></p>}
          {pending && <button className="incident-action primary" type="button" disabled={!!busy} onClick={() => void approve(pending.id)}>
            {busy === pending.id ? "Sending…" : pending.kind === "ask_crew" ? `Ask ${recipients}` : `Send correction to ${recipients}`}
          </button>}
          {state === "awaiting" && <p className="incident-waiting">Sent to {crews}. Still on hold until they reply: sent is not confirmed.</p>}
          <div className="incident-links">
            <button className="quiet" type="button" onClick={() => onInspect(finding)}>Show on plan</button>
            {onTrace && <button className="quiet" type="button" onClick={() => onTrace(finding)}>How it decided</button>}
            <details className="incident-detail">
              <summary>{pending ? "Why, and what will be sent" : "Why"}</summary>
              <p>{finding.summary}</p>
              {finding.severity === "warn" && <p className="meta">The record is not sure. Get the missing detail before treating this as a clash.</p>}
              {sources.map((id) => {
                const source = describeSource(id, messages, crewName);
                return <blockquote key={id}><p>{source.text ?? "Source text not found"}</p><footer>{sourceLine(source)}</footer></blockquote>;
              })}
              {pending ? <div className="incident-next">
                <h4>What will be sent</h4>
                {pending.messages.map((message, index) => <blockquote key={`${message.crewId}-${index}`}><p>{message.text}</p><footer>To {crewName(message.crewId)}</footer></blockquote>)}
              </div> : !sent && <p className="meta">No correction drafted for this one. Read the messages above and settle it before work starts.</p>}
            </details>
          </div>
        </li>;
      })}
    </ol>
    {all.length > 3 && <button type="button" className="quiet incident-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show only the 3 most urgent" : `Show the other ${all.length - 3}`}</button>}
    {error && <p className="error" role="alert">{error}</p>}
    <span className="sim">Simulated site data</span>
  </section>;
}
