import { useEffect, useState } from "react";
import { AcknowledgementsResponse, type IncidentReceipt } from "@site/contracts";
import { announceChange, onChange } from "./api";
import { describeSource, sourceLine } from "./sources";
import { useSite } from "./store";

export function Acknowledgements() {
  const messages = useSite((s) => s.messages);
  const scene = useSite((s) => s.state?.scene);
  const refresh = useSite((s) => s.refresh);
  const asOf = useSite((s) => s.asOf);
  const [receipts, setReceipts] = useState<IncidentReceipt[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/acknowledgements");
        if (!response.ok) throw new Error("Confirmation record unavailable");
        const data = AcknowledgementsResponse.parse(await response.json());
        if (active) { setReceipts(data.receipts); setError(undefined); }
      } catch (e) { if (active) setError(String(e)); }
    };
    void load();
    const off = onChange(() => void load());
    return () => { active = false; off(); };
  }, [messages.length, scene?.time]);
  const confirm = async (fixId: string, crewId: string) => {
    setBusy(`${fixId}:${crewId}`);
    try {
      const response = await fetch(`/api/fixes/${encodeURIComponent(fixId)}/acknowledge`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ crewId }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Confirmation failed");
      await refresh();
      announceChange();
    } catch (e) { setError(String(e)); }
    finally { setBusy(undefined); }
  };
  if (asOf) return null;
  return <section className="panel" aria-label="Crew confirmations and incident receipts">
    <h2>Crew confirmation</h2>
    <p className="meta">Crew acknowledgement confirms information received, not completed work.</p>
    {error && <p role="alert">{error}</p>}
    {!receipts.length && <p className="meta">No geometry corrections dispatched yet.</p>}
    {receipts.map((receipt) => <article className={`fix ${receipt.status === "confirmed" ? "done" : "awaiting"}`} key={receipt.fixId}>
      <strong>{receipt.status === "confirmed" ? "Crew confirmed · record rechecked" : receipt.status === "superseded" ? "New revision · send a new correction" : "Sent · awaiting crew confirmation"}</strong>
      <p>{receipt.summary}</p>
      {receipt.crews.map((crew) => <div key={crew.crewId}>
        <p>{crew.crewName}: {crew.acknowledgedAt ? `confirmed at ${crew.acknowledgedAt.slice(11, 16)}` : "not confirmed"}</p>
        {!crew.acknowledgedAt && receipt.status !== "superseded" && <button disabled={!!busy} onClick={() => void confirm(receipt.fixId, crew.crewId)}>Simulate {crew.crewName} confirming receipt</button>}
      </div>)}
      <details><summary>Who said what, when</summary>
        {receipt.revisions.map((r) => <p key={r.elementId}>{r.name} · sent recorded version {r.version}</p>)}
        {[...new Set([receipt.sourceMessageId, ...receipt.evidenceMessageIds, ...receipt.crews.flatMap((c) => [c.sentMessageId, ...(c.acknowledgedMessageId ? [c.acknowledgedMessageId] : [])])])].map((id) => {
          const source = describeSource(id, messages, (crewId) => scene?.crews.find((c) => c.id === crewId)?.name ?? "not found");
          return <blockquote key={id}><p>{source.text ?? "Message text not found"}</p><footer>{sourceLine(source)}</footer></blockquote>;
        })}
      </details>
    </article>)}
    <span className="sim">Simulated site data</span>
  </section>;
}
