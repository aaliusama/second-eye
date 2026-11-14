import { useCallback, useEffect, useRef, useState } from "react";
import type { Finding } from "@site/contracts";
import { api, announceChange } from "../api";
import { findingKey, resolvedFindingIds, troubleSteps } from "../derive";
import { useSite } from "../store";
import { BEATS, BLUE_ROOM, isPlaceholder, PHONE, type BeatId } from "./beats";

// Lane L. Presenter mode: ?present=1 or key P. Keys: → next beat, ← back, R reset, H hide the bar.
// → runs a beat's action once (until R), then its view. ← only restores the view. No fake state:
// every beat calls the same store actions as the buttons a presenter would press.

const presentFromUrl = () => new URLSearchParams(window.location.search).get("present") === "1";

/** The latest open ghost finding, live first: the one the demo talks about. */
function currentGhost(): Finding | undefined {
  const { state, rehearsal } = useSite.getState();
  if (!state) return undefined;
  const findings = [...state.findings, ...(rehearsal?.frames.flatMap((f) => f.findings) ?? [])];
  const resolved = resolvedFindingIds(state.fixes, findings);
  const open = findings.filter(
    (f) => f.ghost?.elementId === "W-12" && !resolved.has(f.id),
  );
  const live = open.filter((f) => f.trigger === "live");
  const pool = live.length > 0 ? live : open;
  return [...pool].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id.localeCompare(b.id))).at(-1);
}

/** Did this crew already post these words in the current run? Keeps phone beats idempotent. */
function alreadySaid(crewId: string, text: string): boolean {
  const words = text.trim().toLowerCase();
  return useSite.getState().messages.some((m) => m.id.startsWith("live-") && m.crewId === crewId && m.text.trim().toLowerCase() === words);
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "auto" });

/** Restores what the audience sees for a beat. Safe to run any number of times. */
async function view(id: BeatId): Promise<string | undefined> {
  const s = useSite.getState();
  switch (id) {
    case "clean":
      // Start before the architect's W-12 revision so no ghost is visible before the
      // plumber states the conflicting intent. The next beat builds the changed record.
      {
        const change = s.messages.find((m) => m.id === "m-001");
        if (!change) return "No wall-change message on record yet.";
        await s.setAsOf(new Date(Date.parse(change.time) - 1000).toISOString().slice(0, 19));
      }
      s.select(undefined);
      s.setSlider(0);
      s.setPhoneOpen(false);
      return;
    case "build": {
      const m = s.messages.find((x) => x.id === "m-001");
      if (!m) return "No message on record yet.";
      await s.setAsOf(m.time);
      const el = useSite.getState().state?.scene.elements.find((e) => e.history.some((h) => h.sourceMessageId === m.id));
      useSite.getState().select(el ? { kind: "element", id: el.id } : undefined);
      return el ? undefined : `No element changed by ${m.id}.`;
    }
    case "ghost":
      if (s.asOf) await s.setAsOf(undefined);
      s.select(undefined);
      s.setSlider(0);
      return;
    case "why": {
      if (s.asOf) await s.setAsOf(undefined);
      const g = currentGhost();
      useSite.getState().select(g ? { kind: "finding", key: findingKey(g) } : undefined);
      return g ? undefined : "No open ghost on record.";
    }
    case "rehearse": {
      s.select(undefined);
      const st = useSite.getState();
      const resolved = st.state ? resolvedFindingIds(st.state.fixes, [...st.state.findings, ...(st.rehearsal?.frames.flatMap((f) => f.findings) ?? [])]) : new Set<string>();
      const first = [...troubleSteps(st.rehearsal, resolved)].sort((a, b) => a - b)[0];
      st.setSlider(first ?? 0);
      return first === undefined ? "No clash on tomorrow's track." : undefined;
    }
    case "fix":
    case "confirm":
    case "ask":
      s.select(undefined);
      return;
    case "learn":
    case "run2":
      s.select(undefined);
      scrollTo("learning");
      return;
    case "numbers":
      scrollTo("measured");
      return;
  }
}

