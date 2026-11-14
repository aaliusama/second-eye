import { useEffect, useMemo, useRef } from "react";
import type { Scene } from "@site/contracts";
import { crewHue, formatTime, knowledgeMatrix, threadLabel } from "./derive";

// Who knows what. Every change since the drawing, against every crew, from the threads each crew
// reads. The same rule the checks use: a change said in a thread a crew does not read has not
// reached that crew. Display only; the record is not changed here.

export function Knowledge({
  scene,
  flagged,
  lens,
  selectedElementId,
  onLens,
  onSelectElement,
}: {
  /** The element on the plan right now: its rows are marked and scrolled into view. */
  selectedElementId?: string;
  scene: Scene;
  /** From the open findings: where the checks say a crew's work meets an element. */
  flagged?: Set<string>;
  lens?: string;
  onLens: (crewId: string | undefined) => void;
  onSelectElement: (elementId: string) => void;
}) {
  const { rows, versions } = useMemo(() => knowledgeMatrix(scene, flagged), [scene, flagged]);
  const cells = rows.flatMap((r) => r.cells);
  const unheard = cells.filter((c) => !c.heard).length;
  const exposed = cells.filter((c) => c.exposed).length;
  const lensCrew = scene.crews.find((c) => c.id === lens);
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    if (!selectedElementId) return;
    tableRef.current?.querySelector(`tr[data-el="${CSS.escape(selectedElementId)}"]`)?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [selectedElementId, rows.length]);

  return (
    <section className="panel knowledge" aria-labelledby="knowledge-title">
      <p className="knowledge-kicker">Who knows what</p>
      <h2 id="knowledge-title" className="knowledge-headline">
        {versions <= 1 ? "Every crew works from the same floor" : <>One floor, <em>{versions} versions</em> of it</>}
      </h2>
      <p className="knowledge-lede">
        A change only reaches the crews that read the thread it was said in. Of {cells.length} change notices, {unheard} never
        reached a crew{exposed > 0 ? <>; <strong>{exposed}</strong> meet that crew's planned work, per the checks</> : null}.
      </p>

      {rows.length === 0 ? (
        <p className="meta">No changes since the drawing, per the record.</p>
      ) : (
        <div className="matrix-wrap">
          <table className="matrix" ref={tableRef}>
            <caption className="visually-hidden">Changes since the drawing against each crew: heard or not heard</caption>
            <thead>
              <tr>
                <th scope="col" className="matrix-change">Change, per the record</th>
                {scene.crews.map((c) => (
                  <th scope="col" key={c.id}>
                    <button
                      type="button"
                      className="matrix-crew"
                      aria-pressed={lens === c.id}
                      title={`See the floor as ${c.name} knows it`}
                      style={{ ["--crew" as string]: crewHue(scene, c.id) }}
                      onClick={() => onLens(lens === c.id ? undefined : c.id)}
                    >
                      {c.letter}
                      <span className="visually-hidden">{c.name}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hot = r.cells.some((c) => c.exposed);
                return (
                  <tr key={`${r.elementId}-${r.version}`} data-el={r.elementId} className={[hot ? "hot" : "", r.elementId === selectedElementId ? "selected" : ""].join(" ").trim() || undefined}>
                    <th scope="row">
                      <button type="button" className="matrix-row" onClick={() => onSelectElement(r.elementId)}>
                        <span className="matrix-name">{r.name}</span>
                        <span className="matrix-what">
                          {r.what} · {threadLabel(scene, r.thread)} · {formatTime(r.time)}
                        </span>
                      </button>
                    </th>
                    {r.cells.map((c) => {
                      const crew = scene.crews.find((x) => x.id === c.crewId);
                      const state = c.heard ? "heard" : c.exposed ? "exposed" : "unheard";
                      const words = c.heard ? "heard" : c.exposed ? "not heard, and the checks found their planned work meets it" : "not heard";
                      return (
                        <td key={c.crewId} className={lens === c.crewId ? "in-lens" : undefined}>
                          <span className={`mark ${state}`} role="img" aria-label={`${crew?.name ?? c.crewId}: ${words}`} title={`${crew?.name}: ${words}`} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="matrix-key" aria-hidden="true">
        <span><i className="mark heard" />Heard</span>
        <span><i className="mark unheard" />Not heard</span>
        <span><i className="mark exposed" />Not heard, and it meets their work</span>
      </div>
      <p className="meta">
        {lensCrew
          ? `The plan now shows ${lensCrew.name}'s floor: solid lines are what they believe, dashed lines are the record they have not heard.`
          : "Choose a crew letter to see the floor as that crew knows it."}
      </p>
    </section>
  );
}
