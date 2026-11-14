import { useState } from "react";
import type { ChatMessage, ElementChange, Finding, Fix, Scene } from "@site/contracts";
import type { UnresolvedItem } from "./api";
import { crewName, elementById, findingKey, formatTime, sourceLabel } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite, type Selection } from "./store";

// Owner: D. Panels beside the model. Words: sentence case, "per the record", no apologies.

/** A quoted source message, or the drawing it came from. No source, no row. */
export function Source({ id, messages, scene }: { id: string; messages: Map<string, ChatMessage>; scene: Scene }) {
  const drawing = sourceLabel(id);
  if (drawing) return <span className="source">{drawing}</span>;
  const m = messages.get(id);
  if (!m) return <span className="source">Source {id}, not in the loaded record</span>;
  return (
    <blockquote className="source">
      <p>“{m.text}”</p>
      <footer>
        {sourceLine(describeSource(id, [m], (c) => crewName(scene, c)))}
      </footer>
    </blockquote>
  );
}

const change = (h: ElementChange) => {
  switch (h.operationType) {
    case "add":
      return "Added to the record";
    case "move":
      return "Moved";
    case "set_status":
      return `Marked ${h.state ?? "changed"}`;
    case "remove":
      return "Removed";
    case "plan_task":
      return "Planned work";
  }
};

export function Inspector({
  scene,
  selection,
  findings,
  messages,
  onClose,
}: {
  scene: Scene;
  selection: Selection;
  findings: Finding[];
  messages: Map<string, ChatMessage>;
  onClose: () => void;
}) {
  if (!selection) return null;
  const finding = selection.kind === "finding" ? findings.find((f) => findingKey(f) === selection.key) : undefined;
  const el = elementById(scene, selection.kind === "element" ? selection.id : finding?.ghost?.elementId ?? finding?.elementIds[0]);
  const related = el ? findings.filter((f) => f.elementIds.includes(el.id) && f.id !== finding?.id) : [];
  const uniqueRelated = [...new Map(related.map((f) => [f.id, f])).values()];

  return (
    <aside className="inspector" aria-label="Inspector">
      <header>
        <h2>{finding ? "Why this is held" : el?.name ?? "Not found"}</h2>
        <button type="button" className="quiet" onClick={onClose}>
          Close
        </button>
      </header>
      {finding && <FindingBlock f={finding} scene={scene} messages={messages} />}
      {el && (
        <section>
          {finding && <h3>{el.name}</h3>}
          <p className="meta">
            {el.id} · {el.type} · {el.state} per the record
            {el.aliases.length > 0 && <> · crews say {el.aliases.map((a) => `“${a}”`).join(", ")}</>}
          </p>
          <h3>History</h3>
          <ol className="history">
            {[...el.history].reverse().map((h) => (
              <li key={h.version}>
                <p>
                  <strong>v{h.version}</strong> {change(h)} · {formatTime(h.time)} · confidence {Math.round(h.confidence * 100)}%
                </p>
                <Source id={h.sourceMessageId} messages={messages} scene={scene} />
              </li>
            ))}
          </ol>
        </section>
      )}
      {uniqueRelated.map((f) => (
        <FindingBlock key={findingKey(f)} f={f} scene={scene} messages={messages} />
      ))}
    </aside>
  );
}

function FindingBlock({ f, scene, messages }: { f: Finding; scene: Scene; messages: Map<string, ChatMessage> }) {
  const setTrace = useSite((s) => s.setTrace);
  return (
    <section className="finding">
      <p className="severity">
        {f.severity === "hold" ? "Hold" : "Check"} · {f.check.replace(/_/g, " ")} · {f.trigger === "live" ? "live check" : "evening rehearsal"}
      </p>
      <p>{f.summary}</p>
      <button type="button" className="quiet trace-open" onClick={() => setTrace(findingKey(f))}>
        How it decided
      </button>
      {f.ghost && <p className="meta">Ghost offset: {f.ghost.label}</p>}
      <h3>What was said</h3>
      <Source id={f.sourceMessageId} messages={messages} scene={scene} />
      {f.evidenceMessageIds.length > 0 && (
        <>
          <h3>What {f.crewIds.map((id) => crewName(scene, id)).join(" and ")} did not hear</h3>
          {f.evidenceMessageIds.map((id) => (
            <Source key={id} id={id} messages={messages} scene={scene} />
          ))}
        </>
      )}
    </section>
  );
}

