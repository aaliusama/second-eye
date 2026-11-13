import type { GoldenReplay, StateResponse } from "@site/contracts";
import * as learning from "../learning/index";
import { loadGoldenReplay, loadStartScene } from "../model/load";
import { runReplay } from "../model/replay";

// Owner: A. GET /api/state?t=: the golden replay up to t, memoised. A replay is a pure function of the
// events played and the stored corrections, so the key is (learning version, replay, events up to t).
// Every t between the same two messages shares one entry. Bounded LRU; same key, same response.

export const STATE_AT_MAX = 50;

const cache = new Map<string, Promise<StateResponse>>();

/** How many replay events runReplay plays for `until`: it stops at the first event after it. */
export function eventsUpTo(replay: GoldenReplay, until: string): number {
  const stop = replay.events.findIndex((e) => (e.kind === "message" ? e.message.time : e.time) > until);
  return stop < 0 ? replay.events.length : stop;
}

/** The record as of replay time t, with stored corrections applied, like a new run. */
export async function stateAt(t: string): Promise<StateResponse> {
  const replay = await loadGoldenReplay();
  const version = learning.version();
  const key = `${version}|${replay.id}|${replay.events.length}|${eventsUpTo(replay, t)}`;

  const hit = cache.get(key);
  if (hit) {
    // Most recently used goes last.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const p = (async (): Promise<StateResponse> => {
    const state = await runReplay(replay, learning.applyToScene(await loadStartScene()), t);
    return { t: state.t, scene: state.scene, findings: state.findings, fixes: state.fixes };
  })();
  cache.set(key, p);
  while (cache.size > STATE_AT_MAX) cache.delete(cache.keys().next().value!);
  // Not cached: a failed replay, or one that ran while a correction was stored (mixed learning).
  const forget = () => {
    if (cache.get(key) === p) cache.delete(key);
  };
  p.then(() => {
    if (learning.version() !== version) forget();
  }, forget);
  return p;
}

/** Drop every memoised ?t= state (POST /api/reset, POST /api/corrections). */
export function clearStateAt(): void {
  cache.clear();
}

/** Entries held, for tests. */
export function stateAtSize(): number {
  return cache.size;
}
