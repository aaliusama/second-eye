import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { onChange } from "./api";
import {
  elementById,
  findingKey,
  formatTime,
  frameAt,
  flaggedPairs,
  knowledgeMatrix,
  messageMap,
  onDay,
  oneGhostPerIncident,
  resolvedFindingIds,
  sentNotConfirmed,
  STORY_BEATS,
  STORY_ELEMENT,
} from "./derive";
import { FlatView } from "./FlatView";
import { Huddle } from "./Huddle";
import { IncidentFocus, incidentLead, rankIncidents } from "./IncidentFocus";
import { Knowledge } from "./Knowledge";
import { Autonomy } from "./Autonomy";
import { Lessons } from "./Lessons";
import { Acknowledgements } from "./Acknowledgements";
import { Sheets } from "./Sheets";
import { Dismissals } from "./Dismissals";
import { Inspector, Learning, Measured, MeasuredLarge, Queue, Record } from "./panels";
import { Phone } from "./Phone";
import { Presenter } from "./present/Presenter";
import { useReveal } from "./reveal";
import { Slider } from "./Slider";
import { useSite } from "./store";

// Owner: D. The model is the page. Flat SVG view always works; 3D is a second renderer (lane H).

// Lane H's 3D view, lazy so three.js stays out of the first bundle. findingKey in derive.ts is the
// same `${id}:${trigger}` as the one ModelView3D exports; importing that one would pull three.js in eagerly.
const ModelView3D = lazy(() => import("./three/ModelView3D").then((m) => ({ default: m.ModelView3D })));

