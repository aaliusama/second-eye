import { useEffect, useState } from "react";
import { SheetRevisionResponse } from "@site/contracts";
import type { SheetRevisionResponse as SheetResponse } from "@site/contracts";
import { announceChange, api, onChange } from "./api";
import { useSite } from "./store";

export function Sheets() {
  const messages = useSite((s) => s.messages);
  const scene = useSite((s) => s.state?.scene);
  const refresh = useSite((s) => s.refresh);
  const [record, setRecord] = useState<SheetResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [crewId, setCrewId] = useState("crew-plumbing");
  const [text, setText] = useState("We're on A-201 rev B");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/sheets");
        if (!response.ok) throw new Error("Sheet record unavailable.");
        const body = SheetRevisionResponse.parse(await response.json());
        if (active) { setRecord(body); setError(undefined); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Sheet record unavailable."); }
    };
    void load();
    const off = onChange(() => void load());
    return () => { active = false; off(); };
  }, [messages.length]);

  const source = (id: string) => {
    const m = messages.find((entry) => entry.id === id);
    return m ? `${m.senderName} · ${m.time.replace("T", " ")} · “${m.text}”` : "Source not found";
  };
  async function send(office: boolean, body: string) {
    const crew = scene?.crews.find((c) => c.id === crewId);
    if ((!office && !crew) || !body.trim()) return;
    setBusy(true);
    try {
      await api.postMessage({ text: body, kind: "text", thread: office ? "office" : "site-group", senderName: office ? "Simulated architect" : crew!.name, senderRole: office ? "architect" : "crew_lead", ...(office ? {} : { crewId }) });
      await refresh();
      announceChange();
      setError(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : "Message not recorded."); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Sheet revision record">
    <h2>Which sheet is the crew using?</h2>
    <p className="meta">Explicit text only. Attachments are not read; matching the record is not permission to start work.</p>
    {error && <p role="alert">{error}</p>}
    {!error && record?.sheets.length === 0 && <p>No explicit sheet revision record found.</p>}
    {!error && record?.sheets.map((sheet) => <div key={sheet.sheetId}>
      <h3>{sheet.sheetId} · latest issued: {sheet.latest?.revision ?? "not found"}</h3>
      {sheet.uncertainty && <p>{sheet.uncertainty}</p>}
      {sheet.latest && <p className="meta">{source(sheet.latest.sourceMessageId)}</p>}
      {sheet.claims.length === 0 && <p>No crew revision stated.</p>}
      {sheet.claims.map((claim) => <div key={claim.crewId}>
        <p><strong>{scene?.crews.find((c) => c.id === claim.crewId)?.name ?? "Crew not found"}</strong>: {claim.revision} — {claim.status === "different_revision" ? "Different from the issued record: confirm before using this sheet." : claim.status === "matches_record" ? "Matches the issued record." : "Cannot compare yet."}</p>
        <p className="meta">{source(claim.sourceMessageId)}</p>
      </div>)}
    </div>)}
    <details><summary>Simulate a sheet conversation</summary>
      <button type="button" disabled={busy} onClick={() => void send(true, "Issued A-201 rev C")}>Architect: issue A-201 rev C</button>
      <label>Crew <select value={crewId} onChange={(e) => setCrewId(e.target.value)}>{scene?.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Stated sheet <input value={text} onChange={(e) => setText(e.target.value)} /></label>
      <button type="button" disabled={busy || !text.trim()} onClick={() => void send(false, text)}>Record crew statement</button>
    </details>
    <span className="sim">Simulated site data</span>
  </section>;
}
