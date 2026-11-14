import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { BatteryFull, CircleCheck, Signal, Wifi } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ChatMessage, IncidentReceipt, PostMessageResponse, Scene } from "@site/contracts";
import { announceChange, api, isQuestion, onChange, type Answer, type Briefing } from "./api";
import { clock, crewName, formatTime } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";
import "./phone.css";

// Owner: D. A crew lead's phone: a plain message thread. System replies lead with HOLD or CLEAR,
// then one reason, then the source. Questions go to /api/ask when the server has it.

interface Line {
  id: string;
  from: "crew" | "system";
  text: string;
  time?: string;
  /** The live finding a local HOLD reply answers, so it can be tied to an approved fix. */
  findingId?: string;
  /** The words that failed to send, so the error line can offer a retry. */
  retry?: string;
}

/** A system reply read back into its parts: verdict, one-sentence reason, next step, source. */
interface Verdict {
  kind: "hold" | "clear" | "unchecked";
  reason: string;
  next: string;
  source: string;
}

const BADGE: Record<Verdict["kind"], string> = { hold: "HOLD", clear: "CLEAR", unchecked: "Not checked" };

function firstSentence(s: string): string {
  const m = /^.*?[.!?](?=\s|$)/.exec(s.trim());
  return (m ? m[0] : s).trim();
}

