import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, PostMessageResponse, Scene } from "@site/contracts";
import { announceChange, api, isQuestion, type Answer, type Briefing } from "./api";
import { crewName, formatTime } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";

// Owner: D. A crew lead's phone: a plain message thread. System replies lead with HOLD or CLEAR,
// then one reason, then the source. Questions go to /api/ask when the server has it.

interface Line {
  id: string;
  from: "crew" | "system";
  text: string;
  time?: string;
}

/** Source ids as words: "Lena Hofer · office · Thu 14:02", never a raw id. */
type Cite = (ids: string[]) => string;

function replyFor(r: PostMessageResponse, cite: Cite): string {
  const f = r.findings[0];
  if (f) {
    const sources = cite(f.evidenceMessageIds.length ? f.evidenceMessageIds : [f.sourceMessageId]);
    const more = r.findings.length > 1 ? ` (${r.findings.length - 1} more held)` : "";
    return `HOLD: ${f.summary}${more} Source: ${sources}.`;
  }
  if (r.intents.length > 0) {
    return `CLEAR: nothing on record conflicts with “${r.intents[0].description}”. Source: ${cite([r.message.id])}.`;
  }
  return `No plan was extracted, so this message has not been cleared. The offline demo only understands prepared messages; other wording needs live extraction and a working connection. Source: ${cite([r.message.id])}.`;
}

function answerText(a: Answer, cite: Cite): string {
  const src = a.sourceMessageIds.length ? ` Source: ${cite(a.sourceMessageIds)}.` : "";
  if (a.kind === "escalated") return `Sent to the superintendent: ${a.text}${src}`;
  if (a.kind === "not_found") return `Not found in the record. ${a.text}`.trim();
  return `${a.text}${src}`;
}

function briefingLines(b: Briefing): string[] {
  const list = b.lines ?? b.items;
  if (list?.length) return list.map((l) => (l.sourceMessageIds?.length ? `${l.text} (${l.sourceMessageIds.join(", ")})` : l.text));
  return b.text ? b.text.split("\n").filter(Boolean) : [];
}

export function Phone({
  scene,
  messages,
  day,
  compact,
  onPosted,
}: {
  scene: Scene;
  messages: ChatMessage[];
  day?: string;
  compact?: boolean;
  onPosted?: () => void;
}) {
  const [crewId, setCrewId] = useState(scene.crews[0]?.id ?? "");
  const [text, setText] = useState("");
  const [local, setLocal] = useState<Record<string, Line[]>>({});
  const [sending, setSending] = useState(false);
  const [briefing, setBriefing] = useState<string[] | null | undefined>(undefined);
  const [showBriefing, setShowBriefing] = useState(false);
  const crew = scene.crews.find((c) => c.id === crewId);
  const citeFrom =
    (extra: ChatMessage[] = []): Cite =>
    (ids) =>
      ids.map((id) => sourceLine(describeSource(id, [...messages, ...extra], (c) => crewName(scene, c)))).join("; ");

  useEffect(() => {
    setBriefing(undefined);
    setShowBriefing(false);
    if (!crewId || !day) return;
    let live = true;
    api
      .briefing(crewId, day)
      .then((b) => live && setBriefing(b ? briefingLines(b) : null))
      .catch(() => live && setBriefing(null));
    return () => {
      live = false;
    };
  }, [crewId, day]);

  const thread: Line[] = [
    ...messages
      .filter((m) => m.crewId === crewId && (m.thread === "site-group" || m.thread === `dm:${crewId}`))
      .map((m): Line => ({ id: m.id, from: m.senderRole === "system" ? "system" : "crew", text: m.text, time: m.time })),
  ];
  // Local replies sit right after the message they answer.
  const lines: Line[] = [];
  for (const l of thread) {
    lines.push(l);
    lines.push(...(local[l.id] ?? []));
  }
  for (const [after, extra] of Object.entries(local)) if (!thread.some((l) => l.id === after)) lines.push(...extra);

  /** One send path for typed and presenter-scripted messages: the same API calls either way. */
  async function submit(body: string, as: { id: string; name: string } | undefined): Promise<void> {
    if (!body || !as) return;
    setSending(true);
    try {
      if (isQuestion(body)) {
        const answer = await api.ask(as.id, body);
        if (answer) {
          const key = `q-${Date.now()}`;
          setLocal((s) => ({
            ...s,
            [key]: [
              { id: `${key}-q`, from: "crew", text: body },
              { id: `${key}-a`, from: "system", text: answerText(answer, citeFrom()) },
            ],
          }));
          setText("");
          announceChange();
          onPosted?.();
          return;
        }
      }
      const r = await api.postMessage({
        thread: "site-group",
        senderName: as.name,
        senderRole: "crew_lead",
        crewId: as.id,
        text: body,
        kind: "text",
      });
      setLocal((s) => ({ ...s, [r.message.id]: [{ id: `${r.message.id}-reply`, from: "system", text: replyFor(r, citeFrom([r.message])) }] }));
      setText("");
      announceChange();
      onPosted?.();
    } catch (err) {
      setLocal((s) => ({ ...s, [`err-${Date.now()}`]: [{ id: `err-${Date.now()}`, from: "system", text: `Not sent: ${String(err)}` }] }));
    } finally {
      setSending(false);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    void submit(text.trim(), crew);
  }

  // Presenter mode: a scripted message is sent at once (no typing effect) through submit().
  const script = useSite((s) => s.phoneScript);
  const handled = useRef(0);
  useEffect(() => {
    if (!script || script.nonce === handled.current) return;
    handled.current = script.nonce;
    const as = scene.crews.find((c) => c.id === script.crewId);
    if (as) setCrewId(as.id);
    void submit(script.text, as).finally(script.done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  // Keep the newest message in view, so an answer is never below the fold of the thread.
  const listRef = useRef<HTMLOListElement>(null);
  const lineCount = lines.length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineCount, sending]);

  return (
    <section className={`phone${compact ? " compact" : ""}`} aria-label="Crew phone">
      <header>
        <label>
          <span className="meta">Texting as</span>
          <select value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            {scene.crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.letter} · {c.name}
              </option>
            ))}
          </select>
        </label>
        {briefing !== null && briefing !== undefined && (
          <button type="button" className="quiet" aria-expanded={showBriefing} onClick={() => setShowBriefing((v) => !v)}>
            Morning briefing
          </button>
        )}
      </header>
      {showBriefing && briefing && (
        <div className="briefing">
          <h3>Morning briefing{day ? ` · ${formatTime(`${day}T00:00:00`).slice(0, -6)}` : ""}</h3>
          {briefing.length === 0 ? <p className="meta">Nothing on record for this crew.</p> : briefing.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
      <ol className="bubbles" aria-live="polite" ref={listRef}>
        {lines.length === 0 && <li className="meta">No messages from this crew yet.</li>}
        {lines.map((l) => (
          <li key={l.id} className={l.from}>
            <p>{l.text}</p>
            {l.time && <span className="meta">{formatTime(l.time)}</span>}
          </li>
        ))}
      </ol>
      <form onSubmit={(e) => void send(e)}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What is your crew doing tomorrow?"
          aria-label={`Message as ${crew?.name ?? "crew"}`}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
      <p className="meta sim">Simulated site data</p>
    </section>
  );
}
