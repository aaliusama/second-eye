import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, IncidentReceipt, Scene } from "@site/contracts";
import { api, onChange } from "./api";
import { buildChains, type Chain, type ChainStatus } from "./autonomyChain";
import { crewName, elementById } from "./derive";
import { describeSource, shortTime, sourceLine } from "./sources";
import { useSite } from "./store";
import "./autonomy.css";

// On its own: one card per risk the site agent handled, its steps in replay-clock order, from
// GET /api/agent/log plus fix status (GET /api/state) and crew receipts (GET /api/acknowledgements).
// Every step cites the messages behind it. A step the record does not show is not drawn. Display only.

const STATUS: Record<ChainStatus, string> = {
  needs_you: "Needs your decision",
  waiting_crew: "Waiting for crew",
  confirmed: "Crew confirmed",
  settled: "Settled on its own",
  following: "Agent following up",
};

type Filter = "all" | "needs_you" | "waiting_crew" | "closed";
const FILTER_LABEL: Record<Filter, string> = { all: "All", needs_you: "Needs you", waiting_crew: "Waiting for crew", closed: "Closed" };
const inFilter = (c: Chain, f: Filter) =>
  f === "all" || (f === "closed" ? c.status === "confirmed" || c.status === "settled" : c.status === f);

export function Autonomy({ scene, messages, asOf }: { scene: Scene; messages: ChatMessage[]; asOf?: string }) {
  const log = useSite((s) => s.agentLog);
  const findings = useSite((s) => s.state?.findings);
  const fixes = useSite((s) => s.state?.fixes);
  const [receipts, setReceipts] = useState<IncidentReceipt[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // Receipts change when a fix is sent or a crew confirms. Refetch on either, and on any announced change.
  const revision = `${messages.length}:${(fixes ?? []).map((f) => `${f.id}-${f.status}`).join(",")}`;
  useEffect(() => {
    let live = true;
    const load = () => api.acknowledgements().then((r) => live && setReceipts(r.receipts)).catch(() => live && setReceipts(null));
    void load();
    const off = onChange(() => void load());
    return () => { live = false; off(); };
  }, [revision]);

  const chains = useMemo(
    () =>
      buildChains({
        log: log ?? [],
        findings: findings ?? [],
        fixes: fixes ?? [],
        receipts,
        messages,
        asOf,
        crewName: (id) => crewName(scene, id),
        elementName: (id) => elementById(scene, id)?.name,
      }),
    [log, findings, fixes, receipts, messages, asOf, scene],
  );

  if (!log) return null;

  const who = (c: string) => crewName(scene, c);
  const steps = chains.flatMap((c) => c.steps);
  // Crews that got a message about a risk: from the agent (told, asked) or from a fix you approved (sent).
  const crewsTold = new Set(steps.filter((s) => (s.kind === "told" || s.kind === "asked" || s.kind === "sent") && s.heldUntil === undefined && s.crewId).map((s) => s.crewId)).size;
  const n = (k: string) => steps.filter((s) => s.kind === k).length;
  // Only what actually happened: a zero is not a capability shown.
  const stats = [
    { label: "Risks followed", n: chains.length },
    { label: "Brought to you", n: n("brought") },
    { label: "You approved", n: n("approved") },
    { label: "Crews told", n: crewsTold },
    { label: "Crew confirmed", n: n("confirmed") },
    { label: "Settled on its own", n: n("settled") },
  ].filter((s) => s.n > 0);
  const filters = (["all", "needs_you", "waiting_crew", "closed"] as const).filter((f) => f === "all" || chains.some((c) => inFilter(c, f)));
  const shown = chains.filter((c) => inFilter(c, filter));

  return (
    <section className="panel autonomy" aria-labelledby="autonomy-title">
      <p className="knowledge-kicker">On its own · Simulated site data</p>
      <h2 id="autonomy-title" className="knowledge-headline">
        {chains.length === 0 ? "Nothing done on its own yet" : <>{chains.length} risks followed before anyone asked</>}
      </h2>
      <p className="knowledge-lede">
        Each card is one risk, step by step: what it noticed, who it told or asked, what it brought to you, and what the record shows
        since. Every step cites the messages behind it; a step the record does not show is not drawn.
      </p>

      {stats.length > 0 && (
        <dl className="auto-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s) => (
            <div key={s.label}><dt>{s.label}</dt><dd>{s.n}</dd></div>
          ))}
        </dl>
      )}
      {receipts === null && <p className="meta">Crew replies: not found (the acknowledgements route did not answer).</p>}

      {filters.length > 1 && (
        <div className="auto-filter" role="group" aria-label="Show risks">
          {filters.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]} <span className="chain-count">{chains.filter((c) => inFilter(c, f)).length}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && <p className="meta">Nothing of this kind on record.</p>}
      <ol className="chain-list">
        {shown.map((c) => (
          <li key={c.findingId} className={`chain-card ${c.status}${c.lead ? " lead" : ""}`}>
            <header className="chain-head">
              <div>
                {c.lead && <p className="chain-lead">The ghost wall</p>}
                <h3 className="chain-title">{c.title}</h3>
                <p className="chain-crews">
                  {c.crewIds.map(who).join(", ")}
                  {c.ghost && <> · ghost <span className="chain-ghost">{c.ghost}</span></>}
                </p>
              </div>
              <span className={`chain-status ${c.status}`}>{STATUS[c.status]}</span>
            </header>
            <ol className="chain-steps">
              {c.steps.map((s) => (
                <li key={s.key} className={`chain-step ${s.kind}${s.open ? " open" : ""}${s.heldUntil !== undefined ? " held" : ""}`}>
                  <span className="chain-mark" aria-hidden="true" />
                  <div className="chain-body">
                    <p className="chain-step-head">
                      <strong>{s.title}</strong>
                      <span className="chain-time">{s.open ? "" : s.time ? shortTime(s.time) : "time not found"}</span>
                    </p>
                    {s.heldUntil !== undefined && (
                      <p className="chain-held">Held until {s.heldUntil ? shortTime(s.heldUntil) : "the morning"}: quiet hours</p>
                    )}
                    {s.text && <p className="chain-text">{s.text}</p>}
                    {s.why && <p className="chain-why">{s.why}</p>}
                    {s.sourceIds.length > 0 && (
                      <p className="chain-source">
                        {s.open ? "Sent as " : "Because of "}
                        {s.sourceIds.map((id) => sourceLine(describeSource(id, messages, who))).join("; ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
