import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { CircleCheck, Clock, MessageSquareQuote, Ruler, ScanText, Scale } from "lucide-react";
import type { ChatMessage, Finding, Fix, IncidentReceipt, Scene } from "@site/contracts";
import { api, onChange } from "./api";
import { elementById, formatTime } from "./derive";
import { RECEIPT_TONE, UNSURE_BELOW, confidenceView, traceOf, type TraceFix } from "./howDecided";
import "./trace.css";

// Owner: D. "How it decided": message -> fact the language model read -> rule -> measured result and receipt.
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

const FIX_MARK: Record<TraceFix["status"], string> = {
  pending: "pending", waiting: "pending", superseded: "pending", rejected: "soft", sent: "ink", confirmed: "clear",
};
const RECEIPT_WORD: Record<TraceFix["status"], string> = {
  pending: "Not sent", waiting: "Waiting for crew", sent: "Waiting for crew", superseded: "Newer revision", confirmed: "Crew confirmed", rejected: "Rejected",
};

const NOT_FOUND = "not found";

// One staggered reveal of the four steps when the trace opens; under reduced motion it starts at the end state.
// Opacity and a small horizontal shift only, so the presenter's vertical scroll target is not displaced.
const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, x: -6 }, shown: { opacity: 1, x: 0, transition: { duration: 0.22, ease: "easeOut" } } };

function Step({ n, side, icon, title, actor, children }: { n: number; side: "model" | "rule"; icon: ReactNode; title: string; actor?: ReactNode; children: ReactNode }) {
  return (
    <motion.li variants={item} className={`trace-step ${side}-side`}>
      <span className="trace-n" aria-hidden="true">
        {n}
      </span>
      <h3>
        <span className="trace-icon" aria-hidden="true">
          {icon}
        </span>
        {title} {actor}
      </h3>
      {children}
    </motion.li>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="trace-field">
      <dt>{label}</dt>
      <dd className={value ? undefined : "missing"}>{value || NOT_FOUND}</dd>
    </div>
  );
}

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
  const reduced = useReducedMotion();
  const icon = { size: 15, strokeWidth: 1.75 };

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
          <motion.ol className="trace-steps" variants={list} initial={reduced ? false : "hidden"} animate="shown" key={finding?.id}>
            <Step n={1} side="model" icon={<MessageSquareQuote {...icon} />} title="Said">
              {trace.messages.map((m) => (
                <figure key={m.source.id} className="trace-quote">
                  <figcaption>{m.role === "trigger" ? "The crew's statement the check ran on" : "Evidence in the record"}</figcaption>
                  <dl className="trace-fields">
                    <Field label="Who" value={m.source.kind === "unknown" ? undefined : m.source.who} />
                    <Field label="Thread" value={m.source.where} />
                    <Field label="Replay time" value={m.source.when} />
                  </dl>
                  <blockquote>
                    <p className={m.source.text || m.source.kind === "drawing" ? undefined : "missing"}>
                      {m.source.text ? `“${m.source.text}”` : m.source.kind === "drawing" ? m.source.who : `Message text ${NOT_FOUND}`}
                    </p>
                  </blockquote>
                </figure>
              ))}
            </Step>
            <Step n={2} side="model" icon={<ScanText {...icon} />} title="Read into facts" actor={<span className="trace-actor">Language model</span>}>
              {trace.messages.map((m) => (
                <div key={m.source.id} className="trace-facts">
                  <p className="trace-from">From {m.role === "trigger" ? "the statement" : `${m.source.who}${m.source.when ? `, ${m.source.when}` : ""}`}</p>
                  {m.facts.length === 0 ? (
                    <p className="meta missing">Not found: no extracted fact in the record carries this message.</p>
                  ) : (
                    <ul>
                      {m.facts.map((f, i) => {
                        const c = confidenceView(f.confidence);
                        return (
                          <li key={i} className={c.unsure ? "unsure" : undefined}>
                            <span>{f.text}</span>
                            <span className={`trace-conf${c.unsure ? " unsure" : ""}`}>
                              confidence {c.pct}
                              {c.unsure && <span className="trace-unconfirmed">unconfirmed</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
              <p className="meta">
                Each reading keeps its source message and confidence; below {Math.round(UNSURE_BELOW * 100)}% it stays unconfirmed and cannot make a hold. In this demo, stored
                readings are replayed offline.
              </p>
            </Step>
            <motion.li variants={item} className="trace-boundary" aria-hidden="true">
              <span>Language model above · rules below</span>
            </motion.li>
            <Step n={3} side="rule" icon={<Scale {...icon} />} title="Rule applied" actor={<span className="trace-actor rules">Rules, no language model</span>}>
              <p className="trace-verdict">
                <strong>{trace.finding.check}</strong> check · {trace.finding.when}
              </p>
              {trace.rule ? (
                <>
                  <p className="trace-rule">{trace.rule.statement}</p>
                  <p className="trace-rule-id">
                    Rule <span>{trace.rule.id}</span> · same record, same result
                  </p>
                </>
              ) : (
                <p className="meta missing">Rule {NOT_FOUND}: it was not recorded with this finding.</p>
              )}
            </Step>
            <Step n={4} side="rule" icon={<Ruler {...icon} />} title="Measured result">
              <p className="trace-verdict">
                <strong className={`trace-sev ${finding?.severity ?? ""}`}>{trace.finding.severity}</strong> · {trace.finding.summary}
              </p>
              {trace.finding.offset && <p className="trace-number">{trace.finding.offset}</p>}
              {trace.finding.numbers.map((n) => (
                <p key={n} className="trace-measure">
                  {n}
                </p>
              ))}
              {!trace.finding.offset && trace.finding.numbers.length === 0 && <p className="meta missing">Measured offset or clearance {NOT_FOUND} for this finding.</p>}
              {trace.finding.note && <p className="meta">{trace.finding.note}</p>}
              <h4 className="trace-sub">Fix and crew receipt</h4>
              {trace.fixes.length === 0 ? (
                <p className="meta missing">Not found: no fix proposed for this finding.</p>
              ) : (
                trace.fixes.map((f) => {
                  const tone = RECEIPT_TONE[f.status];
                  return (
                    <div key={f.id} className="trace-fix">
                      <p>{f.description}</p>
                      <p className={`trace-status ${FIX_MARK[f.status]}`} data-receipt={tone}>
                        <span className={`trace-receipt ${tone}`}>
                          {tone === "confirmed" ? <CircleCheck size={13} strokeWidth={2} aria-hidden="true" /> : tone === "waiting" ? <Clock size={13} strokeWidth={2} aria-hidden="true" /> : null}
                          {RECEIPT_WORD[f.status]}
                        </span>
                        <span>{f.words}</span>
                      </p>
                    </div>
                  );
                })
              )}
            </Step>
          </motion.ol>
        </>
      )}
      <span className="sim">Simulated site data</span>
    </section>
  );
}
