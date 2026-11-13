import { useEffect, useRef, useState } from "react";
import { motion } from "./tokens";

// Owner: D. The one place motion is spent: the ghost reveal.
// Sequence (web/AGENTS.md): frame the element, draw the true outline, grow the ghost from the
// true position to the wrong one, then the dimension line and label. Then everything holds still.

export const REVEAL = {
  frameEnd: motion.frame,
  drawEnd: motion.frame + motion.drawTrue,
  growEnd: motion.frame + motion.drawTrue + motion.grow,
  total: motion.frame + motion.drawTrue + motion.grow + motion.dimension,
} as const;

/** 0..1 progress of a phase that runs from `start` to `end` ms. */
export const phase = (elapsed: number, start: number, end: number) =>
  Math.min(1, Math.max(0, (elapsed - start) / (end - start)));

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Plays the reveal once for each ghost key it has not seen. `run` resets what was seen, so
 * "Run again" plays it again. Returns the key being revealed and the elapsed ms (total when done).
 */
export function useReveal(keys: string[], run: number): { key?: string; elapsed: number } {
  const seen = useRef(new Set<string>());
  const lastRun = useRef(run);
  const [reveal, setReveal] = useState<{ key?: string; elapsed: number }>({ elapsed: REVEAL.total });
  const joined = keys.join("|");

  useEffect(() => {
    if (lastRun.current !== run) {
      seen.current.clear();
      lastRun.current = run;
    }
    const next = keys.find((k) => !seen.current.has(k));
    if (!next) return;
    for (const k of keys) seen.current.add(k);

    if (reducedMotion()) {
      setReveal({ key: next, elapsed: REVEAL.total });
      return;
    }
    let raf = 0;
    let done = false;
    const start = performance.now();
    setReveal({ key: next, elapsed: 0 });
    const tick = (now: number) => {
      const elapsed = Math.min(REVEAL.total, now - start);
      setReveal({ key: next, elapsed });
      if (elapsed < REVEAL.total) raf = requestAnimationFrame(tick);
      else done = true;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Interrupted (StrictMode remount, new data): let the next effect play it again.
      if (!done) seen.current.delete(next);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, run]);

  return reveal;
}
