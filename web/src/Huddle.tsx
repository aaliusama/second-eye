import { useEffect, useState } from "react";
import type { ChatMessage } from "@site/contracts";
import { onChange } from "./api";

type Digest = { text: string };

function sourceLabel(id: string, messages: ChatMessage[]): string {
  const m = messages.find((x) => x.id === id);
  if (!m) return "source not found";
  const date = new Date(`${m.time.slice(0, 10)}T00:00:00Z`);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  const thread = m.thread.startsWith("dm:") ? "direct message" : m.thread.replace(/-/g, " ");
  return `${m.senderName.replace(/\s*\(.*\)$/, "")}, ${thread}, ${day} ${m.time.slice(11, 16)}`;
}

function huddleLines(text: string): string[] {
  const section = text.split("06:30 huddle — first three risks to review:\n")[1]?.split("\nOpen decisions:")[0];
  return section?.split("\n").filter((line) => /^  - (HOLD|WARN):/.test(line)).slice(0, 3) ?? [];
}

export function Huddle({ day, messages, revision }: { day?: string; messages: ChatMessage[]; revision: string }) {
  const [digest, setDigest] = useState<Digest>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!day) return;
    setDigest(undefined);
    let current = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/digest?day=${encodeURIComponent(day)}`);
        if (!response.ok) throw new Error(`Digest unavailable (${response.status})`);
        const result = (await response.json()) as Digest;
        if (current) {
          setDigest(result);
          setError(undefined);
        }
      } catch (err) {
        if (current) setError(err instanceof Error ? err.message : "Digest unavailable");
      }
    };
    void load();
    const off = onChange(() => void load());
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      current = false;
      off();
      window.removeEventListener("focus", focus);
    };
  }, [day, revision]);

  const lines = digest ? huddleLines(digest.text) : [];
  return (
    <section className="panel" aria-label="06:30 superintendent huddle">
      <h2>06:30 huddle</h2>
      <p className="meta">First three recorded risks to review · per the record</p>
      {!day && <p className="meta">Tomorrow's plan not found.</p>}
      {error && <p className="error">{error}</p>}
      {day && !digest && !error && <p className="meta">Loading recorded risks</p>}
      {digest && lines.length === 0 && !error && <p className="meta">No recorded risks for tomorrow.</p>}
      {!error && lines.length > 0 && (
        <ol className="plain">
          {lines.map((raw, index) => {
            const line = raw.replace(/^\s*-\s*/, "");
            const match = / Sources: ([^.]*)\.$/.exec(line);
            const ids = match?.[1].split(", ") ?? [];
            const body = match ? line.slice(0, match.index) : line;
            return (
              <li key={`${index}-${body}`} className={`fix ${body.startsWith("HOLD:") ? "hold" : "warn"}`}>
                <p>{body}</p>
                {ids.length > 0 && <p className="meta">Source: {ids.map((id) => sourceLabel(id, messages)).join("; ")}</p>}
              </li>
            );
          })}
        </ol>
      )}
      <span className="sim">Simulated site data</span>
    </section>
  );
}
