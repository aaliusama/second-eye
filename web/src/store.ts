import { API_VERSION, type ChatMessage, type Correction, type EvalResults, type Rehearsal, type StateResponse } from "@site/contracts";
import { fixtureFinding, fixtureFix, fixtureMessages, fixtureScene } from "@site/contracts/fixtures";
import { create } from "zustand";
import { announceChange, api, type AgentLogEntry, type UnresolvedItem } from "./api";

// Owner: D. One store for what the server said. Components select narrowly.

export type Selection = { kind: "element"; id: string } | { kind: "finding"; key: string } | undefined;

interface SiteStore {
  status: "loading" | "ok" | "error";
  error?: string;
  state?: StateResponse;
  messages: ChatMessage[];
  rehearsal?: Rehearsal;
  evalResults?: EvalResults | null;
  /** null = the server has no such route yet (hide the panel). */
  unresolved?: UnresolvedItem[] | null;
  agentLog?: AgentLogEntry[] | null;
  /** What the system has learned (GET /api/corrections). null = the server has no such route. */
  corrections?: Correction[] | null;
  /** The server process is older than this page (its API_VERSION differs): restart it. */
  serverStale?: boolean;
  /** Live extraction is on in the server (LIVE_LLM=1). */
  liveLlm?: boolean;
  /** Show the model as it stood at this replay time (from the record list). Undefined = now. */
  asOf?: string;
  slider: number;
  selection: Selection;
  /** Bumped by "Run again", so the ghost reveal plays again. */
  run: number;
  busy?: string;
  /** Crew phone inset on the main screen. */
  phoneOpen: boolean;
  /** Presenter beat on screen (presenter mode only). Drives what the plan emphasises; never changes data. */
  focus?: string;
  /** Draw the floor as this crew knows it (crew id). Undefined = the record. Display only. */
  lens?: string;
  setLens: (crewId: string | undefined) => void;
  /**
   * A message the presenter sends from the phone. The Phone component picks it up and submits it
   * through its own send path (same API calls as typing), then calls `done`.
   */
  phoneScript?: { nonce: number; crewId: string; text: string; done: () => void };

  refresh: () => Promise<void>;
  setAsOf: (t: string | undefined) => Promise<void>;
  setSlider: (step: number) => void;
  select: (s: Selection) => void;
  approve: (fixId: string) => Promise<void>;
  runAgain: (keepLearning: boolean) => Promise<void>;
  teach: (item: UnresolvedItem, alias: string, elementId: string) => Promise<void>;
  /** Undo a lesson: the server removes the correction and reruns without it. */
  undo: (correctionId: string) => Promise<void>;
  setPhoneOpen: (open: boolean) => void;
  setFocus: (focus: string | undefined) => void;
  /** Open the phone and send `text` as `crewId` through the phone's own send. Resolves when answered. */
  phoneSend: (crewId: string, text: string) => Promise<void>;
  /** Play the ghost reveal again for the ghosts on screen. */
  replayReveal: () => void;
}

const settle = <T,>(p: Promise<T | undefined>): Promise<T | null> => p.then((v) => v ?? null).catch(() => null);
// An older request must not overwrite the state fetched after an approval or replay change.
let refreshVersion = 0;

export const useSite = create<SiteStore>((set, get) => ({
  status: "loading",
  messages: [],
  slider: 0,
  selection: undefined,
  run: 0,
  phoneOpen: false,

  refresh: async () => {
    const version = ++refreshVersion;
    try {
      const [state, messages, rehearsal, evalResults, unresolved, agentLog, corrections, health] = await Promise.all([
        api.state(get().asOf),
        api.messages(),
        api.rehearsal().catch(() => undefined),
        settle(api.eval()),
        settle(api.unresolved()),
        settle(api.agentLog()),
        settle(api.corrections()),
        settle(api.health()),
      ]);
      if (version !== refreshVersion) return;
      set({ status: "ok", error: undefined, state, messages, rehearsal, evalResults, unresolved, agentLog, corrections, serverStale: health?.apiVersion !== API_VERSION, liveLlm: health?.liveLlm });
    } catch (err) {
      if (version !== refreshVersion) return;
      // No server yet: draw the contract fixtures (the ghost-wall case) so the plan still works, and say so.
      if (!get().state) {
        set({
          state: { t: fixtureScene.time, scene: fixtureScene, findings: [fixtureFinding], fixes: [fixtureFix] },
          messages: fixtureMessages,
          evalResults: null,
          unresolved: null,
          agentLog: null,
          corrections: null,
        });
      }
      set({ status: "ok", error: `Server not reachable (${String(err)}). Showing the contract fixtures. Start the server with npm run demo.` });
    }
  },

  setAsOf: async (t) => {
    set({ asOf: t, selection: undefined });
    await get().refresh();
  },

  setSlider: (step) => set({ slider: step }),
  select: (selection) => set({ selection }),

  approve: async (fixId) => {
    set({ busy: fixId });
    try {
      await api.approve(fixId);
      announceChange();
      await get().refresh();
    } catch (err) {
      set({ error: `Fix not sent: ${String(err)}` });
    } finally {
      set({ busy: undefined });
    }
  },

  runAgain: async (keepLearning) => {
    set({ busy: "reset" });
    try {
      await api.reset(keepLearning);
      set({ asOf: undefined, selection: undefined, run: get().run + 1 });
      announceChange();
      await get().refresh();
    } catch (err) {
      set({ error: `Run did not restart: ${String(err)}` });
    } finally {
      set({ busy: undefined });
    }
  },

  teach: async (item, alias, elementId) => {
    const t = get().state?.t;
    if (!t) return;
    set({ busy: item.messageId });
    try {
      await api.correction({
        kind: "location_alias",
        id: `corr-alias-${item.messageId}`,
        time: t,
        sourceMessageId: item.messageId,
        alias,
        elementId,
      });
      announceChange();
      await get().refresh();
    } catch (err) {
      set({ error: `Not stored: ${String(err)}` });
    } finally {
      set({ busy: undefined });
    }
  },

  undo: async (correctionId) => {
    set({ busy: `undo:${correctionId}` });
    try {
      await api.undoCorrection(correctionId);
      set({ asOf: undefined, selection: undefined, run: get().run + 1 });
      announceChange();
      await get().refresh();
    } catch (err) {
      set({ error: `Not undone: ${String(err)}` });
    } finally {
      set({ busy: undefined });
    }
  },

  setPhoneOpen: (phoneOpen) => set({ phoneOpen }),
  setFocus: (focus) => set({ focus }),
  setLens: (lens) => set({ lens }),

  phoneSend: (crewId, text) =>
    new Promise<void>((resolve) => {
      const nonce = (get().phoneScript?.nonce ?? 0) + 1;
      set({ phoneOpen: true, phoneScript: { nonce, crewId, text, done: resolve } });
    }),

  replayReveal: () => set({ run: get().run + 1 }),
}));
