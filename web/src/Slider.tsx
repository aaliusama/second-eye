import type { Finding, Rehearsal, Scene } from "@site/contracts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { criticalPathLine, graphView, mergeRestated, slipReadout, slotSpan, stackBars, type GraphEdgeView } from "./depth";
import { crewHue, crewName, elementById, formatTime, frameAt, SLIDER_STEPS, sliderClock, tasksOfDay, troubleSteps } from "./derive";
import { color, drawing } from "./tokens";

// Owner: D. Tomorrow's plan on a time slider. What is drawn is a pure function of the step:
// the same step always draws the same frame. No timers.
// With lane C's plan graph: arrows between dependent bars, the critical path emphasised, violated
// edges in redline, and "if this slips, these crews are blocked" for a selected bar.

type Arrow = { key: string; d: string; edge: GraphEdgeView };

/** Arrow paths between measured bar boxes, in px relative to the lanes box. Recomputed on resize. */
function useArrows(box: React.RefObject<HTMLDivElement | null>, bars: React.RefObject<Map<string, HTMLElement>>, edges: GraphEdgeView[], deps: string) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || edges.length === 0) return setArrows([]);
    const measure = () => {
      const origin = el.getBoundingClientRect();
      const rect = (id: string) => {
        const r = bars.current.get(id)?.getBoundingClientRect();
        return r && r.width > 0 ? { l: r.left - origin.left, r: r.right - origin.left, t: r.top - origin.top, b: r.bottom - origin.top, y: r.top - origin.top + r.height / 2 } : undefined;
      };
      const out: Arrow[] = [];
      for (const e of edges) {
        const a = rect(e.from);
        const b = rect(e.to);
        if (!a || !b) continue;
        if (b.l >= a.r - 4) {
          // In order: out of the prerequisite's end, into the dependent's start.
          const x1 = a.r - 2;
          const x2 = b.l + 2;
          const bend = Math.max(18, (x2 - x1) / 3);
          out.push({ key: e.key, edge: e, d: `M ${x1} ${a.y} C ${x1 + bend} ${a.y}, ${x2 - bend} ${b.y}, ${x2} ${b.y}` });
        } else {
          // Out of order: the dependent starts before its prerequisite ends. Join the two bars' starts
          // vertically, so the arrow stays inside the timeline and reads "this should have come first".
          const x1 = a.l + 14;
          const x2 = b.l + 14;
          const down = b.y > a.y;
          const y1 = down ? a.b : a.t;
          const y2 = down ? b.t : b.b;
          const ym = (y1 + y2) / 2;
          out.push({ key: e.key, edge: e, d: `M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}` });
        }
      }
      setArrows(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);
  return arrows;
}

