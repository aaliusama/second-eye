import { useEffect, useState, type FormEvent } from "react";
import type { ChatMessage, PostMessageResponse, Scene } from "@site/contracts";
import { announceChange, api, isQuestion, type Answer, type Briefing } from "./api";
import { formatTime } from "./derive";

// Owner: D. A crew lead's phone: a plain message thread. System replies lead with HOLD or CLEAR,
// then one reason, then the source. Questions go to /api/ask when the server has it.

interface Line {
  id: string;
  from: "crew" | "system";
  text: string;
  time?: string;
}

function replyFor(r: PostMessageResponse): string {
  const f = r.findings[0];
  if (f) {
    const sources = (f.evidenceMessageIds.length ? f.evidenceMessageIds : [f.sourceMessageId]).join(", ");
    const more = r.findings.length > 1 ? ` (${r.findings.length - 1} more held)` : "";
    return `HOLD: ${f.summary}${more} Source: ${sources}.`;
  }
  if (r.intents.length > 0) {
    return `CLEAR: nothing on record conflicts with “${r.intents[0].description}”. Source: ${r.message.id}.`;
  }
  return `Not found: no plan for tomorrow recognised in this message. Source: ${r.message.id}.`;
}

function answerText(a: Answer): string {
  const src = a.sourceMessageIds.length ? ` Source: ${a.sourceMessageIds.join(", ")}.` : "";
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

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !crew) return;
    setSending(true);
    try {
      if (isQuestion(body)) {
        const answer = await api.ask(crew.id, body);
        if (answer) {
          const key = `q-${Date.now()}`;
          setLocal((s) => ({
            ...s,
            [key]: [
              { id: `${key}-q`, from: "crew", text: body },
              { id: `${key}-a`, from: "system", text: answerText(answer) },
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
        senderName: crew.name,
        senderRole: "crew_lead",
        crewId: crew.id,
        text: body,
        kind: "text",
      });
      setLocal((s) => ({ ...s, [r.message.id]: [{ id: `${r.message.id}-reply`, from: "system", text: replyFor(r) }] }));
      setText("");
      announceChange();
      onPosted?.();
    } catch (err) {
      setLocal((s) => ({ ...s, [`err-${Date.now()}`]: [{ id: `err-${Date.now()}`, from: "system", text: `Not sent: ${String(err)}` }] }));
    } finally {
      setSending(false);
    }
  }

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
      <ol className="bubbles" aria-live="polite">
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