/** The beat's write, run once per presentation (until R). Returns a note if something was skipped. */
async function act(id: BeatId): Promise<string | undefined> {
  const s = useSite.getState();
  switch (id) {
    case "clean":
      await s.runAgain(false);
      return;
    case "ghost": {
      const { crewId, text } = PHONE.plumbingIntent;
      if (isPlaceholder(text)) return "Phone text not set: edit web/src/present/beats.ts.";
      if (!alreadySaid(crewId, text)) await s.phoneSend(crewId, text);
      // The ghost may already be on record (golden replay): play its reveal now either way.
      useSite.getState().replayReveal();
      return;
    }
    case "fix": {
      const ghost = currentGhost();
      const fix = s.state?.fixes.find((f) => f.status === "pending" && f.findingId === ghost?.id);
      if (!fix) return "No pending W-12 ghost-wall fix found.";
      await s.approve(fix.id);
      return;
    }
    case "confirm": {
      const { receipts } = await api.acknowledgements();
      const receipt = [...receipts].reverse().find((r) => r.status === "awaiting_confirmation" &&
        r.revisions.some((revision) => revision.elementId === "W-12") &&
        r.crews.some((crew) => crew.crewId === PHONE.plumbingIntent.crewId && !crew.acknowledgedMessageId));
      if (!receipt) return "No current W-12 correction awaiting this crew's confirmation.";
      await api.acknowledge(receipt.fixId, PHONE.plumbingIntent.crewId);
      announceChange();
      await useSite.getState().refresh();
      return;
    }
    case "ask": {
      const { crewId, text } = PHONE.question;
      await s.phoneSend(crewId, text);
      return;
    }
    case "learn": {
      const { crewId, text } = PHONE.blueRoom;
      if (isPlaceholder(text)) return "Blue-room phone text not set: edit web/src/present/beats.ts.";
      if (!alreadySaid(crewId, text)) await s.phoneSend(crewId, text);
      await useSite.getState().refresh();
      return useSite.getState().unresolved?.length ? undefined : "Nothing unresolved: is the nickname already on room-204?";
    }
    case "run2": {
      const { crewId, text } = PHONE.blueRoom;
      const item = useSite.getState().unresolved?.find((u) => u.text.trim().toLowerCase() === text.trim().toLowerCase());
      if (item) await s.teach(item, BLUE_ROOM.alias, BLUE_ROOM.elementId);
      await useSite.getState().runAgain(true);
      if (isPlaceholder(text)) return "Blue-room phone text not set: edit web/src/present/beats.ts.";
      await useSite.getState().phoneSend(crewId, text);
      return;
    }
    default:
      return;
  }
}

export function Presenter() {
  const [on, setOn] = useState(presentFromUrl);
  const [hidden, setHidden] = useState(false);
  const [index, setIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | undefined>();
  const done = useRef(new Set<BeatId>());
  const busyRef = useRef(false);

  const go = useCallback(async (next: number, run: boolean) => {
    if (busyRef.current || next < 0 || next >= BEATS.length) return;
    busyRef.current = true;
    setBusy(true);
    setIndex(next);
    setNote(undefined);
    const beat = BEATS[next]!;
    try {
      let skipped: string | undefined;
      if (run && !done.current.has(beat.id)) {
        done.current.add(beat.id);
        skipped = await act(beat.id);
      }
      const v = await view(beat.id);
      setNote(skipped ?? v);
    } catch (err) {
      setNote(`Failed: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        setOn((v) => !v);
        return;
      }
      if (!on) return;
      if (key === "arrowright") {
        e.preventDefault();
        void go(index + 1, true);
      } else if (key === "arrowleft") {
        e.preventDefault();
        void go(index - 1, false);
      } else if (key === "r") {
        e.preventDefault();
        done.current.clear();
        void go(0, true);
      } else if (key === "h") {
        setHidden((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, index, go]);

  if (!on || hidden) return null;
  const beat = BEATS[index];
  return (
    <nav className="presenter" aria-label="Presenter steps">
      <ol>
        {BEATS.map((b, i) => (
          <li key={b.id} aria-current={i === index ? "step" : undefined} className={i < index ? "past" : undefined}>
            {b.title}
          </li>
        ))}
      </ol>
      <p className="meta">
        {busy ? "Working" : beat ? (note ?? beat.note) : "Press → to start. ← back, R reset, H hide."}
      </p>
    </nav>
  );
}
