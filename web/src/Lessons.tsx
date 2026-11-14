import type { ChatMessage, Correction, Scene } from "@site/contracts";
import { crewName, elementById, formatTime } from "./derive";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";

// What it has learned, each lesson beside its evidence: what happened before it was learned, and
// what the record shows since. The "after" is counted from the record, never assumed.

type Alias = Extract<Correction, { kind: "location_alias" }>;
type Watch = Extract<Correction, { kind: "crew_misread" }>;

function AliasLesson({ c, scene, messages }: { c: Alias; scene: Scene; messages: ChatMessage[] }) {
  const place = elementById(scene, c.elementId)?.name ?? c.elementId;
  const alias = c.alias.toLowerCase();
  // A lesson is applied when a run starts (POST /api/reset), never mid-run. Applied = the room carries the nickname now.
  const applied = elementById(scene, c.elementId)?.aliases.some((a) => a.toLowerCase() === alias) ?? false;
  const uses = new RegExp(`(^|[^\\p{L}\\p{N}])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u");
  // The same words again this run, else the latest crew message that uses the nickname.
  const again = messages.find((m) => m.id === c.sourceMessageId) ?? messages.filter((m) => m.crewId && uses.test(m.text.toLowerCase())).at(-1);
  const who = (id: string) => crewName(scene, id);
  const before = describeSource(c.sourceMessageId, messages, who);
  return (
    <li className="lesson">
      <p className="lesson-kind">Nickname</p>
      <h3 className="lesson-title">“{c.alias}” <span aria-hidden="true">→</span><span className="visually-hidden">means</span> {place}</h3>
      <div className="lesson-pair">
        <div className="lesson-side before">
          <p className="lesson-label">Before</p>
          {before.text && <blockquote>“{before.text}”</blockquote>}
          <p>Could not place it, so it asked you instead of guessing.</p>
        </div>
        <div className="lesson-side after">
          <p className="lesson-label">After</p>
          {applied && again ? (
            <>
              <blockquote>“{again.text}”</blockquote>
              <p>{again.id === c.sourceMessageId ? "Same words this run" : "This run"}: placed in {place} on its own, without asking you.</p>
            </>
          ) : applied ? (
            <p>Applied this run: a crew that says it is placed in {place}.</p>
          ) : (
            <p>Applies from the next run. Press “Run again with what we learned” to see it.</p>
          )}
        </div>
      </div>
      <p className="lesson-foot">Taught {formatTime(c.time)} · from {sourceLine(before)}</p>
    </li>
  );
}

function WatchLesson({ c, scene, messages }: { c: Watch; scene: Scene; messages: ChatMessage[] }) {
  const log = useSite((s) => s.agentLog) ?? [];
  const sent = log.flatMap((e) => e.actions).filter((a) => a.kind === "send_dm" && a.reason === "watch_crew_change" && a.crewId === c.crewId);
  const crew = crewName(scene, c.crewId);
  return (
    <li className="lesson">
      <p className="lesson-kind">Crew on watch</p>
      <h3 className="lesson-title">{crew}</h3>
      <div className="lesson-pair">
        <div className="lesson-side before">
          <p className="lesson-label">Before</p>
          <p>{c.note}</p>
        </div>
        <div className="lesson-side after">
          <p className="lesson-label">After</p>
          <p>{sent.length > 0 ? `Got ${sent.length} change${sent.length === 1 ? "" : "s"} the moment they landed, before stating any plan.` : "Gets each change the moment it lands, before it states a plan."}</p>
        </div>
      </div>
      <p className="lesson-foot">Learned {formatTime(c.time)} · from {sourceLine(describeSource(c.sourceMessageId, messages, (id) => crewName(scene, id)))}</p>
    </li>
  );
}

export function Lessons({ scene, messages }: { scene: Scene; messages: ChatMessage[] }) {
  const corrections = useSite((s) => s.corrections);
  if (corrections === null || corrections === undefined) return null;
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
          : "Each lesson is stored with its source and applied by rule on the next run. No model is retrained."}
      </p>
      {total > 0 && (
        <ol className="lesson-list">
          {aliases.map((c) => <AliasLesson key={c.id} c={c} scene={scene} messages={messages} />)}
          {watches.map((c) => <WatchLesson key={c.id} c={c} scene={scene} messages={messages} />)}
        </ol>
      )}
      {decisions > 0 && <p className="meta">Also kept: {decisions} of your fix decision{decisions === 1 ? "" : "s"}.</p>}
    </section>
  );
}
