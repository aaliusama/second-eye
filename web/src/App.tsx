import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { onChange } from "./api";
import { elementById, findingKey, formatTime, frameAt, messageMap, resolvedFindingIds } from "./derive";
import { FlatView } from "./FlatView";
import { AgentLog, Inspector, Learning, Measured, Queue, Record } from "./panels";
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
  const phoneOpen = useSite((s) => s.phoneOpen);
  const setPhoneOpen = useSite((s) => s.setPhoneOpen);

  const d = useMemo(() => {
    if (!state) return undefined;
    // The rehearsal is tomorrow's plan as of now. When the record is shown as of an earlier time,
    // leave it out, or the plan view would show findings from messages not yet said.
    const plan = asOf ? undefined : rehearsal;
    const frame = frameAt(plan, slider);
    const resolved = resolvedFindingIds(state.fixes);
    const rehearsalFindings = plan?.frames.flatMap((f) => f.findings) ?? [];
    const all = [...state.findings, ...rehearsalFindings];
    const visible = [...state.findings, ...(frame?.findings ?? [])].filter((f) => !resolved.has(f.id));
    // One ghost per finding id; the live one wins so the reveal key stays stable.
    const ghosts = [...new Map(visible.filter((f) => f.ghost).reverse().map((f) => [f.id, f])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const ghostEls = new Set(ghosts.map((g) => g.ghost!.elementId));
    const conflictIds = new Set(visible.flatMap((f) => f.elementIds).filter((id) => !ghostEls.has(id)));
    const clearIds = new Set(all.filter((f) => resolved.has(f.id)).flatMap((f) => f.elementIds));
    const active = new Set(frame?.activeTaskIds ?? []);
    const activeTasks = state.scene.tasks.filter((t) => active.has(t.id));
    return { all, visible, ghosts, conflictIds, clearIds, activeTasks, resolved };
  }, [state, rehearsal, slider, asOf]);

  const reveal = useReveal(d?.ghosts.map(findingKey) ?? [], run);
  const msgMap = useMemo(() => messageMap(messages), [messages]);

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
      activeTasks={d.activeTasks}
      selection={selection}
      onSelect={select}
      reveal={reveal}
    />
  );
  const backToFlat = () => {
    setNo3D(true);
    setView("flat");
  };

  return (
    <div className="app">
      <header className="top">
        <div className="title">
          <h1>Site Rehearsal</h1>
          <span className="meta">{state.scene.name}</span>
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

      <main className="model">
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
        <Inspector scene={state.scene} selection={selection} findings={d.all} messages={msgMap} onClose={() => select(undefined)} />
        <Presenter />
        <div className="phone-inset">
          {phoneOpen && <Phone scene={state.scene} messages={messages} day={rehearsal?.day} compact onPosted={() => void refresh()} />}
          <div className="row">
            <button type="button" className="quiet" aria-expanded={phoneOpen} onClick={() => setPhoneOpen(!phoneOpen)}>
              {phoneOpen ? "Hide crew phone" : "Crew phone"}
            </button>
            <a className="quiet link" href="/phone" target="_blank" rel="noreferrer">
              Open on a phone
            </a>
          </div>
        </div>
      </main>

      <aside className="side">
        <section className="panel">
          <h2>Needs approval</h2>
          <Queue scene={state.scene} fixes={state.fixes} findings={d.all} messages={messages} />
        </section>
        <Learning scene={state.scene} items={unresolved} />
        <AgentLog scene={state.scene} messages={messages} />
        <Record scene={state.scene} messages={messages} />
        <Measured />
      </aside>

      <footer className="bottom">
        <Slider scene={state.scene} rehearsal={asOf ? undefined : rehearsal} step={slider} onStep={setSlider} resolved={d.resolved} />
      </footer>
    </div>
  );
}
