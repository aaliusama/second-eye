import type { ChatMessage } from "@site/contracts";

// Shared by every surface (rail, inspector, phone, feed): a source id becomes words a
// superintendent reads, never a raw id. "m-001" -> "Lena Hofer · office · Thu 14:02".

export interface SourceView {
  id: string;
  /** "Lena Hofer", "Second Eye", "Drawing rev B". */
  who: string;
  /** "office", "site group", "DM to Novak Plumbing", "drawing". */
  where: string;
  /** "Thu 14:02", or "" when unknown. */
  when: string;
  /** The words said, if the message is known. */
  text?: string;
  kind: "message" | "sent" | "agent" | "drawing" | "unknown";
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-12T14:02:00" -> "Thu 14:02". Pure string maths, no time zones. */
export function shortTime(t: string): string {
  const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${DAYS[d.getUTCDay()]} ${t.slice(11, 16)}`;
}

function threadLabel(thread: string, crewName: (id: string) => string): string {
  if (thread.startsWith("dm:")) return `DM to ${crewName(thread.slice(3))}`;
  if (thread === "site-group") return "site group";
  return thread.replace(/-/g, " ");
}

export function describeSource(
  id: string,
  messages: ChatMessage[],
  crewName: (id: string) => string = (x) => x,
): SourceView {
  if (id.startsWith("drawing:")) {
    const rev = id.slice("drawing:".length).replace(/^rev-/i, "rev ");
    return { id, who: `Drawing ${rev}`, where: "drawing", when: "", kind: "drawing" };
  }
  const m = messages.find((x) => x.id === id);
  if (!m) return { id, who: "Not found in the record", where: "", when: "", kind: "unknown" };
  const kind: SourceView["kind"] = id.startsWith("sent-") ? "sent" : id.startsWith("agent-") ? "agent" : "message";
  const who = m.senderName.replace(/\s*\(.*\)$/, "");
  return { id, who, where: threadLabel(m.thread, crewName), when: shortTime(m.time), text: m.text, kind };
}

/** One line: "Lena Hofer · office · Thu 14:02". */
export function sourceLine(s: SourceView): string {
  return [s.who, s.where, s.when].filter(Boolean).join(" · ");
}
