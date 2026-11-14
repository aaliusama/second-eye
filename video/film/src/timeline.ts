// The shot manifest. Scene lengths follow the voice-over: each scene lasts until its last line
// has been spoken plus a short breath (TAIL), and never less than `min` seconds.
// Film.tsx renders exactly this list; STORYBOARD.md describes it for people.
import timing from "./voice-timing.json";

export type SceneId =
  | "opening" | "stat" | "reveal" | "overview" | "build" | "ghost" | "why" | "rehearse"
  | "send" | "confirm" | "ask" | "learn" | "numbers" | "loop" | "end";

export const OVERLAP = 12; // frames of crossfade between consecutive scenes
export const FPS = 30;
const TAIL = 0.7;

export type Line = { file: string; text: string; start: number; dur: number };
export const VOICE = (timing as { engine: string; scenes: Record<string, Line[]> }).scenes;
export const ENGINE = (timing as { engine: string }).engine;

/** Chapters shown in the progress bar. */
export const CHAPTERS = ["The problem", "Second Eye", "Catch it", "Fix it", "It learns", "Proof"] as const;

export const SCENES: { id: SceneId; min: number; chapter: number; source: string; feature: string }[] = [
  { id: "opening", min: 11, chapter: 0, source: "designed (scenario illustration)", feature: "The problem: a change in one thread never reaches another crew" },
  { id: "stat", min: 8, chapter: 0, source: "designed (figure quoted in docs/pitch.md)", feature: "Why it matters: the cost of rework" },
  { id: "reveal", min: 6.5, chapter: 1, source: "designed (brand mark from docs/assets/readme/mark.svg)", feature: "Name and promise" },
  { id: "overview", min: 8, chapter: 1, source: "capture/problem.png", feature: "The superintendent's desk beside the floor plan" },
  { id: "build", min: 10, chapter: 2, source: "capture/build.png", feature: "Build: messages become sourced operations on one record" },
  { id: "ghost", min: 18, chapter: 2, source: "capture/ghost-wall-burst-*.jpg, capture/ghost-wall.png", feature: "Listen + Compare: crew intent checked, the ghost wall, HOLD reply with source" },
  { id: "why", min: 10, chapter: 2, source: "capture/why.png", feature: "Per-crew belief: the floor as Novak Plumbing knows it, Who knows what" },
  { id: "rehearse", min: 10, chapter: 3, source: "capture/rehearse.png", feature: "Rehearse: tomorrow played forward, priorities before work starts" },
  { id: "send", min: 8, chapter: 3, source: "capture/ghost-wall.png -> capture/send.png", feature: "Fix: one-tap correction, amber until confirmed" },
  { id: "confirm", min: 8, chapter: 3, source: "capture/send.png -> capture/confirm.png", feature: "Confirmation of the exact revision, record rechecked" },
  { id: "ask", min: 8, chapter: 3, source: "capture/ask.png, capture/phone-ask.png", feature: "Crew asks, answer from the record with sources" },
  { id: "learn", min: 12, chapter: 4, source: "capture/learn.png -> capture/run-2.png", feature: "Learn: unplaceable nickname mapped once, next run resolves it" },
  { id: "numbers", min: 10, chapter: 5, source: "capture/numbers.png (GET /api/eval)", feature: "Measured results from npm run eval" },
  { id: "loop", min: 9, chapter: 5, source: "designed with real capture crops", feature: "How the steps work together" },
  { id: "end", min: 8, chapter: 5, source: "designed", feature: "Brand, promise, where to try it, boundaries" },
];

export function layout() {
  let at = 0;
  return SCENES.map((s, i) => {
    const lines = VOICE[s.id] ?? [];
    const spoken = lines.length ? lines[lines.length - 1].start + lines[lines.length - 1].dur + TAIL : 0;
    const dur = Math.round(Math.max(s.min, spoken + (i === SCENES.length - 1 ? 2.5 : 0)) * FPS) + OVERLAP;
    const from = at;
    at += dur - (i < SCENES.length - 1 ? OVERLAP : 0);
    return { ...s, from, dur, seconds: dur / FPS, lines };
  });
}

/** Frame (within the scene) at which line i starts. */
export const cue = (id: SceneId, i: number) => Math.round(((VOICE[id]?.[i]?.start ?? 0) * FPS));

export const TOTAL = (() => {
  const l = layout();
  const last = l[l.length - 1];
  return last.from + last.dur;
})();