class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useLiveRefresh() {
  const refresh = useSite((s) => s.refresh);
  useEffect(() => {
    void refresh();
    const off = onChange(() => void refresh());
    const onFocus = () => void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
}

export function App() {
  return window.location.pathname.replace(/\/$/, "") === "/phone" ? <PhonePage /> : <Main />;
}

function PhonePage() {
  useLiveRefresh();
  const state = useSite((s) => s.state);
  const messages = useSite((s) => s.messages);
  const rehearsal = useSite((s) => s.rehearsal);
  const refresh = useSite((s) => s.refresh);
  const error = useSite((s) => s.error);
  return (
    <div className="phone-page">
      {state ? (
        <Phone scene={state.scene} messages={messages} day={rehearsal?.day} onPosted={() => void refresh()} />
      ) : (
        <div className="boot">
          <p className="meta">{error ?? "Loading the site record"}</p>
          <span className="sim">Simulated site data</span>
        </div>
      )}
    </div>
  );
}

function Main() {
  useLiveRefresh();
  const status = useSite((s) => s.status);
  const error = useSite((s) => s.error);
  const state = useSite((s) => s.state);
  const messages = useSite((s) => s.messages);
  const rehearsal = useSite((s) => s.rehearsal);
  const unresolved = useSite((s) => s.unresolved);
  const asOf = useSite((s) => s.asOf);
  const setAsOf = useSite((s) => s.setAsOf);
  const slider = useSite((s) => s.slider);
  const setSlider = useSite((s) => s.setSlider);
  const selection = useSite((s) => s.selection);
  const select = useSite((s) => s.select);
  const run = useSite((s) => s.run);
  const refresh = useSite((s) => s.refresh);
  const [view, setView] = useState<"flat" | "3d">("flat");
  const [no3D, setNo3D] = useState(false);
  const [workspace, setWorkspace] = useState<"today" | "knows" | "auto" | "record" | "learning" | "crew">("today");
  const lens = useSite((s) => s.lens);
  const setLens = useSite((s) => s.setLens);
  const phoneOpen = useSite((s) => s.phoneOpen);
  const setPhoneOpen = useSite((s) => s.setPhoneOpen);
  const focus = useSite((s) => s.focus);
  const story = focus !== undefined && STORY_BEATS.has(focus);
  useEffect(() => {
    setWorkspace(focus === "learn" || focus === "run2" ? "learning" : focus === "why" ? "knows" : focus === "ask" || focus === "ghost" ? "crew" : focus === "numbers" ? "record" : "today");
  }, [focus]);
  useEffect(() => { if (phoneOpen) setWorkspace("crew"); }, [phoneOpen]);

  const d = useMemo(() => {
    if (!state) return undefined;
    // The rehearsal is tomorrow's plan as of now. When the record is shown as of an earlier time,
    // leave it out, or the plan view would show findings from messages not yet said.
    const plan = asOf ? undefined : rehearsal;
    const frame = frameAt(plan, slider);
    const rehearsalFindings = plan?.frames.flatMap((f) => f.findings) ?? [];
    const all = [...state.findings, ...rehearsalFindings];
    const resolved = resolvedFindingIds(state.fixes, all);
    // Only the rehearsed day's work is drawn on that day's plan (Friday's ghosts are not Saturday's).
    const visible = [...state.findings, ...(frame?.findings ?? [])].filter((f) => !resolved.has(f.id) && onDay(state.scene, f, plan?.day));
    // One ghost per finding id (live wins so the reveal key stays stable), then one per incident.
    const perId = [...new Map(visible.filter((f) => f.ghost).reverse().map((f) => [f.id, f])).values()];
    const incidents = oneGhostPerIncident(perId);
    // Presenter story beats: one red thing on screen, the ghost wall the demo is about.
    const ghosts = story ? incidents.filter((g) => g.ghost!.elementId === STORY_ELEMENT) : incidents;
    const ghostEls = new Set(ghosts.map((g) => g.ghost!.elementId));
    const conflictIds = story ? new Set<string>() : new Set(visible.flatMap((f) => f.elementIds).filter((id) => !ghostEls.has(id)));
    const sent = sentNotConfirmed(state.fixes, all);
    const clearIds = new Set(all.filter((f) => resolved.has(f.id)).flatMap((f) => f.elementIds));
    const active = new Set(frame?.activeTaskIds ?? []);
    const activeTasks = state.scene.tasks.filter((t) => active.has(t.id));
    return { all, visible, ghosts, conflictIds, clearIds, activeTasks, resolved, sent };
  }, [state, rehearsal, slider, asOf, story]);

  const reveal = useReveal(d?.ghosts.map(findingKey) ?? [], run);
  const msgMap = useMemo(() => messageMap(messages), [messages]);
  // Who knows what: the floor as one crew knows it, and where their unheard changes meet their work.
  const knowledge = useMemo(() => {
    if (!state || !d) return undefined;
    const flagged = flaggedPairs(d.visible);
    const { rows } = knowledgeMatrix(state.scene, flagged);
    const crew = state.scene.crews.find((c) => c.id === lens);
    const i = crew ? state.scene.crews.indexOf(crew) : -1;
    const unheard = i < 0 ? 0 : rows.filter((r) => !r.cells[i].heard).length;
    const exposedIds = new Set(i < 0 ? [] : rows.filter((r) => r.cells[i].exposed).map((r) => r.elementId));
    return { crew, unheard, exposedIds, flagged };
  }, [state, lens, d]);

  if (status === "loading" || !state || !d)
    return (
      <div className="boot">
        <p>{status === "loading" ? "Loading the site record" : (error ?? "Server not reachable. Start it with npm run demo.")}</p>
        <span className="sim">Simulated site data</span>
      </div>
    );

  // 3D outlines elements only; a selected finding outlines its ghost's element.
  const selectedFinding = selection?.kind === "finding" ? d.all.find((f) => findingKey(f) === selection.key) : undefined;
  const selectedId = selection?.kind === "element" ? selection.id : (selectedFinding?.ghost?.elementId ?? selectedFinding?.elementIds[0]);
  const select3D = (elementId: string, key?: string) =>
    select(key ? { kind: "finding", key } : elementById(state.scene, elementId) ? { kind: "element", id: elementId } : undefined);
  // The 3D view draws every finding with a ghost: pass one per incident, like the flat view.
  const findings3D = [...d.visible.filter((f) => !f.ghost), ...d.ghosts];
  const flat = (
    <FlatView
      scene={state.scene}
      ghosts={d.ghosts}
      conflictIds={d.conflictIds}
      clearIds={d.clearIds}
      sentIds={d.sent}
      tight={story}
      activeTasks={d.activeTasks}
      selection={selection}
      focusElementId={selectedId}
      onSelect={(value) => { select(value); if (value) setWorkspace("today"); }}
      reveal={reveal}
      lens={knowledge?.crew}
      exposedIds={knowledge?.exposedIds}
    />
  );
  const lensCrew = knowledge?.crew;
  // The first thing anyone sees: how much to settle before work starts, and the worst one in one line.
  const opening = !asOf && !story && !lensCrew && !selection ? (() => {
    const { all, when } = rankIncidents(state.scene, d.visible, state.fixes);
    return { count: all.length, when, first: all[0]?.[0] };
  })() : undefined;
  const backToFlat = () => {
    setNo3D(true);
    setView("flat");
  };

  return (
    <div className="app">
      <a className="skip-link" href="#site-workspace">Skip to site workspace</a>
      <header className="top">
        <div className="title">
          <svg className="site-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 27V5h24v22H4Zm8 0V13h16M4 13h8M21 5v8" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          <h1>Second Eye</h1>
          <span className="title-rule" aria-hidden="true" />
          <span className="title-scene">{state.scene.name}</span>
        </div>
        <div className="top-right">
          {!no3D && (
            <div className="toggle" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "flat"} onClick={() => setView("flat")}>
                Flat
              </button>
              <button type="button" aria-pressed={view === "3d"} onClick={() => setView("3d")}>
                3D
              </button>
            </div>
          )}
          <span className="sim">Simulated site data</span>
        </div>
      </header>

      <main className="model" id="site-workspace" tabIndex={-1}>
        <div className="model-caption">
          {opening ? (
            <div className="opening">
              <p className="meta">{state.scene.name} · per the record</p>
              <h2>{opening.count === 0 ? "Nothing to settle before work starts" : <><span className="opening-count">{opening.count}</span> to settle before {opening.when ?? "work starts"}</>}</h2>
              {opening.first && (
                <p className="opening-lead">
                  <span>First: {incidentLead(state.scene, opening.first)}{d.sent.has(opening.first.id) ? " Correction sent, waiting for a reply." : ""}</span>
                  <button type="button" className="opening-show" onClick={() => { select({ kind: "finding", key: findingKey(opening.first!) }); setWorkspace("today"); }}>Show me</button>
                </p>
              )}
            </div>
          ) : (
            <div><p className="meta">{asOf ? "Site history" : "Work preparation"}</p>
            <h2>{lensCrew ? <>The floor as <em className="lens-name">{lensCrew.name}</em> knows it</> : story ? "The 204 bathroom wall" : state.scene.name}</h2></div>
          )}
          {view === "flat" || no3D ? (
            <div className="lens-control">
              <span className="lens-label" id="lens-label">See the floor as</span>
              <div className="lens-switch" role="group" aria-labelledby="lens-label">
                <button type="button" aria-pressed={!lens} onClick={() => setLens(undefined)}>Record</button>
                {state.scene.crews.map((c) => (
                  <button key={c.id} type="button" className="lens-crew" aria-pressed={lens === c.id} title={`${c.name} knows it`} onClick={() => setLens(lens === c.id ? undefined : c.id)}>
                    {c.letter}<span className="visually-hidden"> {c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <span className="record-basis">{asOf ? formatTime(asOf) : "Plans and changes, per the record"}</span>
          )}
        </div>
        {(asOf || error) && (
          <div className="banner">
            {asOf && (
              <>
                <span>Per the record as of {formatTime(asOf)}</span>
                <button type="button" className="quiet" onClick={() => void setAsOf(undefined)}>
                  Back to now
                </button>
              </>
            )}
            {error && <span className="error">{error}</span>}
          </div>
        )}
        {view === "3d" && !no3D ? (
          <div className="view3d">
            <Fallback onError={backToFlat}>
              <Suspense fallback={flat}>
                <ModelView3D
                  scene={state.scene}
                  findings={findings3D}
                  selectedId={selectedId}
                  onSelect={select3D}
                  revealFindingKey={reveal.key}
                  onUnavailable={backToFlat}
                />
              </Suspense>
            </Fallback>
          </div>
        ) : (
          flat
        )}
        {focus === "numbers" && <MeasuredLarge />}
        <Presenter />
        {lensCrew && (view === "flat" || no3D) ? (
          <div className="drawing-legend lens-legend" aria-live="polite">
            <span><i className="legend-line" />What {lensCrew.name} believes</span>
            <span><i className="legend-line soft-line" />Record, not heard</span>
            <span><i className="legend-line ghost-line" />Not heard, meets their work</span>
            <strong>{knowledge!.unheard} of the record's changes never reached them</strong>
          </div>
        ) : (
          <div className="drawing-legend" aria-label="Drawing legend">
            <span><i className="legend-line" />Recorded</span>
            <span><i className="legend-line ghost-line" />Conflict</span>
            <span><i className="legend-line pending-line" />Awaiting reply</span>
          </div>
        )}
      </main>

      <aside className="side">
        <div className="workspace-heading"><h2>Before work starts</h2><p className="meta">Which crew is about to work from old information, and who to tell.</p></div>
        <nav className="workspace-nav" aria-label="Site desk sections">
          {([ ["today", "Priorities"], ["knows", "Who knows"], ["auto", "On its own"], ["crew", "Crew"], ["record", "Record"], ["learning", "Learning"] ] as const).map(([id, label]) =>
            <button key={id} type="button" aria-pressed={workspace === id} aria-controls={`desk-${id}`} onClick={() => { setWorkspace(id); if (id === "crew") setPhoneOpen(true); }}>{label}</button>
          )}
        </nav>
        <div id="desk-today" hidden={workspace !== "today"}>
        <Inspector scene={state.scene} selection={selection} findings={d.all} messages={msgMap} onClose={() => select(undefined)} />
        {!asOf && !story && !selection && <IncidentFocus scene={state.scene} findings={d.visible} fixes={state.fixes} messages={messages} onInspect={(finding) => { select({ kind: "finding", key: findingKey(finding) }); setWorkspace("today"); }} />}
        {(focus === "ghost" || focus === "why") && <section className="panel story-context">
          <h2>One change. Two versions.</h2>
          <p>The crew's intended work is checked against the latest recorded wall.</p>
          <dl><dt>Solid line</dt><dd>The wall in the latest site record.</dd><dt>Dashed red line</dt><dd>The earlier position available to the crew.</dd></dl>
          <p className="meta">Select the wall or ghost to inspect the messages behind this mismatch.</p>
        </section>}
        {!asOf && <details className="desk-disclosure" open={focus === "fix" || focus === "confirm"}><summary>Crew confirmations<span>Sent is not confirmed</span></summary><Acknowledgements /></details>}
        {asOf && <section className="panel"><h2>A moment in the record</h2><p className="meta">Select a wall to see what changed and who said it. Return to now to review today's actions.</p></section>}
        <details className="desk-disclosure" open={focus === "fix"} hidden={focus === "ghost" || focus === "why" || focus === "confirm"}><summary>All proposed actions<span>Review before sending</span></summary><section className="panel">
          <h2>Needs approval</h2>
          <p className="meta">Review the proposed message before sending.</p>
          <Queue scene={state.scene} fixes={state.fixes} findings={d.all} messages={messages} />
        </section>
        </details>
        </div>
        <div id="desk-knows" hidden={workspace !== "knows"}>
          <Knowledge scene={state.scene} flagged={knowledge?.flagged} lens={lens} selectedElementId={selectedId} onLens={(id) => { setLens(id); if (view === "3d") setView("flat"); }} onSelectElement={(id) => select({ kind: "element", id })} />
        </div>
        <div id="desk-auto" hidden={workspace !== "auto"}>
          <Autonomy scene={state.scene} messages={messages} asOf={asOf} />
        </div>
        <div id="desk-record" hidden={workspace !== "record"}>
        {!asOf && <Huddle day={rehearsal?.day} messages={messages} revision={`${state.t}:${messages.length}:${state.fixes.map((f) => `${f.id}-${f.status}`).join(",")}`} />}
        {!asOf && <Sheets />}
        <Record scene={state.scene} messages={messages} />
        <Measured />
        </div>
        <div id="desk-learning" hidden={workspace !== "learning"}>
        <Lessons scene={state.scene} messages={messages} />
        <Learning scene={state.scene} items={unresolved} />
        {!asOf && <Dismissals />}
        </div>
        <div id="desk-crew" className="crew-dock" hidden={workspace !== "crew"}>
          <p className="dock-intro">The crew's conversation, beside the plan.</p>
          <Phone scene={state.scene} messages={messages} day={rehearsal?.day} compact onPosted={() => void refresh()} />
          <a className="quiet link" href="/phone" target="_blank" rel="noreferrer">Open crew view on a phone</a>
        </div>
      </aside>

      <footer className="bottom">
        <Slider scene={state.scene} rehearsal={asOf ? undefined : rehearsal} step={slider} onStep={setSlider} resolved={d.resolved} quiet={story} expandedByDefault={focus === "rehearse"} />
      </footer>
    </div>
  );
}
