import type { Finding, Rehearsal, Scene } from "@site/contracts";
import { useEffect, useState } from "react";
import { crewHue, crewName, elementById, formatTime, frameAt, SLIDER_STEPS, sliderClock, tasksOfDay, troubleSteps } from "./derive";
import { color } from "./tokens";

// Owner: D. Tomorrow's plan on a time slider. What is drawn is a pure function of the step:
// the same step always draws the same frame. No timers.

const span = (slot: string) => (slot === "morning" ? [0, 10] : slot === "afternoon" ? [10, 20] : [0, 20]);

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
  useEffect(() => setExpanded(expandedByDefault), [expandedByDefault, quiet]);
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
  const tasks = tasksOfDay(scene, rehearsal.day);
  const crews = [...new Set(tasks.map((t) => t.crewId))];
  const pct = (s: number) => `${(s / SLIDER_STEPS) * 100}%`;
  const dayLabel = formatTime(`${rehearsal.day}T00:00:00`).slice(0, -6);

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
        <div id="crew-plan-lanes" hidden={!expanded}>{crews.map((crewId) => (
          <div key={crewId} className="track-row">
            <span className="lane-name">
              <span className="badge" style={{ borderColor: crewHue(scene, crewId) }}>
                {scene.crews.find((c) => c.id === crewId)?.letter ?? "?"}
              </span>
              {crewName(scene, crewId)}
            </span>
            <div className="track lane">
              {tasks
                .filter((t) => t.crewId === crewId)
                .map((t) => {
                  const [a, b] = span(t.slot);
                  const cls = ["bar", step >= a && step < b ? "active" : "", flagged.has(t.id) ? "flagged" : "", held.has(t.id) ? "held" : ""].join(" ");
                  return (
                    <span key={t.id} className={cls} style={{ left: pct(a), width: pct(b - a), borderColor: crewHue(scene, crewId) }}>
                      {elementById(scene, t.placeId)?.name ?? t.placeId} · {t.description}
                    </span>
                  );
                })}
              <span className="cursor" style={{ left: pct(step + 0.5) }} aria-hidden="true" />
            </div>
          </div>
        ))}</div>
      </div>
    </div>
  );
}
