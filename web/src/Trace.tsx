import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, Finding, Fix, IncidentReceipt, Scene } from "@site/contracts";
import { api, onChange } from "./api";
import { elementById, formatTime } from "./derive";
import { sourceLine } from "./sources";
import { traceOf, type TraceFix } from "./howDecided";

// Owner: D. "How it decided": message -> fact the language model read -> rule -> finding -> fix.
// The page states plainly which step is the language model and which steps are fixed rules.

/** Crew confirmations, so a sent fix can say "waiting" or "confirmed" from the record, not a guess. */
function useReceipts(revision: string): IncidentReceipt[] | undefined {
  const [receipts, setReceipts] = useState<IncidentReceipt[] | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const load = () =>
      api.acknowledgements().then(
        (r) => live && setReceipts(r.receipts),
        () => live && setReceipts(undefined),
      );
    void load();
    const off = onChange(() => void load());
    return () => {
      live = false;
      off();
    };
  }, [revision]);
  return receipts;
}

const pct = (c: number) => `${Math.round(c * 100)}%`;
const FIX_MARK: Record<TraceFix["status"], string> = {
  pending: "pending", waiting: "pending", superseded: "pending", rejected: "soft", sent: "ink", confirmed: "clear",
};

export function Trace({
  finding,
  scene,
  messages,
  fixes,
  onClose,
}: {
  finding: Finding | undefined;
  scene: Scene;
  messages: ChatMessage[];
  fixes: Fix[];
  onClose: () => void;
}) {
  const receipts = useReceipts(`${messages.length}:${fixes.map((f) => f.status).join("")}`);
  const trace = useMemo(() => (finding ? traceOf(finding, scene, messages, fixes, receipts, formatTime) : undefined), [finding, scene, messages, fixes, receipts]);
  const place = finding ? elementById(scene, finding.ghost?.elementId ?? finding.elementIds[0])?.name : undefined;

  return (
    <section className="trace" aria-labelledby="trace-title">
      <header className="trace-head">
        <div>
          <p className="trace-kicker">How it decided</p>
          <h2 id="trace-title">{trace ? `${place ?? "Place not found"}: ${trace.finding.check.toLowerCase()}` : "Finding not found"}</h2>
        </div>
        <button type="button" className="quiet" onClick={onClose}>
          Close
        </button>
      </header>
      {!trace ? (
        <p className="meta">This finding is no longer in the record shown. It may have been rechecked or the view changed.</p>
      ) : (
        <>
          <p className="trace-lede">The language model only reads messages into facts. Fixed rules make the decision, the same way every time.</p>
          <ol className="trace-steps">
            <li className="trace-step model-side">
              <span className="trace-n" aria-hidden="true">1</span>
              <h3>Said</h3>
              {trace.messages.map((m) => (
                <figure key={m.source.id} className="trace-quote">
                  <figcaption>{m.role === "trigger" ? "The crew's statement the check ran on" : "Evidence in the record"}</figcaption>
                  <blockquote>
                    <p>{m.source.text ? `“${m.source.text}”` : m.source.kind === "drawing" ? m.source.who : "Message text not found"}</p>
                    <footer>{sourceLine(m.source)}</footer>
                  </blockquote>
                </figure>
              ))}
            </li>
            <li className="trace-step model-side">
              <span className="trace-n" aria-hidden="true">2</span>
              <h3>
                Read into facts <span className="trace-actor">Language model</span>
              </h3>
              {trace.messages.map((m) => (
                <div key={m.source.id} className="trace-facts">
                  <p className="trace-from">From {m.role === "trigger" ? "the statement" : `${m.source.who}${m.source.when ? `, ${m.source.when}` : ""}`}</p>
                  {m.facts.length === 0 ? (
                    <p className="meta">Not found: no extracted fact in the record carries this message.</p>
                  ) : (
                    <ul>
                      {m.facts.map((f, i) => (
                        <li key={i}>
                          <span>{f.text}</span>
                          <span className="trace-conf">confidence {pct(f.confidence)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <p className="meta">The model's reading keeps its source message and confidence. In this demo, stored readings are replayed offline.</p>
            </li>
            <li className="trace-boundary" aria-hidden="true">
              <span>Language model above · rules below</span>
            </li>
            <li className="trace-step rule-side">
              <span className="trace-n" aria-hidden="true">3</span>
              <h3>
                Rule applied <span className="trace-actor rules">Rules, no language model</span>
              </h3>
              {trace.rule ? (
                <>
                  <p className="trace-rule">{trace.rule.statement}</p>
                  <p className="meta">Rule {trace.rule.id}. Same record, same result.</p>
                </>
              ) : (
                <p className="meta">The rule was not recorded with this finding.</p>
              )}
            </li>
            <li className="trace-step rule-side">
              <span className="trace-n" aria-hidden="true">4</span>
              <h3>Finding</h3>
              <p className="trace-verdict">
                <strong>{trace.finding.severity}</strong> · {trace.finding.check} · {trace.finding.when}
              </p>
              <p>{trace.finding.summary}</p>
              {trace.finding.offset && <p className="trace-number">{trace.finding.offset}</p>}
              {trace.finding.numbers.map((n) => (
                <p key={n} className="trace-measure">
                  {n}
                </p>
              ))}
              {trace.finding.note && <p className="meta">{trace.finding.note}</p>}
            </li>
            <li className="trace-step rule-side">
              <span className="trace-n" aria-hidden="true">5</span>
              <h3>Fix</h3>
              {trace.fixes.length === 0 ? (
                <p className="meta">Not found: no fix proposed for this finding.</p>
              ) : (
                trace.fixes.map((f) => (
                  <div key={f.id} className="trace-fix">
                    <p>{f.description}</p>
                    <p className={`trace-status ${FIX_MARK[f.status]}`}>{f.words}</p>
                  </div>
                ))
              )}
            </li>
          </ol>
        </>
      )}
      <span className="sim">Simulated site data</span>
    </section>
  );
}