/** "HOLD: <reason> Source: <who · where · when>. <next step>" -> its parts. Undefined for plain text. */
function readVerdict(text: string): Verdict | undefined {
  const head = /^(HOLD|CLEAR|Not checked):\s*/.exec(text);
  if (!head) return undefined;
  const kind = head[1] === "HOLD" ? "hold" : head[1] === "CLEAR" ? "clear" : "unchecked";
  const body = text.slice(head[0].length);
  const at = body.indexOf(" Source: ");
  const said = at >= 0 ? body.slice(0, at) : body;
  const rest = at >= 0 ? body.slice(at + " Source: ".length) : "";
  const end = /\.(?=\s|$)/.exec(rest);
  const source = end ? rest.slice(0, end.index) : rest;
  const after = end ? rest.slice(end.index + 1).trim() : "";
  const reason = firstSentence(said);
  const next = [said.trim().slice(reason.length).trim(), after].filter(Boolean).join(" ");
  return { kind, reason, next, source: source.trim() };
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
  const how = (r as PostMessageResponse & { extraction?: string }).extraction;
  const why =
    how === "cache_miss_offline"
      ? "Live reading is off: the offline demo only reads prepared messages. Start it with npm run demo:live to read any wording."
      : how === "live_failed"
        ? "Live reading failed (no answer from the language model in time). Nothing was guessed."
        : "No plan for a future day was read from these words.";
  return `Not checked: ${why} This message has not been cleared. Source: ${cite([r.message.id])}.`;
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
  /** The words being checked, shown as the crew's bubble until the server answers. */
  const [pendingText, setPendingText] = useState("");
  /** True once a check has run past 8 s: a live model call, not a cached one. */
  const [slow, setSlow] = useState(false);
  const [receipts, setReceipts] = useState<IncidentReceipt[]>([]);
  const [confirming, setConfirming] = useState<string | undefined>(undefined);
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
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

  useEffect(() => {
    if (!sending) return;
    const id = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(id);
  }, [sending]);

  // Receipts of approved fixes: which HOLD lines this crew can confirm, and which it already did.
  const messageCount = messages.length;
  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .acknowledgements()
        .then((r) => {
          if (live) setReceipts(r.receipts);
        })
        .catch(() => undefined);
    void load();
    const off = onChange(() => void load());
    return () => {
      live = false;
      off();
    };
  }, [messageCount]);

  function receiptFor(l: Line): IncidentReceipt | undefined {
    const mine = receipts.filter((r) => r.crews.some((c) => c.crewId === crewId)).reverse();
    return (
      mine.find((r) => r.crews.some((c) => c.crewId === crewId && c.sentMessageId === l.id)) ??
      (l.findingId ? mine.find((r) => r.findingId === l.findingId) : undefined)
    );
  }

  async function confirm(fixId: string) {
    setConfirming(fixId);
    setConfirmError(undefined);
    try {
      const { receipt } = await api.acknowledge(fixId, crewId);
      setReceipts((rs) => rs.map((r) => (r.fixId === receipt.fixId ? receipt : r)));
      announceChange();
      onPosted?.();
    } catch (err) {
      setConfirmError(`Not confirmed: ${err instanceof Error ? err.message : String(err)}. Try again.`);
    } finally {
      setConfirming(undefined);
    }
  }

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
  // Questions and errors have no message to sit after: show only this crew's own.
  for (const [after, extra] of Object.entries(local))
    if (!thread.some((l) => l.id === after) && after.startsWith(`${crewId}|`)) lines.push(...extra);

  /** One send path for typed and presenter-scripted messages: the same API calls either way. */
  async function submit(body: string, as: { id: string; name: string } | undefined): Promise<void> {
    if (!body || !as) return;
    setSending(true);
    setPendingText(body);
    try {
      if (isQuestion(body)) {
        const answer = await api.ask(as.id, body);
        if (answer) {
          const key = `${as.id}|q-${Date.now()}`;
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
      setLocal((s) => ({
        ...s,
        [r.message.id]: [
          { id: `${r.message.id}-reply`, from: "system", text: replyFor(r, citeFrom([r.message])), findingId: r.findings[0]?.id },
        ],
      }));
      setText("");
      announceChange();
      onPosted?.();
    } catch (err) {
      const key = `${as.id}|err-${Date.now()}`;
      const why = err instanceof Error ? err.message : String(err);
      setLocal((s) => ({
        ...s,
        [key]: [
          { id: `${key}-q`, from: "crew", text: body },
          { id: key, from: "system", text: `Not sent: the check did not finish (${why}). Nothing was recorded. Try again.`, retry: body },
        ],
      }));
    } finally {
      setSending(false);
      setSlow(false);
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
    if (as) switchCrew(as.id);
    void submit(script.text, as).finally(script.done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  // Keep the newest message in view, so an answer is never below the fold of the thread.
  const listRef = useRef<HTMLOListElement | null>(null);
  // Subtle enter/leave for bubbles; auto-animate already skips motion under prefers-reduced-motion.
  const [animateRef, setAnimate] = useAutoAnimate<HTMLOListElement>({ duration: 180, easing: "ease-out" });
  // Switching crew swaps the whole thread: show it at once, animate only sends and replies.
  function switchCrew(id: string) {
    if (id !== crewId) setAnimate(false);
    setCrewId(id);
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [crewId, setAnimate]);
  const bindList = useCallback(
    (el: HTMLOListElement | null) => {
      listRef.current = el;
      animateRef(el);
    },
    [animateRef],
  );
  const reduceMotion = useReducedMotion();
  // The replay clock: the time of the newest message in the record, never the wall clock.
  const replayTime = messages.reduce((t, m) => (m.time > t ? m.time : t), "");
  const lineCount = lines.length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineCount, sending, slow, receipts, crewId]);
  // The desk tab mounts the phone hidden; when the thread first gets a size, start at the newest.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function card(l: Line, v: Verdict) {
    const receipt = v.kind === "hold" ? receiptFor(l) : undefined;
    const mine = receipt?.crews.find((c) => c.crewId === crewId);
    return (
      <article className={`verdict ${v.kind}`}>
        <p className="verdict-head">
          <span className="verdict-badge">{BADGE[v.kind]}</span>
          <span className="reason">{v.reason}</span>
        </p>
        {v.next && <p className="next">{v.next}</p>}
        {v.source && (
          <p className="source">
            <span className="label">Source</span> {v.source}
          </p>
        )}
        {receipt && mine && receipt.status !== "superseded" && (
          <div className="confirm">
            {mine.acknowledgedAt ? (
              <motion.p
                className="done receipt-badge"
                role="status"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <CircleCheck className="receipt-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  Confirmed <time dateTime={mine.acknowledgedAt}>{formatTime(mine.acknowledgedAt)}</time>
                </span>
              </motion.p>
            ) : (
              <>
                <button type="button" disabled={confirming === receipt.fixId} onClick={() => void confirm(receipt.fixId)}>
                  {confirming === receipt.fixId ? "Confirming…" : "Confirm"}
                </button>
                <span className="meta">Confirms this revision was received, not that work is done.</span>
                {confirmError && <span className="meta">{confirmError}</span>}
              </>
            )}
          </div>
        )}
        {receipt?.status === "superseded" && <p className="meta">A newer revision replaced this one.</p>}
        <details>
          <summary>Full message</summary>
          <p>{l.text}</p>
        </details>
      </article>
    );
  }

  return (
    <section className={`phone framed${compact ? " compact" : ""}`} aria-label="Crew phone">
      <div className="phone-status" aria-hidden="true">
        <span className="phone-clock">{replayTime ? clock(replayTime) : "--:--"}</span>
        <span className="phone-notch" />
        <span className="phone-icons">
          <Signal size={14} strokeWidth={1.75} />
          <Wifi size={14} strokeWidth={1.75} />
          <BatteryFull size={18} strokeWidth={1.5} />
        </span>
      </div>
      <header>
        <label>
          <span className="meta">Texting as</span>
          <select value={crewId} onChange={(e) => switchCrew(e.target.value)}>
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
      <ol className="bubbles" aria-live="polite" ref={bindList}>
        {lines.length === 0 && !sending && <li className="meta">No messages from this crew yet.</li>}
        {lines.map((l) => {
          const v = l.from === "system" ? readVerdict(l.text) : undefined;
          return (
            <li key={l.id} className={`${l.from}${v ? " has-verdict" : ""}`}>
              {v ? card(l, v) : <p>{l.text}</p>}
              {l.retry && (
                <button type="button" className="retry" disabled={sending} onClick={() => void submit(l.retry ?? "", crew)}>
                  Try again
                </button>
              )}
              {l.time && <span className="meta">{formatTime(l.time)}</span>}
            </li>
          );
        })}
        {sending && pendingText && (
          <li className="crew sending">
            <p>{pendingText}</p>
          </li>
        )}
        {sending && (
          <li className="system checking" role="status">
            <p>
              <span className="pulse" aria-hidden="true" />
              Checking against the record…
              {slow && <span className="slow">Still checking (live model)…</span>}
            </p>
          </li>
        )}
      </ol>
      <form onSubmit={(e) => void send(e)}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What is your crew doing tomorrow?"
          aria-label={`Message as ${crew?.name ?? "crew"}`}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          {sending ? "Checking" : "Send"}
        </button>
      </form>
      <p className="meta sim">Simulated site data</p>
      <span className="phone-home" aria-hidden="true" />
    </section>
  );
}
