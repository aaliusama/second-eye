import { useMemo, useState } from "react";
import type { ChatMessage, Scene } from "@site/contracts";
import type { AgentLogEntry } from "./api";
import { crewName, formatTime } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";

// On its own: what the site agent did without being asked, on the replay clock, from GET /api/agent/log.
// Every action cites the messages behind it (the contract requires at least one). Display only.

type Act = AgentLogEntry["actions"][number] & { id?: string; due?: string; urgency?: string; findingId?: string };
type Kind = "told" | "asked" | "brought" | "settled";

const KIND_OF: Record<string, Kind> = { send_dm: "told", follow_up: "asked", escalate: "brought", auto_resolve: "settled" };

/** Why the agent sent a crew a message, in site words. */
const WHY: Record<string, string> = {
  watch_crew_change: "On watch: this crew has missed changes before, so it gets each one as it lands",
  listen_question: "At risk and silent: asked to confirm before work starts",
  approved_fix_reminder: "Reminder of a fix you approved, at the start of their day",
  morning_briefing: "06:00 briefing: nothing open for them, per the record",
  clear: "The risk is gone per the record",
};

const VERB: Record<Kind, string> = { told: "Told", asked: "Asked again", brought: "Brought to you", settled: "Settled on its own" };

function headline(a: Act, scene: Scene, kind: Kind): string {
  const crew = a.crewId ? crewName(scene, a.crewId) : undefined;
  if (kind === "told") return `Told ${crew ?? "a crew"}`;
  if (kind === "asked") return `Asked ${crew ?? "a crew"} again`;
  if (kind === "brought") return a.urgency === "now" ? "Brought to you now" : "Brought to you for tonight";
  return "Settled on its own";
}

/** One sentence from what actually happened in this run, never from what the agent could do. */
function lede(kinds: readonly Kind[]): string {
  const parts = [
    kinds.includes("told") && "told crews about changes they had not heard",
    kinds.includes("asked") && "asked silent crews again",
    kinds.includes("settled") && "closed risks the record no longer shows",
    kinds.includes("brought") && "brought you only the decisions that are yours",
  ].filter(Boolean) as string[];
  if (parts.length === 0) return "Nothing yet.";
  const last = parts.pop()!;
  return `It ${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
}

/** "HOLD needs your decision: Per the record, ..." -> "Per the record, ..." The kind already says it. */
const body = (text?: string) => (text ?? "").replace(/^HOLD needs your decision:\s*/i, "");

export function Autonomy({ scene, messages, asOf }: { scene: Scene; messages: ChatMessage[]; asOf?: string }) {
  const all = useSite((s) => s.agentLog);
  const [filter, setFilter] = useState<Kind | "all">("all");

  const rows = useMemo(() => {
    const log = (all ?? []).filter((e) => !asOf || e.time <= asOf);
    return log.flatMap((step) => [
      ...step.actions.map((a) => ({ time: step.time, a: a as Act, held: false })),
      ...((step.queued ?? []) as Act[]).map((a) => ({ time: step.time, a, held: true })),
    ]).flatMap((r) => {
      const kind = KIND_OF[r.a.kind ?? r.a.type ?? ""];
      return kind ? [{ ...r, kind }] : [];
    });
  }, [all, asOf]);

  if (!all) return null;

  const count = (k: Kind) => rows.filter((r) => r.kind === k && !r.held).length;
  const held = rows.filter((r) => r.held).length;
  const crewsTold = new Set(rows.filter((r) => r.kind === "told" && r.a.crewId).map((r) => r.a.crewId)).size;
  const shown = [...rows].reverse().filter((r) => filter === "all" || r.kind === filter);
  // Group by site day, newest first.
  const days = [...new Map(shown.map((r) => [r.time.slice(0, 10), [] as typeof shown])).entries()];
  for (const r of shown) days.find(([d]) => d === r.time.slice(0, 10))![1].push(r);
  const who = (c: string) => crewName(scene, c);
  // Only what actually happened: a zero is not a capability shown.
  const kinds = (["told", "brought", "asked", "settled"] as const).filter((k) => count(k) > 0);
  const stats = [
    ...kinds.map((k) => ({ label: k === "told" ? "Crews told" : VERB[k], n: count(k), note: k === "told" ? `to ${crewsTold} crews` : undefined })),
    ...(held > 0 ? [{ label: "Held for quiet hours", n: held, note: undefined }] : []),
  ];

  return (
    <section className="panel autonomy" aria-labelledby="autonomy-title">
      <p className="knowledge-kicker">On its own</p>
      <h2 id="autonomy-title" className="knowledge-headline">
        {rows.length === 0 ? "Nothing done on its own yet" : <>{rows.length} actions before anyone asked</>}
      </h2>
      <p className="knowledge-lede">
        {lede(kinds)} Every action cites the messages behind it.
      </p>

      {stats.length > 0 && (
        <dl className="auto-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s) => (
            <div key={s.label}><dt>{s.label}</dt><dd>{s.n}{s.note && <span> {s.note}</span>}</dd></div>
          ))}
        </dl>
      )}

      <div className="auto-filter" role="group" aria-label="Show actions">
        {(["all", ...kinds] as const).map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === "all" ? "All" : VERB[k]}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="meta">Nothing of this kind on record.</p>}
      {days.map(([day, list]) => (
        <div key={day} className="auto-day">
          <h3 className="auto-date">{formatTime(`${day}T00:00:00`).slice(0, -6)}</h3>
          <ol className="auto-list">
            {list.map(({ time, a, held: isHeld, kind }, i) => (
              <li key={`${a.id ?? i}-${time}-${isHeld}`} className={`auto-item ${kind}${isHeld ? " held" : ""}`}>
                <span className="auto-mark" aria-hidden="true" />
                <div className="auto-body">
                  <p className="auto-head">
                    <strong>{headline(a, scene, kind)}</strong>
                    <span className="auto-time">{time.slice(11, 16)}</span>
                  </p>
                  {isHeld && <p className="auto-held">Held until {a.due ? formatTime(a.due) : "the morning"}: quiet hours</p>}
                  {a.text && <p className="auto-text">{kind === "brought" ? body(a.text) : a.text}</p>}
                  {kind === "told" && a.reason && <p className="auto-why">{WHY[a.reason] ?? a.reason.replace(/_/g, " ")}</p>}
                  {kind === "settled" && a.reason && <p className="auto-why">{a.reason}</p>}
                  {a.sourceMessageIds?.length ? (
                    <p className="auto-source">Because of {a.sourceMessageIds.map((id) => sourceLine(describeSource(id, messages, who))).join("; ")}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