// ---------- Approval queue ----------

export function Queue({ scene, fixes, findings, messages }: { scene: Scene; fixes: Fix[]; findings: Finding[]; messages: ChatMessage[] }) {
  const approve = useSite((s) => s.approve);
  const busy = useSite((s) => s.busy);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const ordered = [...fixes].reverse().sort((a, b) => Number(a.status === "approved") - Number(b.status === "approved"));

  if (ordered.length === 0) return <p className="meta">Nothing waiting. Every plan on record checks out.</p>;
  return (
    <ol className="queue-list">
      {ordered.map((fix) => {
        const f = byId.get(fix.findingId);
        const crews = [...new Set(fix.messages.map((m) => m.crewId))].map((id) => crewName(scene, id)).join(" and ");
        const sent = messages.filter((m) => m.id.startsWith(`sent-${fix.id}-`));
        const done = fix.status === "approved";
          const awaiting = done && f?.check === "latest_change";
        return (
            <li key={fix.id} className={`fix ${awaiting ? "awaiting" : done ? "done" : f?.severity === "hold" ? "hold" : ""}`}>
            {f && <p className="problem">{f.summary}</p>}
            <p className="proposal">{fix.kind === "ask_crew" ? `Question for ${crews}: ` : ""}{fix.description}</p>
            {!done && (
              <>
                <p className="draft">“{fix.messages[0]?.text}”</p>
                <button type="button" disabled={busy === fix.id} onClick={() => void approve(fix.id)}>
                  {fix.kind === "ask_crew" ? `Ask ${crews}` : `Send fix to ${crews}`}
                </button>
              </>
            )}
            {done && (
              <>
                <p className="sent-mark">{awaiting ? "Sent · confirmation or recheck pending" : "Fix sent"}</p>
                {sent.map((m) => (
                  <p key={m.id} className="draft">
                    To {crewName(scene, m.crewId ?? "")}: “{m.text}”
                  </p>
                ))}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Learning ----------

const guessPhrase = (text: string) =>
  /\bthe [a-z]+ (room|bath|bathroom|unit|kitchen|flat)\b/i.exec(text)?.[0]?.toLowerCase() ?? "";

function TeachRow({ item, scene }: { item: UnresolvedItem; scene: Scene }) {
  const teach = useSite((s) => s.teach);
  const busy = useSite((s) => s.busy);
  const rooms = scene.elements.filter((e) => e.type === "room" || e.type === "zone");
  const [alias, setAlias] = useState(item.phrase ?? guessPhrase(item.text));
  const [place, setPlace] = useState(rooms[0]?.id ?? "");
  return (
    <li className="teach">
      <p className="draft">
        “{item.text}”{item.crewId ? ` · ${crewName(scene, item.crewId)}` : ""}
      </p>
      <div className="row">
        <label>
          Crews say
          <input value={alias} onChange={(e) => setAlias(e.target.value)} />
        </label>
        <label>
          It means
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" disabled={!alias.trim() || !place || busy === item.messageId} onClick={() => void teach(item, alias.trim(), place)}>
        Remember this place
      </button>
    </li>
  );
}

export function Learning({ scene, items }: { scene: Scene; items: UnresolvedItem[] | null | undefined }) {
  const runAgain = useSite((s) => s.runAgain);
  const busy = useSite((s) => s.busy);
  return (
    <section className="panel" id="learning">
      <h2>Learning</h2>
      <p className="meta">Places crews named that the record could not place, and runs that reuse what was confirmed.</p>
      {items && items.length === 0 && <p className="meta">Every place in the record is resolved.</p>}
      {items && items.length > 0 && (
        <ol className="plain">
          {items.map((it) => (
            <TeachRow key={it.messageId} item={it} scene={scene} />
          ))}
        </ol>
      )}
      <div className="row">
        <button type="button" disabled={busy === "reset"} onClick={() => void runAgain(true)}>
          Run again with what we learned
        </button>
        <button type="button" className="quiet" disabled={busy === "reset"} onClick={() => void runAgain(false)}>
          Start clean
        </button>
      </div>
    </section>
  );
}

// ---------- Agent log ----------

export function AgentLog({ scene, messages, asOf }: { scene: Scene; messages: ChatMessage[]; asOf?: string }) {
  const all = useSite((s) => s.agentLog);
  if (!all) return null;
  // The record shown as of an earlier time must not list what the agent did later.
  const log = asOf ? all.filter((entry) => entry.time <= asOf) : all;
  return (
    <section className="panel">
      <h2>What the system did on its own</h2>
      {log.length === 0 && <p className="meta">Nothing yet.</p>}
      <ol className="plain log">
        {[...log].reverse().map((entry, i) => (
          <li key={`${entry.time}-${i}`}>
            <p className="meta">{formatTime(entry.time)}</p>
            {entry.actions.map((a, j) => (
              <p key={j}>
                <strong>{(a.kind ?? a.type ?? "action").replace(/_/g, " ")}</strong>
                {a.crewId ? ` · ${crewName(scene, a.crewId)}` : ""}
                {a.text ? `: ${a.text}` : ""}
                {a.reason && <span className="meta"> ({a.reason.replace(/_/g, " ")})</span>}
                {a.sourceMessageIds?.length ? (
                  <span className="meta"> · {a.sourceMessageIds.map((id) => sourceLine(describeSource(id, messages, (c) => crewName(scene, c)))).join("; ")}</span>
                ) : null}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Record ----------

export function Record({ scene, messages }: { scene: Scene; messages: ChatMessage[] }) {
  const setAsOf = useSite((s) => s.setAsOf);
  const asOf = useSite((s) => s.asOf);
  const said = messages.filter((m) => m.senderRole !== "system");
  return (
    <section className="panel">
      <h2>The record</h2>
      <p className="meta">Every change in the model comes from one of these messages.</p>
      <ol className="plain record">
        {[...said].reverse().map((m) => (
          <li key={m.id} className={asOf === m.time ? "current" : ""}>
            <p className="meta">
              {formatTime(m.time)} · {sourceLine({ ...describeSource(m.id, [m], (c) => crewName(scene, c)), when: "" })}
            </p>
            <p>{m.text}</p>
            {/* The time view replays the golden record only; live messages are not in it. */}
            {!m.id.startsWith("live-") && (
              <button type="button" className="quiet" onClick={() => void setAsOf(m.time)}>
                Model after this message
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Eval ----------

/** The Numbers beat: the same eval results, large enough to read in a recording. */
export function MeasuredLarge() {
  const results = useSite((s) => s.evalResults);
  return (
    <section className="measured-large" aria-label="Measured results">
      <h2>Measured</h2>
      {!results ? (
        <p className="meta">Not found: no eval results on record. Run npm run eval.</p>
      ) : (
        <>
          <p className="caveat">
            npm run eval · replay {results.replayId} · {results.cases} labelled {results.cases === 1 ? "case" : "cases"}. Synthetic labelled scenario, not field
            results.
          </p>
          <table className="numbers">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Caught</th>
                <th scope="col">Missed</th>
                <th scope="col">False alarms</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(results.perCheck).map(([check, c]) => (
                <tr key={check}>
                  <th scope="row">{check.replace(/_/g, " ")}</th>
                  <td>{c.caught}</td>
                  <td>{c.missed}</td>
                  <td>{c.falseAlarms}</td>
                </tr>
              ))}
              <tr className="total">
                <th scope="row">Total</th>
                <td>{results.total.caught}</td>
                <td>{results.total.missed}</td>
                <td>{results.total.falseAlarms}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      <span className="sim">Simulated site data</span>
    </section>
  );
}

export function Measured() {
  const results = useSite((s) => s.evalResults);
  return (
    <section className="panel" id="measured">
      <h2>Measured</h2>
      {!results && <p className="meta">Not found: no eval results on record. Run npm run eval.</p>}
      {results && (
        <>
          <p className="meta">
            From npm run eval on replay {results.replayId}, {results.cases} labelled {results.cases === 1 ? "case" : "cases"}.
          </p>
          <table className="numbers">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Caught</th>
                <th scope="col">Missed</th>
                <th scope="col">False alarms</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(results.perCheck).map(([check, c]) => (
                <tr key={check}>
                  <th scope="row">{check.replace(/_/g, " ")}</th>
                  <td>{c.caught}</td>
                  <td>{c.missed}</td>
                  <td>{c.falseAlarms}</td>
                </tr>
              ))}
              <tr className="total">
                <th scope="row">Total</th>
                <td>{results.total.caught}</td>
                <td>{results.total.missed}</td>
                <td>{results.total.falseAlarms}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
