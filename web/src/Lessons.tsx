import type { ChatMessage, Correction, Scene } from "@site/contracts";
import { crewName, elementById, formatTime } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";
import "./lessons.css";

// What it has learned, as a before and after side by side. Both sides come from the record only:
// "before" is the message that taught the lesson, "after" is the messages since that the lesson
// handled. Nothing is assumed: no such message says "not used again yet". Undo removes the lesson
// and reruns, so the next run behaves as before it was learned.

type Alias = Extract<Correction, { kind: "location_alias" }>;
type Watch = Extract<Correction, { kind: "crew_misread" }>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Undo({ c, what }: { c: Correction; what: string }) {
  const busy = useSite((s) => s.busy);
  const undo = useSite((s) => s.undo);
  const mine = busy === `undo:${c.id}`;
  return (
    <button
      type="button"
      className="quiet lesson-undo"
      disabled={busy !== undefined}
      onClick={() => void undo(c.id)}
      aria-label={`Undo: forget ${what} and run again without it`}
      title="Removes this lesson and runs again, so the next run behaves as before it was learned"
    >
      {mine ? "Undoing…" : "Undo"}
    </button>
  );
}

function AliasLesson({ c, scene, messages, unresolved }: { c: Alias; scene: Scene; messages: ChatMessage[]; unresolved: Set<string> }) {
  const place = elementById(scene, c.elementId)?.name ?? c.elementId;
  const alias = c.alias.toLowerCase();
  // A lesson is applied when a run starts (POST /api/reset), never mid-run. Applied = the room carries the nickname now.
  const applied = elementById(scene, c.elementId)?.aliases.some((a) => a.toLowerCase() === alias) ?? false;
  const uses = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(alias)}($|[^\\p{L}\\p{N}])`, "u");
  const who = (id: string) => crewName(scene, id);
  const before = describeSource(c.sourceMessageId, messages, who);
  // After: crew messages posted in this run that use the nickname and were not sent to you to map.
  // Only in a run that started with the lesson; replay messages without a plan are not counted.
  const handled = applied
    ? messages.filter(
        (m) =>
          m.crewId &&
          (m.id === c.sourceMessageId || m.id.startsWith(`${c.sourceMessageId}-`) || m.id.startsWith("live-")) &&
          uses.test(m.text.toLowerCase()) &&
          !unresolved.has(m.id),
      )
    : [];
  const stillAsked = applied ? messages.filter((m) => m.crewId && m.id.startsWith("live-") && uses.test(m.text.toLowerCase()) && unresolved.has(m.id)) : [];
  const taught = formatTime(c.time);
  return (
    <li className="lesson">
      <div className="lesson-head">
        <div>
          <p className="lesson-kind">Nickname</p>
          <h3 className="lesson-title">“{c.alias}” <span aria-hidden="true">→</span><span className="visually-hidden">means</span> {place}</h3>
        </div>
        <Undo c={c} what={`“${c.alias}” means ${place}`} />
      </div>
      <p className="lesson-summary">
        {applied ? "Earlier run" : "This run"}: “{c.alias}” not understood, asked you.{" "}
        {handled.length > 0
          ? <>This run: understood on its own {handled.length === 1 ? "once" : `${handled.length} times`}, because of a correction taught {taught}.</>
          : applied
            ? <>This run: not used again yet. The correction taught {taught} is applied.</>
            : <>Not used again yet. Applies from the next run.</>}
      </p>
      <div className="lesson-pair">
        <div className="lesson-side before">
          <p className="lesson-label">Before · {applied ? "the run that taught it" : "this run"}</p>
          {before.text ? <blockquote>“{before.text}”</blockquote> : <p className="lesson-missing">That message is from an earlier run and is not in this run’s record.</p>}
          <p>“{c.alias}” matched no known place, so it asked you instead of guessing.</p>
          {before.kind !== "unknown" && <p className="lesson-src">{sourceLine(before)}</p>}
        </div>
        <div className="lesson-side after">
          <p className="lesson-label">After · {applied ? "this run" : "next run"}</p>
          {handled.length > 0 ? (
            <ul className="lesson-uses">
              {handled.map((m) => (
                <li key={m.id}>
                  <blockquote>“{m.text}”</blockquote>
                  <p>{m.id === c.sourceMessageId ? "Same words again" : sourceLine(describeSource(m.id, messages, who))}: read as {place} on its own, without asking you.</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lesson-missing">Not used again yet.{applied ? "" : " Press “Run again with what we learned” to apply it."}</p>
          )}
          {stillAsked.length > 0 && <p>Still asked you about {stillAsked.length} message{stillAsked.length === 1 ? "" : "s"} that use it.</p>}
        </div>
      </div>
      <p className="lesson-foot">Correction taught {taught} · from {sourceLine(before)}</p>
    </li>
  );
}

function WatchLesson({ c, scene, messages }: { c: Watch; scene: Scene; messages: ChatMessage[] }) {
  const log = useSite((s) => s.agentLog) ?? [];
  const sent = log.flatMap((e) => e.actions).filter((a) => a.kind === "send_dm" && a.reason === "watch_crew_change" && a.crewId === c.crewId);
  const crew = crewName(scene, c.crewId);
  const taught = formatTime(c.time);
  return (
    <li className="lesson">
      <div className="lesson-head">
        <div>
          <p className="lesson-kind">Crew on watch</p>
          <h3 className="lesson-title">{crew}</h3>
        </div>
        <Undo c={c} what={`the watch on ${crew}`} />
      </div>
      <p className="lesson-summary">
        Earlier run: {crew} missed a change. This run:{" "}
        {sent.length > 0
          ? <>sent {sent.length} change{sent.length === 1 ? "" : "s"} the moment {sent.length === 1 ? "it" : "they"} landed, because of a lesson learned {taught}.</>
          : <>not used again yet.</>}
      </p>
      <div className="lesson-pair">
        <div className="lesson-side before">
          <p className="lesson-label">Before · the run that taught it</p>
          <p>{c.note}</p>
        </div>
        <div className="lesson-side after">
          <p className="lesson-label">After · this run</p>
          {sent.length > 0 ? (
            <ul className="lesson-uses">
              {sent.map((a, i) => (
                <li key={i}>{a.text ? <blockquote>“{a.text}”</blockquote> : null}<p>Sent to {crew} as the change landed, before it stated a plan.</p></li>
              ))}
            </ul>
          ) : (
            <p className="lesson-missing">Not used again yet.</p>
          )}
        </div>
      </div>
      <p className="lesson-foot">Learned {taught} · from {sourceLine(describeSource(c.sourceMessageId, messages, (id) => crewName(scene, id)))}</p>
    </li>
  );
}

export function Lessons({ scene, messages }: { scene: Scene; messages: ChatMessage[] }) {
  const corrections = useSite((s) => s.corrections);
  const unresolvedItems = useSite((s) => s.unresolved);
  if (corrections === null || corrections === undefined) return null;
  const unresolved = new Set((unresolvedItems ?? []).map((u) => u.messageId));
  const aliases = corrections.filter((c): c is Alias => c.kind === "location_alias");
  const watches = corrections.filter((c): c is Watch => c.kind === "crew_misread");
  const decisions = corrections.filter((c) => c.kind === "fix_decision").length;
  const total = aliases.length + watches.length;
  return (
    <section className="panel lessons" id="learning" aria-labelledby="lessons-title">
      <p className="knowledge-kicker">What it has learned</p>
      <h2 id="lessons-title" className="knowledge-headline">
        {total === 0 ? "Nothing learned yet" : <>{total} lesson{total === 1 ? "" : "s"} that change the next run</>}
      </h2>
      <p className="knowledge-lede">
        {total === 0
          ? "When you place a nickname, or a crew keeps missing changes, it is kept here with its source and changes the next run. No model is retrained."
          : "Each lesson is stored with its source and applied by rule on the next run. Before and after come from the record. Undo forgets a lesson and runs again without it. No model is retrained."}
      </p>
      {total > 0 && (
        <ol className="lesson-list">
          {aliases.map((c) => <AliasLesson key={c.id} c={c} scene={scene} messages={messages} unresolved={unresolved} />)}
          {watches.map((c) => <WatchLesson key={c.id} c={c} scene={scene} messages={messages} />)}
        </ol>
      )}
      {decisions > 0 && <p className="meta">Also kept: {decisions} of your fix decision{decisions === 1 ? "" : "s"}.</p>}
    </section>
  );
}
