import { useEffect, useState } from "react";
import { DismissalsResponse } from "../../contracts/src/dismissals";
import { useSite } from "./store";
import { announceChange, onChange } from "./api";

export function Dismissals() {
  const state = useSite((s) => s.state);
  const rehearsal = useSite((s) => s.rehearsal);
  const [data, setData] = useState<DismissalsResponse>();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const findings = [...new Map([...(state?.findings ?? []), ...(rehearsal?.frames.flatMap((f) => f.findings) ?? [])].map((f) => [f.id, f])).values()];
  const reviewed = new Set(data?.matches.map((m) => m.findingId));
  const candidates = findings.filter((f) => !reviewed.has(f.id));
  async function load() {
    const response = await fetch("/api/dismissals");
    if (!response.ok) throw new Error("Review memory unavailable");
    setData(DismissalsResponse.parse(await response.json()));
  }
  useEffect(() => {
    let active = true;
    const update = () => { if (active) void load().catch((e) => setError(String(e))); };
    update();
    const off = onChange(update);
    return () => { active = false; off(); };
  }, [state?.t, state?.findings.length, rehearsal]);
  async function change(path: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error((await response.json()).error ?? "Review could not be saved");
      await load(); setReason(""); setSelected(""); announceChange();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="What this site has learned">
    <h2>What this site has learned</h2>
    <p className="meta">Review memory only. Dismissing an alert does not clear work or change the recorded checks. New evidence brings the alert back.</p>
    {error && <p role="alert">{error}</p>}
    <label>Alert to mark reviewed<select value={selected} onChange={(e) => setSelected(e.target.value)}>
      <option value="">Choose a recorded alert</option>
      {candidates.map((f) => <option key={f.id} value={f.id}>{f.summary}</option>)}
    </select></label>
    <label>Why is this alert not useful?<textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
    <button disabled={busy || !selected || reason.trim().length < 3} onClick={() => void change("/api/dismissals", { findingId: selected, reason })}>Remember this review</button>
    {data?.rules.filter((r) => r.active).map((r) => <article key={r.id}>
      <p>{r.summary}</p><p>{r.reason}</p>
      <p className="meta">{data.matches.some((m) => m.ruleId === r.id) ? "Same recorded incident: marked reviewed" : "No current match: changed evidence remains active"}. Recorded {r.time.replace("T", " ")}.</p>
      <button disabled={busy} onClick={() => void change(`/api/dismissals/${encodeURIComponent(r.id)}/undo`)}>Undo learned review</button>
    </article>)}
    {data && data.rules.every((r) => !r.active) && <p>No active learned reviews.</p>}
    <span className="sim">Simulated site data</span>
  </section>;
}