export function Slider({
  scene,
  rehearsal,
  step,
  onStep,
  resolved,
  quiet = false,
  expandedByDefault = false,
}: {
  scene: Scene;
  rehearsal: Rehearsal | undefined;
  step: number;
  onStep: (s: number) => void;
  /** Finding ids whose fix was approved: no longer marked. */
  resolved: Set<string>;
  /** Presenter story beats: draw the plan without redline, so the one ghost on the plan is the only red thing. */
  quiet?: boolean;
  expandedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(expandedByDefault);
  const [picked, setPicked] = useState<string>();
  useEffect(() => setExpanded(expandedByDefault), [expandedByDefault, quiet]);
  const lanesBox = useRef<HTMLDivElement>(null);
  const bars = useRef(new Map<string, HTMLElement>());
  const tasks = useMemo(() => tasksOfDay(scene, rehearsal?.day), [scene, rehearsal?.day]);
  const graph = quiet ? undefined : graphView(rehearsal?.graph, new Set(tasks.map((t) => t.id)));
  const arrows = useArrows(lanesBox, bars, graph?.drawn ?? [], `${expanded}|${graph?.drawn.map((e) => e.key + e.violated).join(",") ?? ""}|${tasks.map((t) => t.id + t.slot).join(",")}`);

  if (!rehearsal || rehearsal.frames.length === 0) {
    return (
      <div className="slider empty">
        <p className="meta">No plan on record for tomorrow yet.</p>
      </div>
    );
  }
  const open = (fs: Finding[]) => (quiet ? [] : fs.filter((f) => !resolved.has(f.id)));
  const trouble = quiet ? new Set<number>() : troubleSteps(rehearsal, resolved);
  const frame = frameAt(rehearsal, step);
  const frameOpen = open(frame?.findings ?? []);
  const held = new Set(frameOpen.flatMap((f) => f.taskIds));
  const flagged = new Set(rehearsal.frames.flatMap((fr) => open(fr.findings).flatMap((f) => f.taskIds)));
  const crews = [...new Set(tasks.map((t) => t.crewId))];
  const pct = (s: number) => `${(s / SLIDER_STEPS) * 100}%`;
  const dayLabel = formatTime(`${rehearsal.day}T00:00:00`).slice(0, -6);
  const pathLine = graph ? criticalPathLine(rehearsal.graph, scene) : undefined;
  const slip = graph && picked ? slipReadout(rehearsal.graph, picked, scene) : undefined;
  const pick = (id: string) => setPicked(picked === id ? undefined : id);
  const onBarKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(id);
    }
  };
  const stroke = (e: GraphEdgeView) => (e.violated ? color.redline : e.critical ? color.ink : color.inkSoft);
  const marker = (e: GraphEdgeView) => (e.violated ? "url(#dep-red)" : e.critical ? "url(#dep-ink)" : "url(#dep-soft)");

  return (
    <div className="slider">
      <div className="slider-head">
        <h2>
          Rehearsal · {dayLabel} · <span className="clock">{sliderClock(step)}</span>
        </h2>
        <p className="meta">
          {!frame
            ? "Nothing planned at this time"
            : quiet
              ? `${frame.activeTaskIds.length} planned tasks`
              : `${frame.activeTaskIds.length} planned tasks, ${frameOpen.length} open findings`}
          {pathLine && <span className="critical-line"> · {pathLine}</span>}
        </p>
        <button type="button" className="quiet plan-expand" aria-expanded={expanded} aria-controls="crew-plan-lanes" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide crew plan" : "Show crew plan"}</button>
      </div>
      <div className="lanes">
        <div className="track-row">
          <span className="lane-name">Time</span>
          <div className="track">
            {[...trouble].map((s) => (
              <span key={s} className="trouble" style={{ left: pct(s), width: pct(1), background: color.redline }} />
            ))}
            {[0, 5, 10, 15, 20].map((s) => (
              <span key={`t${s}`} className="tick" style={{ left: pct(s) }}>
                {sliderClock(s)}
              </span>
            ))}
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS - 1}
              step={1}
              value={step}
              aria-label="Time tomorrow"
              aria-valuetext={sliderClock(step)}
              onChange={(e) => onStep(Number(e.target.value))}
            />
          </div>
        </div>
        <div id="crew-plan-lanes" className="crew-lanes" ref={lanesBox} hidden={!expanded}>
          {crews.map((crewId) => {
            const mine = mergeRestated(tasks.filter((t) => t.crewId === crewId));
            const stack = stackBars(mine.map((m) => m.task));
            return (
              <div key={crewId} className="track-row">
                <span className="lane-name">
                  <span className="badge" style={{ borderColor: crewHue(scene, crewId) }}>
                    {scene.crews.find((c) => c.id === crewId)?.letter ?? "?"}
                  </span>
                  {crewName(scene, crewId)}
                </span>
                <div className="track lane" style={{ ["--rows" as string]: stack.rows }}>
                  {mine.map(({ task: t, ids }) => {
                    const [a, b] = slotSpan(t.slot);
                    const r = stack.row.get(t.id) ?? 0;
                    const any = (set: Set<string> | undefined) => ids.some((id) => set?.has(id));
                    // The slip readout asks about the id the plan graph knows, if either restated task is in it.
                    const graphId = ids.find((id) => rehearsal.graph?.taskIds.includes(id)) ?? t.id;
                    const cls = [
                      "bar",
                      step >= a && step < b ? "active" : "",
                      any(flagged) ? "flagged" : "",
                      any(held) ? "held" : "",
                      any(graph?.critical) ? "critical" : "",
                      graph && picked === graphId ? "picked" : "",
                    ].join(" ");
                    const label = `${elementById(scene, t.placeId)?.name ?? t.placeId} · ${t.description}`;
                    const box = { left: pct(a), width: pct(b - a), top: `calc(${(r / stack.rows) * 100}% + 2px)`, height: `calc(${100 / stack.rows}% - 4px)`, borderColor: crewHue(scene, crewId) };
                    const ref = (el: HTMLElement | null) => {
                      for (const id of ids) {
                        if (el) bars.current.set(id, el);
                        else bars.current.delete(id);
                      }
                    };
                    return graph ? (
                      <span key={t.id} ref={ref} className={cls} style={box} role="button" tabIndex={0} aria-pressed={picked === graphId} title={`${label}. Select to see who waits on it.`} onClick={() => pick(graphId)} onKeyDown={onBarKey(graphId)}>
                        {label}
                      </span>
                    ) : (
                      <span key={t.id} ref={ref} className={cls} style={box}>
                        {label}
                      </span>
                    );
                  })}
                  <span className="cursor" style={{ left: pct(step + 0.5) }} aria-hidden="true" />
                </div>
              </div>
            );
          })}
          {arrows.length > 0 && (
            <svg className="dep-arrows" aria-hidden="true">
              <defs>
                {([["dep-ink", color.ink], ["dep-soft", color.inkSoft], ["dep-red", color.redline]] as const).map(([id, fill]) => (
                  <marker key={id} id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={drawing.arrowHead} markerHeight={drawing.arrowHead} markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
                  </marker>
                ))}
              </defs>
              {arrows.map((a) => (
                <path
                  key={a.key}
                  d={a.d}
                  fill="none"
                  stroke={stroke(a.edge)}
                  strokeWidth={a.edge.critical ? drawing.arrowCritical : drawing.arrowLine}
                  strokeDasharray={a.edge.violated ? "4 3" : undefined}
                  markerEnd={marker(a.edge)}
                >
                  <title>{a.edge.reason}{a.edge.violated ? ", planned out of order" : ""}</title>
                </path>
              ))}
            </svg>
          )}
          {graph && (
            <div className="slip-readout" aria-live="polite">
              {slip ? (
                <>
                  <p className="slip-title">{slip.title}</p>
                  {slip.lines.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </>
              ) : (
                <p className="meta">Select a bar to see which crews wait on it.</p>
              )}
              <p className="dep-key">
                <span><i className="dep-line ink" />Critical path</span>
                <span><i className="dep-line soft" />Must finish first</span>
                <span><i className="dep-line red" />Planned out of order</span>
                {graph.offTimeline.length > 0 && <span>{graph.offTimeline.length} more on other days, not drawn</span>}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
