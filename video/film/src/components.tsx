import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color, ease, FONT, H, W } from "./theme";

/** A camera target: the rectangle of the 1440x900 capture (CSS px) that fills the frame width. */
export type Cam = { f: number; x: number; y: number; w: number };
const SRC = { w: 1440, h: 900 };

function camAt(keys: Cam[], frame: number) {
  if (frame <= keys[0].f) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (frame <= b.f) {
      const p = ease.camera((frame - a.f) / (b.f - a.f));
      return { f: frame, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p };
    }
  }
  return keys[keys.length - 1];
}

/** A real product screenshot under a moving camera. Layers crossfade on the same camera. */
export const Shot: React.FC<{
  layers: { src: string; from?: number; fade?: number }[];
  cam: Cam[];
}> = ({ layers, cam }) => {
  const frame = useCurrentFrame();
  const c = camAt(cam, frame);
  const s = W / c.w;
  return (
    <AbsoluteFill style={{ background: color.paper, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: SRC.w,
          height: SRC.h,
          transformOrigin: "0 0",
          transform: `translate(${-c.x * s}px, ${-c.y * s}px) scale(${s})`,
        }}
      >
        {layers.map((l, i) => {
          const from = l.from ?? 0;
          const fade = l.fade ?? 12;
          const o = i === 0 ? 1 : interpolate(frame, [from, from + fade], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return o > 0 ? (
            <Img key={l.src} src={staticFile(l.src)} style={{ position: "absolute", inset: 0, width: SRC.w, height: SRC.h, opacity: o }} />
          ) : null;
        })}
      </div>
    </AbsoluteFill>
  );
};

/** A sequence of real frames (a burst captured from the app), held `hold` video frames each. */
export const Burst: React.FC<{ files: string[]; hold: number; cam: Cam[]; then: string }> = ({ files, hold, cam, then }) => {
  const frame = useCurrentFrame();
  const i = Math.floor(frame / hold);
  const src = i < files.length ? files[i] : then;
  return <Shot layers={[{ src }]} cam={cam} />;
};

/**
 * The caption: an ink slab bottom-left, like a title block on a drawing. Kicker in small caps,
 * a short line that says the benefit. Wipes in, text rises, leaves before the scene ends.
 */
export const Caption: React.FC<{ kicker: string; line: string; sub?: string; at?: number; out: number; side?: "left" | "right" }> = ({
  kicker,
  line,
  sub,
  at = 8,
  out,
  side = "left",
}) => {
  const f = useCurrentFrame();
  const wipe = interpolate(f, [at, at + 16], [0, 1], { easing: ease.arrive, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gone = interpolate(f, [out - 12, out], [1, 0], { easing: ease.leave, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rise = (d: number) => {
    const p = interpolate(f, [at + d, at + d + 18], [0, 1], { easing: ease.arrive, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return { opacity: p, transform: `translateY(${(1 - p) * 14}px)` };
  };
  return (
    <div
      style={{
        position: "absolute",
        bottom: 72,
        [side]: 72,
        maxWidth: 900,
        background: color.ink,
        color: color.paper,
        padding: "26px 34px 30px",
        borderRadius: 6,
        fontFamily: FONT,
        clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
        opacity: gone,
        boxShadow: "0 1px 0 rgb(255 255 255 / .08) inset, 0 18px 40px rgb(28 43 58 / .28)",
      }}
    >
      <div style={{ ...rise(4), fontSize: 19, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: "#A9B7C2" }}>{kicker}</div>
      <div style={{ ...rise(7), fontSize: 46, lineHeight: 1.14, fontWeight: 620, fontStretch: "88%", marginTop: 10, letterSpacing: "-0.01em" }}>{line}</div>
      {sub ? <div style={{ ...rise(11), fontSize: 24, lineHeight: 1.35, marginTop: 12, color: "#C9D3DA", fontWeight: 420 }}>{sub}</div> : null}
    </div>
  );
};

/** An ink outline that draws around a region of the capture, in frame coordinates of the camera. */
export const Mark: React.FC<{ rect: { x: number; y: number; w: number; h: number }; cam: Cam[]; at: number; out?: number; tone?: string }> = ({
  rect,
  cam,
  at,
  out = 99999,
  tone = color.ink,
}) => {
  const f = useCurrentFrame();
  const c = camAt(cam, f);
  const s = W / c.w;
  const x = (rect.x - c.x) * s, y = (rect.y - c.y) * s, w = rect.w * s, h = rect.h * s;
  const per = 2 * (w + h);
  const p = interpolate(f, [at, at + 20], [0, 1], { easing: ease.arrive, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = interpolate(f, [out - 10, out], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: o }}>
      <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} rx={8} fill="none" stroke={tone} strokeWidth={4}
        strokeDasharray={per + 80} strokeDashoffset={(1 - p) * (per + 80)} />
    </svg>
  );
};

/** The drafting dot grid of the product, used as the ground for designed scenes. */
export const Grid: React.FC<{ tone?: string; bg?: string; drift?: number }> = ({ tone = color.paperRule, bg = color.paper, drift = 0 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: bg,
        backgroundImage: `radial-gradient(${tone} 1.6px, transparent 1.7px)`,
        backgroundSize: "36px 36px",
        backgroundPosition: `${-f * drift}px 0px`,
      }}
    />
  );
};

/** Scene envelope: crossfade in and out so cuts read as one continuous film. */
export const Fade: React.FC<{ dur: number; inF?: number; outF?: number; children: React.ReactNode }> = ({ dur, inF = 12, outF = 12, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(
    inF ? interpolate(f, [0, inF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1,
    outF ? interpolate(f, [dur - outF, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1,
  );
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/** Always-on honesty label, as on every screen of the product. */
export const SimLabel: React.FC = () => (
  <div style={{ position: "absolute", top: 36, right: 40, display: "flex", alignItems: "center", gap: 10, background: "rgb(255 255 255 / .92)", padding: "9px 16px", borderRadius: 999, fontFamily: FONT, fontSize: 20, color: color.inkSoft, boxShadow: "0 0 0 1px rgb(28 43 58 / .08)" }}>
    <span style={{ width: 9, height: 9, borderRadius: 9, background: color.pending }} />
    Simulated site data
  </div>
);

/**
 * The spoken line, on the ink title block: the film reads with the sound off.
 * Shows the line being spoken (holds the previous one through pauses), with a short crossfade.
 */
export const VoiceCaption: React.FC<{
  kicker: string;
  lines: { text: string; start: number; dur: number }[];
  dur: number;
  fps: number;
  sides?: { from: number; side: "left" | "right" }[];
  out?: number;
  top?: boolean;
}> = ({ kicker, lines, dur, fps, sides = [{ from: 0, side: "left" }], out, top = false }) => {
  const f = useCurrentFrame();
  if (!lines.length) return null;
  const starts = lines.map((l) => Math.round(l.start * fps));
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i] - 3) idx = i;
  const at = Math.max(0, starts[0] - 6);
  const end = out ?? dur - 8;
  const side = [...sides].reverse().find((s) => f >= s.from)?.side ?? "left";
  const sideSwitch = [...sides].reverse().find((s) => f >= s.from)?.from ?? 0;
  const wipe = interpolate(f, [Math.max(at, sideSwitch), Math.max(at, sideSwitch) + 14], [0, 1], { easing: ease.arrive, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gone = interpolate(f, [end - 10, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const t = interpolate(f, [starts[idx] - 3, starts[idx] + 6], [0, 1], { easing: ease.arrive, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const k = interpolate(f, [at + 4, at + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const text = lines[idx].text;
  return (
    <div
      style={{
        position: "absolute",
        ...(top ? { top: 112 } : { bottom: 64 }),
        [side]: 64,
        width: text.length > 70 ? 980 : 860,
        background: color.ink,
        color: color.paper,
        padding: "24px 32px 28px",
        borderRadius: 6,
        fontFamily: FONT,
        clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
        opacity: gone,
        boxShadow: "0 1px 0 rgb(255 255 255 / .08) inset, 0 18px 40px rgb(28 43 58 / .3)",
      }}
    >
      <div style={{ opacity: k, fontSize: 18, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: "#A9B7C2" }}>{kicker}</div>
      <div style={{ opacity: t, transform: `translateY(${(1 - t) * 8}px)`, fontSize: text.length > 90 ? 36 : 42, lineHeight: 1.18, fontWeight: 600, fontStretch: "90%", marginTop: 10, letterSpacing: "-0.005em" }}>
        {text}
      </div>
    </div>
  );
};

/** Where we are in the story: six chapters, the current one filling as it plays. */
export const ChapterBar: React.FC<{ chapters: readonly string[]; active: number; progress: number }> = ({ chapters, active, progress }) => (
  <div style={{ position: "absolute", top: 34, left: 40, display: "flex", gap: 6, padding: 6, borderRadius: 10, background: "rgb(255 255 255 / .94)", boxShadow: "0 0 0 1px rgb(28 43 58 / .1), 0 8px 20px rgb(28 43 58 / .12)", fontFamily: FONT }}>
    {chapters.map((c, i) => (
      <div key={c} style={{ position: "relative", padding: "8px 14px 10px", borderRadius: 6, fontSize: 19, fontWeight: i === active ? 650 : 500, color: i === active ? color.paper : i < active ? color.ink : color.inkSoft, background: i === active ? color.ink : "transparent", overflow: "hidden" }}>
        {c}
        {i === active ? <div style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${progress * 100}%`, background: "#A9B7C2" }} /> : null}
      </div>
    ))}
  </div>
);
